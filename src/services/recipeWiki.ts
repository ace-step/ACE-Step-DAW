/**
 * Recipe Wiki — Global generation knowledge base that improves over time.
 * Accumulates empirical data about generation parameters and prompts
 * organized by genre/style/technique.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1452
 */

import { get, set, keys } from 'idb-keyval';
import type {
  RecipeEntry,
  RecipeParams,
  GenreRecipe,
  PromptStat,
  FailureRecord,
  ParameterSuggestion,
  RecipeWikiExport,
} from '../types/recipeWiki';
import type { GenerationEvent } from '../types/sessionMemory';

const ENTRY_PREFIX = 'recipe:entry:';
const GENRE_PREFIX = 'recipe:genre:';
const GENRE_INDEX_PREFIX = 'recipe:genre-entries:';

// Minimum generations before we consider recommendations reliable
const MIN_SAMPLE_FOR_HIGH_CONFIDENCE = 20;

/** Normalize genre string for consistent storage keys (lowercase, hyphenated). */
function normalizeGenre(genre: string): string {
  return genre.toLowerCase().replace(/\s+/g, '-').trim();
}

export class RecipeWiki {
  // ─── Ingest ──────────────────────────────────────────────────────────

  async ingest(event: GenerationEvent): Promise<RecipeEntry> {
    const rawGenre = event.inferredMetas?.genres?.[0] ?? 'Unknown';
    const genre = normalizeGenre(rawGenre);
    const entry: RecipeEntry = {
      id: generateEntryId(),
      timestamp: event.timestamp,
      genre,
      prompt: event.prompt,
      lyrics: event.lyrics,
      taskType: event.params.taskType,
      params: {
        cfgStrength: event.params.cfgStrength,
        steps: event.params.steps,
        shift: event.params.shift,
        duration: event.params.duration,
        modelId: event.params.modelId,
        seed: event.inferredMetas?.seed,
        bpm: event.inferredMetas?.bpm,
        keyScale: event.inferredMetas?.keyScale,
      },
      outcome: event.type === 'generation_failed' ? 'failed' : event.result,
      userRating: event.userRating,
      tags: extractTags(event.prompt),
    };

    await set(`${ENTRY_PREFIX}${entry.id}`, entry);
    await this.addToGenreIndex(genre, entry.id);
    await this.updateGenreRecipe(genre);

    return entry;
  }

  // ─── Query ───────────────────────────────────────────────────────────

  async query(genre: string, taskType: string): Promise<ParameterSuggestion | null> {
    const normalized = normalizeGenre(genre);
    const recipe = await get<GenreRecipe>(`${GENRE_PREFIX}${normalized}`);
    if (!recipe) return null;

    const confidence = computeConfidence(recipe.totalGenerations, recipe.averageRating);

    return {
      genre: recipe.genre,
      params: recipe.recommendedParams,
      confidence,
      sampleSize: recipe.totalGenerations,
      reasoning: buildReasoning(recipe),
    };
  }

  // ─── Genre Recipe Aggregation ────────────────────────────────────────

  buildGenreRecipe(genre: string, entries: RecipeEntry[]): GenreRecipe {
    const successful = entries.filter(e => e.outcome === 'kept');
    const failed = entries.filter(e => e.outcome === 'failed');

    const ratings = entries
      .filter(e => e.userRating !== undefined)
      .map(e => e.userRating!);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;

    const bestPrompts = buildPromptStats(entries);
    const recommendedParams = computeRecommendedParams(entries);
    const knownFailures = buildFailureRecords(entries);

    return {
      genre,
      totalGenerations: entries.length,
      successfulGenerations: successful.length,
      failedGenerations: failed.length,
      averageRating,
      bestPrompts,
      recommendedParams,
      knownFailures,
      lastUpdated: Date.now(),
    };
  }

  // ─── List Genres ─────────────────────────────────────────────────────

  async listGenres(): Promise<GenreRecipe[]> {
    const allKeys = await keys();
    const genreKeys = allKeys.filter(
      (k): k is string => typeof k === 'string' && k.startsWith(GENRE_PREFIX)
    );

    const recipes: GenreRecipe[] = [];
    for (const key of genreKeys) {
      const recipe = await get<GenreRecipe>(key);
      if (recipe) recipes.push(recipe);
    }

    return recipes;
  }

  // ─── Export / Import ─────────────────────────────────────────────────

  async exportWiki(): Promise<RecipeWikiExport> {
    const allKeys = await keys();

    const entryKeys = allKeys.filter(
      (k): k is string => typeof k === 'string' && k.startsWith(ENTRY_PREFIX)
    );
    const genreKeys = allKeys.filter(
      (k): k is string => typeof k === 'string' && k.startsWith(GENRE_PREFIX)
    );

    const entries: RecipeEntry[] = [];
    for (const key of entryKeys) {
      const entry = await get<RecipeEntry>(key);
      if (entry) entries.push(entry);
    }

    const genres: GenreRecipe[] = [];
    for (const key of genreKeys) {
      const recipe = await get<GenreRecipe>(key);
      if (recipe) genres.push(recipe);
    }

    return {
      version: 1,
      exportedAt: Date.now(),
      entries,
      genres,
    };
  }

  async importWiki(data: RecipeWikiExport): Promise<void> {
    if (data.version !== 1) {
      throw new Error('Unsupported wiki export version');
    }

    // Store all entries
    for (const entry of data.entries) {
      await set(`${ENTRY_PREFIX}${entry.id}`, entry);
    }

    // Rebuild genre recipes from imported entries
    const genreMap = new Map<string, RecipeEntry[]>();
    for (const entry of data.entries) {
      const list = genreMap.get(entry.genre) ?? [];
      list.push(entry);
      genreMap.set(entry.genre, list);
    }

    for (const [genre, entries] of genreMap) {
      const recipe = this.buildGenreRecipe(genre, entries);
      await set(`${GENRE_PREFIX}${genre}`, recipe);
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private async addToGenreIndex(genre: string, entryId: string): Promise<void> {
    const indexKey = `${GENRE_INDEX_PREFIX}${genre}`;
    const existing = await get<string[]>(indexKey) ?? [];
    existing.push(entryId);
    await set(indexKey, existing);
  }

  private async updateGenreRecipe(genre: string): Promise<void> {
    const indexKey = `${GENRE_INDEX_PREFIX}${genre}`;
    const entryIds = await get<string[]>(indexKey) ?? [];

    const entries: RecipeEntry[] = [];
    for (const id of entryIds) {
      const entry = await get<RecipeEntry>(`${ENTRY_PREFIX}${id}`);
      if (entry) entries.push(entry);
    }

    const recipe = this.buildGenreRecipe(genre, entries);
    await set(`${GENRE_PREFIX}${genre}`, recipe);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractTags(prompt: string): string[] {
  const words = prompt.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this']);
  return [...new Set(words.filter(w => !stopWords.has(w)))];
}

function computeConfidence(sampleSize: number, averageRating: number | null): number {
  // Base confidence from sample size (0-0.7)
  const sizeFactor = Math.min(sampleSize / MIN_SAMPLE_FOR_HIGH_CONFIDENCE, 1) * 0.7;
  // Rating bonus (0-0.3)
  const ratingFactor = averageRating !== null ? (averageRating / 5) * 0.3 : 0;
  return Math.min(sizeFactor + ratingFactor, 1);
}

function buildReasoning(recipe: GenreRecipe): string {
  const parts: string[] = [];
  parts.push(`Based on ${recipe.totalGenerations} generation${recipe.totalGenerations !== 1 ? 's' : ''}`);
  if (recipe.averageRating !== null) {
    parts.push(`average rating ${recipe.averageRating.toFixed(1)}/5`);
  }
  if (recipe.bestPrompts.length > 0) {
    parts.push(`top prompt: "${recipe.bestPrompts[0].prompt}"`);
  }
  return parts.join(', ');
}

function buildPromptStats(entries: RecipeEntry[]): PromptStat[] {
  const promptMap = new Map<string, RecipeEntry[]>();
  for (const entry of entries) {
    const list = promptMap.get(entry.prompt) ?? [];
    list.push(entry);
    promptMap.set(entry.prompt, list);
  }

  const stats: PromptStat[] = [];
  for (const [prompt, group] of promptMap) {
    const ratings = group.filter(e => e.userRating !== undefined).map(e => e.userRating!);
    const kept = group.filter(e => e.outcome === 'kept').length;
    stats.push({
      prompt,
      count: group.length,
      averageRating: ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null,
      keptRate: group.length > 0 ? kept / group.length : 0,
    });
  }

  // Sort by kept rate * average rating (best prompts first)
  stats.sort((a, b) => {
    const scoreA = a.keptRate * (a.averageRating ?? 3);
    const scoreB = b.keptRate * (b.averageRating ?? 3);
    return scoreB - scoreA;
  });

  return stats.slice(0, 10);
}

function computeRecommendedParams(entries: RecipeEntry[]): RecipeParams {
  // Weight by user rating (higher-rated entries have more influence)
  const rated = entries.filter(e => e.userRating !== undefined && e.userRating >= 3);
  const source = rated.length >= 2 ? rated : entries;

  const weights = source.map(e => e.userRating ?? 3);

  function weightedAvg(getter: (e: RecipeEntry) => number | undefined): number | undefined {
    let sum = 0;
    let wSum = 0;
    for (let i = 0; i < source.length; i++) {
      const val = getter(source[i]);
      if (val !== undefined) {
        sum += val * weights[i];
        wSum += weights[i];
      }
    }
    return wSum > 0 ? sum / wSum : undefined;
  }

  const avgSteps = weightedAvg(e => e.params.steps);
  const avgDuration = weightedAvg(e => e.params.duration);
  const avgBpm = weightedAvg(e => e.params.bpm);

  return {
    cfgStrength: weightedAvg(e => e.params.cfgStrength),
    steps: avgSteps !== undefined ? Math.round(avgSteps) : undefined,
    shift: weightedAvg(e => e.params.shift),
    duration: avgDuration !== undefined ? Math.round(avgDuration) : undefined,
    bpm: avgBpm !== undefined ? Math.round(avgBpm) : undefined,
    keyScale: findMostCommon(source.map(e => e.params.keyScale).filter((k): k is string => k !== undefined)),
  };
}

function findMostCommon(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function buildFailureRecords(entries: RecipeEntry[]): FailureRecord[] {
  const failed = entries.filter(e => e.outcome === 'failed');
  // Group by prompt + key params to identify specific problematic combinations
  const groupMap = new Map<string, RecipeEntry[]>();
  for (const entry of failed) {
    const paramsKey = `cfg=${entry.params.cfgStrength ?? '?'},steps=${entry.params.steps ?? '?'}`;
    const key = `${entry.prompt}||${paramsKey}`;
    const list = groupMap.get(key) ?? [];
    list.push(entry);
    groupMap.set(key, list);
  }

  const records: FailureRecord[] = [];
  for (const [, group] of groupMap) {
    records.push({
      prompt: group[0].prompt,
      params: group[0].params,
      count: group.length,
      lastSeen: Math.max(...group.map(e => e.timestamp)),
    });
  }

  return records.sort((a, b) => b.count - a.count).slice(0, 10);
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: RecipeWiki | null = null;

export function getRecipeWiki(): RecipeWiki {
  if (!_instance) {
    _instance = new RecipeWiki();
  }
  return _instance;
}

export function resetRecipeWiki(): void {
  _instance = null;
}

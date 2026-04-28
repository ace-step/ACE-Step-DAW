/**
 * Generation Recipe Wiki — stores empirical data about effective generation parameters.
 * Organized by genre/style, queryable for parameter suggestions, exportable/importable.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1452
 */

import { get, set } from 'idb-keyval';
import type {
  RecipeEntry,
  RecipeQuery,
  RecipeSuggestion,
  GenreStat,
  RecipeWikiExport,
} from '../types/recipeWiki';
import { RECIPE_WIKI_VERSION } from '../types/recipeWiki';
import type { GenerationEvent } from '../types/sessionMemory';

const WIKI_RECIPE_KEY = 'wiki:recipe:entries';

export class RecipeWiki {
  private entries: RecipeEntry[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const stored = await get<RecipeEntry[]>(WIKI_RECIPE_KEY);
    if (Array.isArray(stored)) {
      this.entries = stored;
    }
    this.initialized = true;
  }

  // ─── Ingest ──────────────────────────────────────────────────────────

  async ingest(event: GenerationEvent): Promise<void> {
    const entry: RecipeEntry = {
      id: `recipe-${event.clipId}-${event.timestamp}`,
      prompt: event.prompt,
      genres: extractGenres(event),
      params: {
        taskType: event.params.taskType,
        cfgStrength: event.params.cfgStrength,
        steps: event.params.steps,
        shift: event.params.shift,
        duration: event.params.duration,
      },
      success: event.type === 'generation_complete',
      rating: event.userRating,
      timestamp: event.timestamp,
      bpm: event.inferredMetas?.bpm,
      keyScale: event.inferredMetas?.keyScale,
      modelId: event.params.modelId,
      errorMessage: event.errorMessage,
    };

    this.entries.push(entry);
    await this.persist();
  }

  // ─── Query ──────────────────────────────────────────────────────────

  getAllEntries(): RecipeEntry[] {
    return [...this.entries];
  }

  query(filter: RecipeQuery): RecipeEntry[] {
    return this.entries.filter(entry => {
      if (filter.genre && !entry.genres.includes(filter.genre)) return false;
      if (filter.minRating !== undefined && (entry.rating ?? 0) < filter.minRating) return false;
      if (filter.taskType && entry.params.taskType !== filter.taskType) return false;
      if (filter.successOnly && !entry.success) return false;
      return true;
    });
  }

  // ─── Parameter Suggestions ──────────────────────────────────────────

  suggestParameters(genre: string): RecipeSuggestion | null {
    const matches = this.entries.filter(
      e => e.success && e.genres.includes(genre) && e.rating !== undefined
    );

    if (matches.length === 0) return null;

    // Weighted average by rating, excluding entries missing a given param
    let weightedCfg = 0, cfgWeight = 0;
    let weightedSteps = 0, stepsWeight = 0;
    let weightedShift = 0, shiftWeight = 0;

    for (const entry of matches) {
      const weight = entry.rating ?? 1;
      if (entry.params.cfgStrength !== undefined) {
        weightedCfg += entry.params.cfgStrength * weight;
        cfgWeight += weight;
      }
      if (entry.params.steps !== undefined) {
        weightedSteps += entry.params.steps * weight;
        stepsWeight += weight;
      }
      if (entry.params.shift !== undefined) {
        weightedShift += entry.params.shift * weight;
        shiftWeight += weight;
      }
    }

    if (cfgWeight === 0 && stepsWeight === 0 && shiftWeight === 0) return null;

    return {
      cfgStrength: cfgWeight > 0 ? weightedCfg / cfgWeight : 0,
      steps: stepsWeight > 0 ? Math.round(weightedSteps / stepsWeight) : 0,
      shift: shiftWeight > 0 ? weightedShift / shiftWeight : 0,
      confidence: Math.min(matches.length / 10, 1),
      sampleSize: matches.length,
    };
  }

  // ─── Genre Stats ────────────────────────────────────────────────────

  getGenreStats(): Map<string, GenreStat> {
    const stats = new Map<string, { count: number; ratingSum: number; ratingCount: number; successCount: number }>();

    for (const entry of this.entries) {
      for (const genre of entry.genres) {
        const existing = stats.get(genre) ?? { count: 0, ratingSum: 0, ratingCount: 0, successCount: 0 };
        existing.count++;
        if (entry.rating !== undefined) {
          existing.ratingSum += entry.rating;
          existing.ratingCount++;
        }
        if (entry.success) existing.successCount++;
        stats.set(genre, existing);
      }
    }

    const result = new Map<string, GenreStat>();
    for (const [genre, data] of stats) {
      result.set(genre, {
        count: data.count,
        averageRating: data.ratingCount > 0 ? data.ratingSum / data.ratingCount : 0,
        successRate: data.count > 0 ? data.successCount / data.count : 0,
      });
    }
    return result;
  }

  // ─── Export / Import ────────────────────────────────────────────────

  export(): RecipeWikiExport {
    return {
      version: RECIPE_WIKI_VERSION,
      entries: JSON.parse(JSON.stringify(this.entries)) as RecipeEntry[],
      exportedAt: Date.now(),
    };
  }

  async import(data: RecipeWikiExport): Promise<void> {
    if (data.version !== RECIPE_WIKI_VERSION) {
      throw new Error(`Unsupported recipe wiki version: ${data.version}`);
    }

    const seenIds = new Set(this.entries.map(e => e.id));
    const newEntries: RecipeEntry[] = [];
    for (const entry of data.entries) {
      if (seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      newEntries.push(entry);
    }
    this.entries.push(...newEntries);
    await this.persist();
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await set(WIKI_RECIPE_KEY, this.entries);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractGenres(event: GenerationEvent): string[] {
  if (event.inferredMetas?.genres && event.inferredMetas.genres.length > 0) {
    return event.inferredMetas.genres;
  }
  return extractGenresFromPrompt(event.prompt);
}

const KNOWN_GENRES = [
  'lo-fi', 'hip-hop', 'jazz', 'rock', 'pop', 'electronic', 'ambient',
  'classical', 'r&b', 'soul', 'funk', 'metal', 'punk', 'country',
  'blues', 'reggae', 'folk', 'indie', 'edm', 'techno', 'house',
  'trap', 'drill', 'dubstep', 'dnb', 'drum and bass', 'gospel',
  'latin', 'bossa nova', 'k-pop', 'j-pop', 'afrobeat',
];

function extractGenresFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  return KNOWN_GENRES.filter(g => lower.includes(g));
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _instance: RecipeWiki | null = null;

export async function getRecipeWiki(): Promise<RecipeWiki> {
  if (!_instance) {
    _instance = new RecipeWiki();
    await _instance.initialize();
  }
  return _instance;
}

export function resetRecipeWiki(): void {
  _instance = null;
}

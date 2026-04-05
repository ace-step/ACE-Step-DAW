/**
 * Recipe Wiki Integration — Connects SessionMemory events to the RecipeWiki.
 * Auto-ingests generation events into the wiki for parameter learning.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1452
 */

import { getSessionMemory } from './sessionMemory';
import { getRecipeWiki } from './recipeWiki';
import { classifyEvent } from '../types/sessionMemory';
import type { GenerationEvent, SessionEvent } from '../types/sessionMemory';
import type { ParameterSuggestion } from '../types/recipeWiki';
import { GENERATION_PRESETS, type GenerationPreset } from '../constants/generationPresets';

let _unsubscribe: (() => void) | null = null;

/**
 * Start auto-ingesting generation events from SessionMemory into RecipeWiki.
 * Call once during app initialization.
 */
export function startRecipeWikiIngest(): void {
  if (_unsubscribe) return;

  const memory = getSessionMemory();
  const wiki = getRecipeWiki();

  _unsubscribe = memory.onFlush((events: SessionEvent[]) => {
    const genEvents = events.filter(
      (e): e is GenerationEvent => classifyEvent(e) === 'generation'
    );

    for (const event of genEvents) {
      void wiki.ingest(event).catch(() => {
        // Silently handle ingest failures (IndexedDB quota, serialization)
        // to avoid unhandled promise rejections
      });
    }
  });
}

export function stopRecipeWikiIngest(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

/**
 * Get parameter suggestions for a genre, falling back to static presets.
 */
export async function getSmartDefaults(
  genre: string,
  taskType: string,
): Promise<{ suggestion: ParameterSuggestion | null; fallbackPreset: GenerationPreset | null }> {
  const wiki = getRecipeWiki();
  const suggestion = await wiki.query(genre, taskType);

  const fallbackPreset = GENERATION_PRESETS.find(p =>
    p.category.toLowerCase() === genre.toLowerCase() ||
    p.name.toLowerCase().includes(genre.toLowerCase())
  ) ?? null;

  return { suggestion, fallbackPreset };
}

/**
 * Generate dynamic presets from wiki data, supplementing static ones.
 * Wiki-derived presets are marked with `source: 'wiki'`.
 */
export interface DynamicPreset {
  id: string;
  name: string;
  caption: string;
  lyricsTemplate: string;
  suggestedBpm: number;
  suggestedKey: string;
  source: 'static' | 'wiki';
  /** Original category for static presets */
  category?: GenerationPreset['category'];
  /** Learned genre name for wiki presets (may not match static categories) */
  learnedGenre?: string;
  sampleSize?: number;
}

export async function getDynamicPresets(): Promise<DynamicPreset[]> {
  const wiki = getRecipeWiki();
  const genres = await wiki.listGenres();

  const staticPresets: DynamicPreset[] = GENERATION_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    caption: p.caption,
    lyricsTemplate: p.lyricsTemplate,
    suggestedBpm: p.suggestedBpm,
    suggestedKey: p.suggestedKey,
    source: 'static' as const,
    category: p.category,
  }));

  const wikiPresets: DynamicPreset[] = genres
    .filter(g => g.totalGenerations >= 3 && g.bestPrompts.length > 0)
    .map(g => ({
      id: `wiki-${g.genre}`,
      name: `${g.genre} (Learned)`,
      caption: g.bestPrompts[0]?.prompt ?? '',
      lyricsTemplate: '',
      suggestedBpm: g.recommendedParams.bpm ?? 120,
      suggestedKey: g.recommendedParams.keyScale ?? 'C major',
      source: 'wiki' as const,
      learnedGenre: g.genre,
      sampleSize: g.totalGenerations,
    }));

  return [...staticPresets, ...wikiPresets];
}

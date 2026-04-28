/**
 * User Preference Learning — builds a taste profile from generation history.
 * Queries RecipeWiki for usage patterns and extracts genre affinities,
 * BPM ranges, key preferences, and personalized preset suggestions.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1098
 */

import { get, set } from 'idb-keyval';
import { getRecipeWiki } from './recipeWiki';
import type {
  UserPreferences,
  GenreAffinity,
  BpmRange,
  PersonalizedPreset,
} from '../types/userPreferences';
import { EMPTY_PREFERENCES } from '../types/userPreferences';
import type { RecipeEntry } from '../types/recipeWiki';

const PREFS_KEY = 'wiki:user-preferences';
const MAX_TOP_GENRES = 10;
const MAX_TOP_KEYS = 5;
const MIN_RATING_FOR_PREFERENCE = 3;

export class UserPreferencesService {
  /**
   * Compute preferences from all generation history in RecipeWiki.
   */
  async computePreferences(): Promise<UserPreferences> {
    const wiki = await getRecipeWiki();
    const entries = wiki.getAllEntries();

    if (entries.length === 0) return EMPTY_PREFERENCES;

    const successful = entries.filter(e => e.success);
    const rated = successful.filter(e => e.rating !== undefined && e.rating >= MIN_RATING_FOR_PREFERENCE);

    const topGenres = computeGenreAffinities(entries);
    const bpmRange = computeBpmRange(rated);
    const preferredKeys = computePreferredKeys(rated);
    const instrumentPreferences = extractKeywordsFromPrompts(rated, INSTRUMENT_KEYWORDS);
    const moodPreferences = extractKeywordsFromPrompts(rated, MOOD_KEYWORDS);

    const prefs: UserPreferences = {
      topGenres,
      bpmRange,
      preferredKeys,
      instrumentPreferences,
      moodPreferences,
      generationCount: entries.length,
      successfulCount: successful.length,
      lastUpdated: Date.now(),
    };

    await set(PREFS_KEY, prefs);
    return prefs;
  }

  /**
   * Get cached preferences (fast, no recomputation).
   */
  async getCachedPreferences(): Promise<UserPreferences | null> {
    return (await get<UserPreferences>(PREFS_KEY)) ?? null;
  }

  /**
   * Generate personalized preset suggestions based on preferences.
   * Uses provided preferences when available, otherwise falls back to
   * cached preferences and only recomputes if the cache is missing.
   */
  async getSuggestedPresets(preferences?: UserPreferences): Promise<PersonalizedPreset[]> {
    const prefs = preferences ?? (await this.getCachedPreferences()) ?? (await this.computePreferences());
    if (prefs.generationCount === 0) return [];

    const presets: PersonalizedPreset[] = [];

    for (const genre of prefs.topGenres.slice(0, 3)) {
      if (genre.count < 2) continue;

      const key = prefs.preferredKeys[0] ?? 'C major';
      const bpm = prefs.bpmRange.preferred;

      presets.push({
        id: `suggested-${genre.genre}`,
        name: `My ${capitalize(genre.genre)}`,
        caption: buildCaption(genre.genre, prefs),
        bpm,
        keyScale: key,
        reason: `Based on ${genre.count} generations, avg rating ${genre.averageRating.toFixed(1)}/5`,
      });
    }

    return presets;
  }

  /**
   * Clear all preference data.
   */
  async clearPreferences(): Promise<void> {
    await set(PREFS_KEY, EMPTY_PREFERENCES);
  }
}

// ─── Computation Helpers ────────────────────────────────────────────────────

function computeGenreAffinities(entries: RecipeEntry[]): GenreAffinity[] {
  const genreMap = new Map<string, { count: number; ratingSum: number; ratingCount: number; successCount: number }>();

  for (const entry of entries) {
    for (const genre of entry.genres) {
      const data = genreMap.get(genre) ?? { count: 0, ratingSum: 0, ratingCount: 0, successCount: 0 };
      data.count++;
      if (entry.rating !== undefined) {
        data.ratingSum += entry.rating;
        data.ratingCount++;
      }
      if (entry.success) data.successCount++;
      genreMap.set(genre, data);
    }
  }

  const affinities: GenreAffinity[] = [];
  for (const [genre, data] of genreMap) {
    // Skip genres with only failures
    if (data.successCount === 0) continue;

    const avgRating = data.ratingCount > 0 ? data.ratingSum / data.ratingCount : 0;
    // Weight = count * avgRating (frequency + quality)
    const weight = data.count * (avgRating || 1);

    affinities.push({
      genre,
      weight,
      count: data.count,
      averageRating: avgRating,
    });
  }

  affinities.sort((a, b) => b.weight - a.weight);
  return affinities.slice(0, MAX_TOP_GENRES);
}

function computeBpmRange(ratedEntries: RecipeEntry[]): BpmRange {
  const bpms = ratedEntries
    .filter(e => e.bpm !== undefined)
    .map(e => ({ bpm: e.bpm!, rating: e.rating ?? 3 }));

  if (bpms.length === 0) return { min: 60, max: 180, preferred: 120 };

  const values = bpms.map(b => b.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Weighted average by rating for preferred
  let weightedSum = 0;
  let totalWeight = 0;
  for (const b of bpms) {
    weightedSum += b.bpm * b.rating;
    totalWeight += b.rating;
  }
  const preferred = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 120;

  return { min, max, preferred };
}

function computePreferredKeys(ratedEntries: RecipeEntry[]): string[] {
  const keyCounts = new Map<string, { count: number; ratingSum: number }>();

  for (const entry of ratedEntries) {
    if (!entry.keyScale) continue;
    const data = keyCounts.get(entry.keyScale) ?? { count: 0, ratingSum: 0 };
    data.count++;
    data.ratingSum += entry.rating ?? 3;
    keyCounts.set(entry.keyScale, data);
  }

  return [...keyCounts.entries()]
    .sort((a, b) => {
      const scoreA = a[1].count * (a[1].ratingSum / a[1].count);
      const scoreB = b[1].count * (b[1].ratingSum / b[1].count);
      return scoreB - scoreA;
    })
    .slice(0, MAX_TOP_KEYS)
    .map(([key]) => key);
}

const INSTRUMENT_KEYWORDS = [
  'piano', 'guitar', 'bass', 'drums', 'synth', 'strings', 'brass',
  'saxophone', 'violin', 'trumpet', 'organ', 'flute', 'harp',
];

const MOOD_KEYWORDS = [
  'chill', 'energetic', 'dark', 'bright', 'melancholic', 'upbeat',
  'dreamy', 'aggressive', 'peaceful', 'dramatic', 'nostalgic', 'warm',
];

function extractKeywordsFromPrompts(
  entries: RecipeEntry[],
  keywords: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    const lower = entry.prompt.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        counts[kw] = (counts[kw] ?? 0) + (entry.rating ?? 3);
      }
    }
  }

  return counts;
}

function buildCaption(genre: string, prefs: UserPreferences): string {
  const topMoods = Object.entries(prefs.moodPreferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([mood]) => mood);

  const topInstruments = Object.entries(prefs.instrumentPreferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([inst]) => inst);

  const parts = [genre];
  if (topMoods.length > 0) parts.push(topMoods.join(', '));
  if (topInstruments.length > 0) parts.push(topInstruments.join(' and '));

  return parts.join(', ');
}

function capitalize(s: string): string {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: UserPreferencesService | null = null;

export function getUserPreferencesService(): UserPreferencesService {
  if (!_instance) _instance = new UserPreferencesService();
  return _instance;
}

export function resetUserPreferences(): void {
  _instance = null;
}

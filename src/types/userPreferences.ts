/**
 * User Preference Learning types — builds a taste profile from generation history.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1098
 */

// ─── Preference Profile ─────────────────────────────────────────────────────

export interface UserPreferences {
  topGenres: GenreAffinity[];
  bpmRange: BpmRange;
  preferredKeys: string[];
  instrumentPreferences: Record<string, number>;
  moodPreferences: Record<string, number>;
  generationCount: number;
  successfulCount: number;
  lastUpdated: number;
}

export interface GenreAffinity {
  genre: string;
  weight: number;
  count: number;
  averageRating: number;
}

export interface BpmRange {
  min: number;
  max: number;
  preferred: number;
}

// ─── Personalized Suggestion ────────────────────────────────────────────────

export interface PersonalizedPreset {
  id: string;
  name: string;
  caption: string;
  bpm: number;
  keyScale: string;
  reason: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const EMPTY_PREFERENCES: UserPreferences = {
  topGenres: [],
  bpmRange: { min: 60, max: 180, preferred: 120 },
  preferredKeys: [],
  instrumentPreferences: {},
  moodPreferences: {},
  generationCount: 0,
  successfulCount: 0,
  lastUpdated: 0,
};

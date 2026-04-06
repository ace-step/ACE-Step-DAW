import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
}));

// Mock RecipeWiki
const mockGetAllEntries = vi.fn();
const mockGetGenreStats = vi.fn();
vi.mock('../recipeWiki', () => ({
  getRecipeWiki: vi.fn().mockResolvedValue({
    getAllEntries: () => mockGetAllEntries(),
    getGenreStats: () => mockGetGenreStats(),
    suggestParameters: vi.fn(),
  }),
}));

import {
  UserPreferencesService,
  resetUserPreferences,
} from '../userPreferences';
import type { RecipeEntry } from '../../types/recipeWiki';
import { EMPTY_PREFERENCES } from '../../types/userPreferences';

function makeEntry(overrides: Partial<RecipeEntry> = {}): RecipeEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 6)}`,
    prompt: 'lo-fi chill beat with jazzy piano',
    genres: ['lo-fi', 'jazz'],
    params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
    success: true,
    rating: 4,
    timestamp: Date.now(),
    bpm: 85,
    keyScale: 'C minor',
    ...overrides,
  };
}

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset().mockResolvedValue(undefined);
    mockGetAllEntries.mockReturnValue([]);
    mockGetGenreStats.mockReturnValue(new Map());
    resetUserPreferences();
    service = new UserPreferencesService();
  });

  // ─── Empty State ───────────────────────────────────────────────────────

  describe('empty state', () => {
    it('returns empty preferences when no data', async () => {
      const prefs = await service.computePreferences();
      expect(prefs.generationCount).toBe(0);
      expect(prefs.topGenres).toEqual([]);
      expect(prefs.preferredKeys).toEqual([]);
    });
  });

  // ─── Genre Extraction ──────────────────────────────────────────────────

  describe('genre preferences', () => {
    it('ranks genres by weighted frequency and rating', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['lo-fi', 'jazz'], rating: 5 }),
        makeEntry({ genres: ['lo-fi'], rating: 4 }),
        makeEntry({ genres: ['lo-fi'], rating: 4 }),
        makeEntry({ genres: ['rock'], rating: 3 }),
      ]);

      const prefs = await service.computePreferences();

      expect(prefs.topGenres.length).toBeGreaterThan(0);
      expect(prefs.topGenres[0].genre).toBe('lo-fi');
      expect(prefs.topGenres[0].count).toBe(3);
      expect(prefs.topGenres[0].averageRating).toBeCloseTo(4.33, 1);
    });

    it('limits top genres to 10', async () => {
      const entries = Array.from({ length: 15 }, (_, i) =>
        makeEntry({ genres: [`genre-${i}`], rating: 3 })
      );
      mockGetAllEntries.mockReturnValue(entries);

      const prefs = await service.computePreferences();
      expect(prefs.topGenres.length).toBeLessThanOrEqual(10);
    });

    it('filters out genres with only failed generations', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['good-genre'], success: true, rating: 4 }),
        makeEntry({ genres: ['bad-genre'], success: false, rating: undefined }),
      ]);

      const prefs = await service.computePreferences();
      const genreNames = prefs.topGenres.map(g => g.genre);
      expect(genreNames).toContain('good-genre');
      expect(genreNames).not.toContain('bad-genre');
    });
  });

  // ─── BPM Range ─────────────────────────────────────────────────────────

  describe('BPM preferences', () => {
    it('computes BPM range from kept entries', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ bpm: 80, success: true, rating: 4 }),
        makeEntry({ bpm: 90, success: true, rating: 5 }),
        makeEntry({ bpm: 85, success: true, rating: 4 }),
        makeEntry({ bpm: 140, success: false }), // failed, should be excluded
      ]);

      const prefs = await service.computePreferences();

      expect(prefs.bpmRange.min).toBe(80);
      expect(prefs.bpmRange.max).toBe(90);
      // Preferred = weighted average by rating
      expect(prefs.bpmRange.preferred).toBeGreaterThan(80);
      expect(prefs.bpmRange.preferred).toBeLessThan(95);
    });

    it('returns default BPM range when no data', async () => {
      const prefs = await service.computePreferences();
      expect(prefs.bpmRange).toEqual({ min: 60, max: 180, preferred: 120 });
    });
  });

  // ─── Key Preferences ──────────────────────────────────────────────────

  describe('key preferences', () => {
    it('extracts top preferred keys', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ keyScale: 'C minor', rating: 5 }),
        makeEntry({ keyScale: 'C minor', rating: 4 }),
        makeEntry({ keyScale: 'G major', rating: 4 }),
        makeEntry({ keyScale: 'A minor', rating: 3 }),
      ]);

      const prefs = await service.computePreferences();

      expect(prefs.preferredKeys.length).toBeGreaterThan(0);
      expect(prefs.preferredKeys[0]).toBe('C minor');
    });
  });

  // ─── Dislike Signals ──────────────────────────────────────────────────

  describe('dislike signals', () => {
    it('identifies genres with consistently low ratings', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['lo-fi'], rating: 5 }),
        makeEntry({ genres: ['lo-fi'], rating: 4 }),
        makeEntry({ genres: ['metal'], rating: 1 }),
        makeEntry({ genres: ['metal'], rating: 2 }),
        makeEntry({ genres: ['metal'], rating: 1 }),
      ]);

      const prefs = await service.computePreferences();
      const metalGenre = prefs.topGenres.find(g => g.genre === 'metal');

      // Metal should rank lower due to low ratings
      if (metalGenre) {
        expect(metalGenre.weight).toBeLessThan(
          prefs.topGenres.find(g => g.genre === 'lo-fi')!.weight
        );
      }
    });
  });

  // ─── Personalized Presets ─────────────────────────────────────────────

  describe('personalized presets', () => {
    it('generates suggested presets from preferences', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['lo-fi'], bpm: 85, keyScale: 'F major', rating: 5 }),
        makeEntry({ genres: ['lo-fi'], bpm: 80, keyScale: 'F major', rating: 4 }),
        makeEntry({ genres: ['jazz'], bpm: 100, keyScale: 'Bb major', rating: 4 }),
      ]);

      const presets = await service.getSuggestedPresets();

      expect(presets.length).toBeGreaterThan(0);
      expect(presets[0].name).toBeTruthy();
      expect(presets[0].bpm).toBeGreaterThan(0);
      expect(presets[0].reason).toBeTruthy();
    });

    it('returns empty when no preferences', async () => {
      const presets = await service.getSuggestedPresets();
      expect(presets).toEqual([]);
    });
  });

  // ─── Persistence ──────────────────────────────────────────────────────

  describe('persistence', () => {
    it('caches computed preferences in IndexedDB', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['jazz'], rating: 4 }),
      ]);

      await service.computePreferences();
      expect(mockSet).toHaveBeenCalledWith(
        'wiki:user-preferences',
        expect.objectContaining({ generationCount: 1 })
      );
    });

    it('loads cached preferences', async () => {
      const cached = {
        ...EMPTY_PREFERENCES,
        topGenres: [{ genre: 'jazz', weight: 0.8, count: 5, averageRating: 4.2 }],
        generationCount: 5,
        lastUpdated: Date.now(),
      };
      mockGet.mockResolvedValueOnce(cached);

      const prefs = await service.getCachedPreferences();
      expect(prefs).not.toBeNull();
      expect(prefs!.topGenres[0].genre).toBe('jazz');
    });

    it('returns null when no cache', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      const prefs = await service.getCachedPreferences();
      expect(prefs).toBeNull();
    });
  });

  // ─── Reset ────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears preferences', async () => {
      mockGetAllEntries.mockReturnValue([
        makeEntry({ genres: ['jazz'], rating: 4 }),
      ]);
      await service.computePreferences();

      await service.clearPreferences();
      expect(mockSet).toHaveBeenCalledWith('wiki:user-preferences', EMPTY_PREFERENCES);
    });
  });
});

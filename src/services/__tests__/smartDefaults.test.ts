import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: vi.fn(),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import { SmartDefaults, resetSmartDefaults } from '../smartDefaults';
import { resetRecipeWiki } from '../recipeWiki';
import type { GenreRecipe } from '../../types/recipeWiki';

function makeGenreRecipe(overrides: Partial<GenreRecipe> = {}): GenreRecipe {
  return {
    genre: 'Lo-Fi',
    totalGenerations: 15,
    successfulGenerations: 12,
    failedGenerations: 3,
    averageRating: 4.0,
    bestPrompts: [{ prompt: 'lo-fi chill', count: 8, averageRating: 4.2, keptRate: 0.8 }],
    recommendedParams: {
      cfgStrength: 5.5,
      steps: 32,
      shift: 1.0,
      bpm: 85,
      keyScale: 'F major',
    },
    knownFailures: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('SmartDefaults', () => {
  let service: SmartDefaults;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockKeys.mockReset();
    mockKeys.mockResolvedValue([]);
    resetSmartDefaults();
    resetRecipeWiki();
    service = new SmartDefaults();
  });

  // ─── Suggest ───────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('returns wiki-based suggestion when genre data is sufficient', async () => {
      // RecipeWiki.query will read from get(`recipe:genre:Lo-Fi`)
      mockGet.mockImplementation((key: string) => {
        if (key === 'recipe:genre:Lo-Fi') return Promise.resolve(makeGenreRecipe());
        return Promise.resolve(undefined);
      });

      const result = await service.suggest('Lo-Fi');

      expect(result.source).toBe('wiki');
      expect(result.params.guidanceScale).toBe(5.5);
      expect(result.params.inferenceSteps).toBe(32);
      expect(result.params.bpm).toBe(85);
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.sampleSize).toBe(15);
    });

    it('falls back to static preset when wiki has no data', async () => {
      mockGet.mockResolvedValue(undefined);

      const result = await service.suggest('Pop');

      expect(result.source).toBe('static');
      expect(result.params.bpm).toBe(120); // Upbeat Pop preset
      expect(result.confidence).toBe(0.5);
    });

    it('falls back to generic when no wiki and no static preset', async () => {
      mockGet.mockResolvedValue(undefined);

      const result = await service.suggest('Mongolian Throat Singing');

      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('No data');
    });

    it('prefers wiki over static when confidence is sufficient', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'recipe:genre:Pop') {
          return Promise.resolve(makeGenreRecipe({
            genre: 'Pop',
            totalGenerations: 10,
            recommendedParams: { cfgStrength: 6, steps: 40, bpm: 125 },
          }));
        }
        return Promise.resolve(undefined);
      });

      const result = await service.suggest('Pop');

      expect(result.source).toBe('wiki');
      expect(result.params.bpm).toBe(125); // Wiki's BPM, not static 120
    });

    it('falls back to static when wiki confidence is too low', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'recipe:genre:Pop') {
          return Promise.resolve(makeGenreRecipe({
            genre: 'Pop',
            totalGenerations: 1, // Very low → low confidence
            successfulGenerations: 1,
            averageRating: null,
          }));
        }
        return Promise.resolve(undefined);
      });

      const result = await service.suggest('Pop');

      // With 1 generation and no rating, confidence ≈ 0.035 < 0.2
      expect(result.source).toBe('static');
    });
  });

  // ─── A/B Tracking ──────────────────────────────────────────────────────

  describe('tracking', () => {
    it('records tracking entries', async () => {
      mockGet.mockResolvedValue(undefined);

      await service.trackOutcome({
        timestamp: Date.now(),
        genre: 'Lo-Fi',
        source: 'wiki',
        paramsUsed: { guidanceScale: 5.5, inferenceSteps: 32 },
        outcome: 'kept',
        rating: 4,
      });

      expect(mockSet).toHaveBeenCalledWith(
        'wiki:smart-defaults:tracking',
        expect.objectContaining({ entries: expect.arrayContaining([expect.objectContaining({ genre: 'Lo-Fi' })]) })
      );
    });

    it('limits tracking entries to 500', async () => {
      const existing = {
        entries: Array.from({ length: 500 }, (_, i) => ({
          timestamp: i,
          genre: 'Test',
          source: 'wiki' as const,
          paramsUsed: {},
          outcome: 'kept' as const,
        })),
      };
      mockGet.mockResolvedValue(existing);

      await service.trackOutcome({
        timestamp: Date.now(),
        genre: 'New',
        source: 'static',
        paramsUsed: {},
        outcome: 'kept',
      });

      const savedState = mockSet.mock.calls[0][1];
      expect(savedState.entries.length).toBeLessThanOrEqual(500);
      expect(savedState.entries[savedState.entries.length - 1].genre).toBe('New');
    });

    it('computes A/B stats correctly', async () => {
      mockGet.mockResolvedValue({
        entries: [
          { source: 'wiki', outcome: 'kept', rating: 5 },
          { source: 'wiki', outcome: 'kept', rating: 4 },
          { source: 'wiki', outcome: 'regenerated', rating: 2 },
          { source: 'static', outcome: 'kept', rating: 3 },
          { source: 'static', outcome: 'regenerated' },
        ],
      });

      const stats = await service.getTrackingStats();

      expect(stats.wiki.count).toBe(3);
      expect(stats.wiki.keptRate).toBeCloseTo(2 / 3);
      expect(stats.wiki.avgRating).toBeCloseTo(11 / 3);

      expect(stats.static.count).toBe(2);
      expect(stats.static.keptRate).toBe(0.5);
      expect(stats.static.avgRating).toBe(3);
    });

    it('handles empty tracking state', async () => {
      mockGet.mockResolvedValue(undefined);

      const stats = await service.getTrackingStats();

      expect(stats.wiki.count).toBe(0);
      expect(stats.wiki.avgRating).toBeNull();
      expect(stats.static.count).toBe(0);
    });
  });
});

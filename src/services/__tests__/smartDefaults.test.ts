import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
}));

// Mock RecipeWiki
const mockSuggestParameters = vi.fn();
const mockGetGenreStats = vi.fn();
const mockGetAllEntries = vi.fn();
vi.mock('../recipeWiki', () => ({
  getRecipeWiki: vi.fn().mockResolvedValue({
    suggestParameters: (...args: unknown[]) => mockSuggestParameters(...args),
    getGenreStats: (...args: unknown[]) => mockGetGenreStats(...args),
    getAllEntries: (...args: unknown[]) => mockGetAllEntries(...args),
  }),
}));

import { SmartDefaults, resetSmartDefaults } from '../smartDefaults';

describe('SmartDefaults', () => {
  let service: SmartDefaults;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockSuggestParameters.mockReset();
    mockGetGenreStats.mockReset();
    mockGetAllEntries.mockReturnValue([]);
    resetSmartDefaults();
    service = new SmartDefaults();
  });

  describe('suggest', () => {
    it('returns wiki-based suggestion when genre data is sufficient', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 5.5,
        steps: 60,
        shift: 3.0,
        confidence: 0.7,
        sampleSize: 15,
      });

      const result = await service.suggest('lo-fi');
      expect(result.source).toBe('wiki');
      expect(result.params.guidanceScale).toBe(5.5);
      expect(result.params.inferenceSteps).toBe(60);
      expect(result.confidence).toBe(0.7);
      expect(result.sampleSize).toBe(15);
    });

    it('falls back to static preset when wiki confidence is low', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 5, steps: 60, shift: 3,
        confidence: 0.1, sampleSize: 1,
      });

      const result = await service.suggest('Pop');
      expect(result.source).toBe('static');
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toContain('static preset');
    });

    it('returns fallback when no data available', async () => {
      mockSuggestParameters.mockReturnValue(null);

      const result = await service.suggest('unknown-genre-xyz');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0);
    });

    it('falls back when wiki returns null', async () => {
      mockSuggestParameters.mockReturnValue(null);

      const result = await service.suggest('Rock');
      // Rock should match a static preset
      expect(result.source).toBe('static');
    });
  });

  describe('trackOutcome', () => {
    it('stores tracking entry', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      await service.trackOutcome({
        timestamp: Date.now(),
        genre: 'lo-fi',
        source: 'wiki',
        paramsUsed: { guidanceScale: 5 },
        outcome: 'kept',
        rating: 4,
      });
      expect(mockSet).toHaveBeenCalled();
    });

    it('caps tracking entries at 500', async () => {
      const entries = Array.from({ length: 500 }, (_, i) => ({
        timestamp: i,
        genre: 'test',
        source: 'wiki' as const,
        paramsUsed: {},
        outcome: 'kept' as const,
      }));
      mockGet.mockResolvedValueOnce({ entries });

      await service.trackOutcome({
        timestamp: 501,
        genre: 'test',
        source: 'static',
        paramsUsed: {},
        outcome: 'kept',
      });

      const storedState = mockSet.mock.calls[0][1];
      expect(storedState.entries.length).toBeLessThanOrEqual(500);
    });
  });

  describe('getTrackingStats', () => {
    it('returns empty stats when no tracking data', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      const stats = await service.getTrackingStats();
      expect(stats.wiki.count).toBe(0);
      expect(stats.static.count).toBe(0);
    });

    it('computes correct stats by source', async () => {
      mockGet.mockResolvedValueOnce({
        entries: [
          { source: 'wiki', outcome: 'kept', rating: 5 },
          { source: 'wiki', outcome: 'regenerated', rating: 2 },
          { source: 'static', outcome: 'kept', rating: 4 },
        ],
      });
      const stats = await service.getTrackingStats();
      expect(stats.wiki.count).toBe(2);
      expect(stats.wiki.keptRate).toBe(0.5);
      expect(stats.wiki.avgRating).toBe(3.5);
      expect(stats.static.count).toBe(1);
      expect(stats.static.keptRate).toBe(1);
    });
  });
});

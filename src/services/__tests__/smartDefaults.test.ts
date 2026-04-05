import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: vi.fn(),
  keys: vi.fn(() => Promise.resolve([])),
}));

import { SmartDefaultsService } from '../smartDefaults';
import { RecipeWiki } from '../recipeWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenerationEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: `clip-${Math.random().toString(36).slice(2, 6)}`,
    trackId: 'track-1',
    prompt: 'lo-fi hip hop beat',
    params: {
      taskType: 'text2music',
      duration: 30,
      cfgStrength: 5,
      steps: 60,
      shift: 3,
      modelId: 'ace-step-v1.5',
    },
    result: 'kept',
    inferredMetas: { genres: ['lo-fi', 'hip-hop'], bpm: 85 },
    userRating: 4,
    ...overrides,
  };
}

describe('SmartDefaultsService', () => {
  let recipeWiki: RecipeWiki;
  let service: SmartDefaultsService;

  beforeEach(async () => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    recipeWiki = new RecipeWiki();
    await recipeWiki.initialize();
    service = new SmartDefaultsService(recipeWiki);
  });

  // ─── Suggest Parameters ─────────────────────────────────────────────

  describe('getSmartDefaults', () => {
    it('returns wiki-based suggestion when data exists', async () => {
      await recipeWiki.ingest(makeGenerationEvent({
        userRating: 5,
        params: { taskType: 'text2music', cfgStrength: 6, steps: 70, shift: 2.5 },
      }));
      await recipeWiki.ingest(makeGenerationEvent({
        clipId: 'c2',
        userRating: 4,
        params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
      }));

      const result = service.getSmartDefaults('lo-fi');
      expect(result.source).toBe('wiki');
      expect(result.suggestion).toBeTruthy();
      expect(result.suggestion!.cfgStrength).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.sampleSize).toBe(2);
    });

    it('falls back to static defaults when no wiki data', () => {
      const result = service.getSmartDefaults('unknown-genre');
      expect(result.source).toBe('static');
      expect(result.suggestion).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('provides explanation text', async () => {
      await recipeWiki.ingest(makeGenerationEvent({ userRating: 5 }));
      const result = service.getSmartDefaults('lo-fi');
      expect(result.explanation).toBeTruthy();
      expect(result.explanation).toContain('1');
    });

    it('provides low confidence for few samples', async () => {
      await recipeWiki.ingest(makeGenerationEvent({ userRating: 3 }));
      const result = service.getSmartDefaults('lo-fi');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('provides high confidence for many samples', async () => {
      for (let i = 0; i < 15; i++) {
        await recipeWiki.ingest(makeGenerationEvent({
          clipId: `c-${i}`,
          userRating: 4,
        }));
      }
      const result = service.getSmartDefaults('lo-fi');
      expect(result.confidence).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Compare Performance ────────────────────────────────────────────

  describe('comparePerformance', () => {
    it('calculates regeneration rate from wiki data', async () => {
      // 3 kept, 2 regenerated
      await recipeWiki.ingest(makeGenerationEvent({ result: 'kept', userRating: 5 }));
      await recipeWiki.ingest(makeGenerationEvent({ clipId: 'c2', result: 'kept', userRating: 4 }));
      await recipeWiki.ingest(makeGenerationEvent({ clipId: 'c3', result: 'kept', userRating: 3 }));
      await recipeWiki.ingest(makeGenerationEvent({ clipId: 'c4', result: 'regenerated', userRating: 2 }));
      await recipeWiki.ingest(makeGenerationEvent({ clipId: 'c5', result: 'regenerated', userRating: 1 }));

      const stats = service.getGenrePerformance('lo-fi');
      expect(stats).toBeTruthy();
      expect(stats!.totalGenerations).toBe(5);
      expect(stats!.keptRate).toBeCloseTo(0.6);
      expect(stats!.regeneratedRate).toBeCloseTo(0.4);
      expect(stats!.averageRating).toBeGreaterThan(0);
    });

    it('returns null for unknown genre', () => {
      expect(service.getGenrePerformance('unknown')).toBeNull();
    });
  });

  // ─── Discover Insights ──────────────────────────────────────────────

  describe('discoverInsights', () => {
    it('identifies parameter correlations', async () => {
      // High-rated entries with shift=2
      for (let i = 0; i < 5; i++) {
        await recipeWiki.ingest(makeGenerationEvent({
          clipId: `good-${i}`,
          userRating: 5,
          params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 2 },
          inferredMetas: { genres: ['jazz'] },
        }));
      }
      // Low-rated entries with shift=5
      for (let i = 0; i < 5; i++) {
        await recipeWiki.ingest(makeGenerationEvent({
          clipId: `bad-${i}`,
          userRating: 2,
          params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 5 },
          inferredMetas: { genres: ['jazz'] },
        }));
      }

      const insights = service.discoverInsights('jazz');
      expect(insights.length).toBeGreaterThan(0);
    });

    it('returns empty for insufficient data', () => {
      const insights = service.discoverInsights('unknown');
      expect(insights).toEqual([]);
    });
  });
});

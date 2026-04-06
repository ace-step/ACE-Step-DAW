import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval (required by recipeWiki)
const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
}));

// Mock recipeWiki module
const mockSuggestParameters = vi.fn();
vi.mock('../recipeWiki', () => ({
  getRecipeWiki: vi.fn(async () => ({
    suggestParameters: mockSuggestParameters,
  })),
}));

import { getSmartDefaults, getSmartDefaultsForGenres } from '../smartDefaults';
import { DEFAULT_GENERATION } from '../../constants/defaults';

describe('SmartDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestParameters.mockReturnValue(null);
  });

  describe('getSmartDefaults', () => {
    it('returns static defaults when genre is empty', async () => {
      const result = await getSmartDefaults('');
      expect(result.source).toBe('static');
      expect(result.inferenceSteps).toBe(DEFAULT_GENERATION.inferenceSteps);
      expect(result.guidanceScale).toBe(DEFAULT_GENERATION.guidanceScale);
      expect(result.shift).toBe(DEFAULT_GENERATION.shift);
    });

    it('returns static defaults when wiki has no data for genre', async () => {
      mockSuggestParameters.mockReturnValue(null);
      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('static');
    });

    it('returns wiki defaults when confidence is sufficient', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 8.5,
        steps: 60,
        shift: 4.0,
        confidence: 0.5,
        sampleSize: 5,
      });

      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('wiki');
      expect(result.inferenceSteps).toBe(60);
      expect(result.guidanceScale).toBe(8.5);
      expect(result.shift).toBe(4.0);
      expect(result.confidence).toBe(0.5);
      expect(result.sampleSize).toBe(5);
    });

    it('returns static defaults when confidence is below threshold', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 8.5,
        steps: 60,
        shift: 4.0,
        confidence: 0.1, // Below MIN_CONFIDENCE_THRESHOLD (0.2)
        sampleSize: 1,   // Below MIN_SAMPLE_SIZE (2)
      });

      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('static');
    });

    it('returns static defaults when sample size is too small', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 8.5,
        steps: 60,
        shift: 4.0,
        confidence: 0.3,
        sampleSize: 1, // Below MIN_SAMPLE_SIZE (2)
      });

      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('static');
    });

    it('falls back to static defaults on RecipeWiki error', async () => {
      const { getRecipeWiki } = await import('../recipeWiki');
      (getRecipeWiki as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));

      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('static');
    });

    it('uses static defaults for zero-value wiki parameters', async () => {
      mockSuggestParameters.mockReturnValue({
        cfgStrength: 0, // Will fall back to static
        steps: 0,       // Will fall back to static
        shift: 0,       // Will fall back to static
        confidence: 0.5,
        sampleSize: 5,
      });

      const result = await getSmartDefaults('jazz');
      expect(result.source).toBe('wiki');
      // Zero values should fall back to static defaults
      expect(result.inferenceSteps).toBe(DEFAULT_GENERATION.inferenceSteps);
      expect(result.guidanceScale).toBe(DEFAULT_GENERATION.guidanceScale);
      expect(result.shift).toBe(DEFAULT_GENERATION.shift);
    });
  });

  describe('getSmartDefaultsForGenres', () => {
    it('returns static defaults for empty genres array', async () => {
      const result = await getSmartDefaultsForGenres([]);
      expect(result.source).toBe('static');
    });

    it('returns the highest-confidence genre result', async () => {
      mockSuggestParameters.mockImplementation((genre: string) => {
        if (genre === 'jazz') {
          return { cfgStrength: 8.0, steps: 55, shift: 3.5, confidence: 0.3, sampleSize: 3 };
        }
        if (genre === 'electronic') {
          return { cfgStrength: 9.0, steps: 70, shift: 5.0, confidence: 0.8, sampleSize: 8 };
        }
        return null;
      });

      const result = await getSmartDefaultsForGenres(['jazz', 'electronic']);
      expect(result.source).toBe('wiki');
      expect(result.confidence).toBe(0.8);
      expect(result.inferenceSteps).toBe(70);
      expect(result.guidanceScale).toBe(9.0);
    });

    it('falls back to static when no genre has reliable data', async () => {
      mockSuggestParameters.mockReturnValue(null);
      const result = await getSmartDefaultsForGenres(['unknown1', 'unknown2']);
      expect(result.source).toBe('static');
    });
  });
});

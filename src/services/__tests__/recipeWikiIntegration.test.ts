import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import {
  startRecipeWikiIngest,
  stopRecipeWikiIngest,
  getSmartDefaults,
  getDynamicPresets,
} from '../recipeWikiIntegration';
import { SessionMemory } from '../sessionMemory';
import { resetSessionMemory, getSessionMemory } from '../sessionMemory';
import { resetRecipeWiki } from '../recipeWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'lo-fi chill beat',
    params: {
      taskType: 'text2music',
      cfgStrength: 5,
      steps: 32,
    },
    result: 'kept',
    inferredMetas: {
      bpm: 85,
      keyScale: 'F major',
      genres: ['Lo-Fi'],
    },
    userRating: 4,
    ...overrides,
  };
}

describe('recipeWikiIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    resetSessionMemory();
    resetRecipeWiki();
  });

  afterEach(() => {
    stopRecipeWikiIngest();
    resetSessionMemory();
    resetRecipeWiki();
    vi.useRealTimers();
  });

  describe('auto-ingest', () => {
    it('ingests generation events on session memory flush', async () => {
      const memory = getSessionMemory();
      startRecipeWikiIngest();

      memory.captureGeneration(makeGenEvent());
      await memory.flush();

      // Should have stored: session flush + recipe entry + genre recipe
      const recipeEntryCalls = mockSet.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:entry:')
      );
      expect(recipeEntryCalls.length).toBeGreaterThan(0);
    });

    it('does not ingest non-generation events', async () => {
      stopRecipeWikiIngest();
      resetSessionMemory();
      resetRecipeWiki();
      mockSet.mockClear();

      const memory = getSessionMemory();
      startRecipeWikiIngest();

      memory.captureCreative({
        type: 'track_added',
        timestamp: Date.now(),
        description: 'Added drums',
      });
      await memory.flush();

      const recipeEntryCalls = mockSet.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:entry:')
      );
      expect(recipeEntryCalls.length).toBe(0);
    });

    it('stop cleans up subscription', async () => {
      stopRecipeWikiIngest();
      resetSessionMemory();
      resetRecipeWiki();
      mockSet.mockClear();

      const memory = getSessionMemory();
      startRecipeWikiIngest();
      stopRecipeWikiIngest();

      memory.captureGeneration(makeGenEvent());
      await memory.flush();

      const recipeEntryCalls = mockSet.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:entry:')
      );
      expect(recipeEntryCalls.length).toBe(0);
    });
  });

  describe('getSmartDefaults', () => {
    it('returns wiki suggestion when genre data exists', async () => {
      mockGet.mockResolvedValue({
        genre: 'Lo-Fi',
        totalGenerations: 10,
        successfulGenerations: 8,
        failedGenerations: 2,
        averageRating: 4.0,
        bestPrompts: [{ prompt: 'lo-fi chill', count: 5, averageRating: 4.2, keptRate: 0.8 }],
        recommendedParams: { cfgStrength: 5.5, steps: 32, bpm: 85 },
        knownFailures: [],
        lastUpdated: Date.now(),
      });

      const { suggestion, fallbackPreset } = await getSmartDefaults('Lo-Fi', 'text2music');

      expect(suggestion).not.toBeNull();
      expect(suggestion!.params.cfgStrength).toBe(5.5);
      expect(fallbackPreset).not.toBeNull();
      expect(fallbackPreset!.category).toBe('Lo-Fi');
    });

    it('returns null suggestion with fallback preset for unknown wiki genre', async () => {
      mockGet.mockResolvedValue(undefined);

      const { suggestion, fallbackPreset } = await getSmartDefaults('Pop', 'text2music');

      expect(suggestion).toBeNull();
      expect(fallbackPreset).not.toBeNull();
    });
  });

  describe('getDynamicPresets', () => {
    it('returns static presets plus wiki-derived presets', async () => {
      mockKeys.mockResolvedValue(['recipe:genre:Funk']);
      mockGet.mockResolvedValue({
        genre: 'Funk',
        totalGenerations: 5,
        successfulGenerations: 4,
        failedGenerations: 1,
        averageRating: 4.0,
        bestPrompts: [{ prompt: 'funky groove', count: 3, averageRating: 4.5, keptRate: 0.75 }],
        recommendedParams: { bpm: 110, keyScale: 'E minor' },
        knownFailures: [],
        lastUpdated: Date.now(),
      });

      const presets = await getDynamicPresets();

      const staticCount = presets.filter(p => p.source === 'static').length;
      const wikiCount = presets.filter(p => p.source === 'wiki').length;

      expect(staticCount).toBe(16); // original 16 presets
      expect(wikiCount).toBe(1);

      const funkPreset = presets.find(p => p.source === 'wiki');
      expect(funkPreset!.name).toBe('Funk (Learned)');
      expect(funkPreset!.suggestedBpm).toBe(110);
      expect(funkPreset!.sampleSize).toBe(5);
    });

    it('excludes genres with fewer than 3 generations', async () => {
      mockKeys.mockResolvedValue(['recipe:genre:Rare']);
      mockGet.mockResolvedValue({
        genre: 'Rare',
        totalGenerations: 2,
        successfulGenerations: 1,
        failedGenerations: 1,
        averageRating: 3.0,
        bestPrompts: [{ prompt: 'rare genre', count: 1, averageRating: 3.0, keptRate: 0.5 }],
        recommendedParams: {},
        knownFailures: [],
        lastUpdated: Date.now(),
      });

      const presets = await getDynamicPresets();
      const wikiCount = presets.filter(p => p.source === 'wiki').length;
      expect(wikiCount).toBe(0);
    });
  });
});

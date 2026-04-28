import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { RecipeWiki } from '../recipeWiki';
import type {
  RecipeEntry,
  RecipeQuery,
  RecipeWikiExport,
} from '../../types/recipeWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenerationEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'A chill lo-fi hip hop beat with jazz piano',
    params: {
      taskType: 'text2music',
      duration: 30,
      cfgStrength: 5,
      steps: 60,
      shift: 3,
      modelId: 'ace-step-v1.5',
    },
    result: 'kept',
    inferredMetas: {
      bpm: 85,
      keyScale: 'C minor',
      genres: ['lo-fi', 'hip-hop'],
    },
    userRating: 4,
    ...overrides,
  };
}

describe('RecipeWiki', () => {
  let wiki: RecipeWiki;

  beforeEach(async () => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    wiki = new RecipeWiki();
    await wiki.initialize();
  });

  // ─── Ingest ─────────────────────────────────────────────────────────

  describe('ingest', () => {
    it('ingests a successful generation event into a recipe entry', async () => {
      const event = makeGenerationEvent();
      await wiki.ingest(event);

      const entries = wiki.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].prompt).toBe('A chill lo-fi hip hop beat with jazz piano');
      expect(entries[0].rating).toBe(4);
      expect(entries[0].genres).toEqual(['lo-fi', 'hip-hop']);
    });

    it('stores failed generations as failure data', async () => {
      const event = makeGenerationEvent({
        type: 'generation_failed',
        result: 'regenerated',
        userRating: undefined,
      });
      await wiki.ingest(event);
      // Failed events with no rating are still stored as failure data
      const entries = wiki.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].success).toBe(false);
    });

    it('extracts genres from inferredMetas', async () => {
      await wiki.ingest(makeGenerationEvent({
        inferredMetas: { genres: ['jazz', 'fusion'] },
      }));
      const entries = wiki.getAllEntries();
      expect(entries[0].genres).toEqual(['jazz', 'fusion']);
    });

    it('extracts genres from prompt when no inferredMetas', async () => {
      await wiki.ingest(makeGenerationEvent({
        prompt: 'heavy metal guitar riff with punk energy',
        inferredMetas: undefined,
      }));
      const entries = wiki.getAllEntries();
      // Should have at least attempted genre extraction from prompt
      expect(entries[0].genres).toEqual(expect.arrayContaining(['metal', 'punk']));
    });

    it('persists after ingest', async () => {
      await wiki.ingest(makeGenerationEvent());
      expect(mockSet).toHaveBeenCalled();
      const key = mockSet.mock.calls[0][0] as string;
      expect(key).toMatch(/^wiki:recipe:/);
    });

    it('accumulates multiple entries', async () => {
      await wiki.ingest(makeGenerationEvent({ clipId: 'a' }));
      await wiki.ingest(makeGenerationEvent({ clipId: 'b', prompt: 'rock anthem' }));
      expect(wiki.getAllEntries()).toHaveLength(2);
    });
  });

  // ─── Query ──────────────────────────────────────────────────────────

  describe('query', () => {
    beforeEach(async () => {
      await wiki.ingest(makeGenerationEvent({
        prompt: 'lo-fi hip hop beat',
        inferredMetas: { genres: ['lo-fi', 'hip-hop'], bpm: 85 },
        userRating: 5,
        params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
      }));
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c2',
        prompt: 'jazz piano trio',
        inferredMetas: { genres: ['jazz'], bpm: 120 },
        userRating: 3,
        params: { taskType: 'text2music', cfgStrength: 7, steps: 80, shift: 2 },
      }));
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c3',
        prompt: 'lo-fi study beats',
        inferredMetas: { genres: ['lo-fi'], bpm: 80 },
        userRating: 4,
        params: { taskType: 'text2music', cfgStrength: 4, steps: 50, shift: 3 },
      }));
    });

    it('queries by genre', () => {
      const results = wiki.query({ genre: 'lo-fi' });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.genres.includes('lo-fi'))).toBe(true);
    });

    it('queries by minimum rating', () => {
      const results = wiki.query({ minRating: 4 });
      expect(results).toHaveLength(2);
      expect(results.every(r => (r.rating ?? 0) >= 4)).toBe(true);
    });

    it('queries with combined filters', () => {
      const results = wiki.query({ genre: 'lo-fi', minRating: 5 });
      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('lo-fi hip hop beat');
    });

    it('returns empty for no matches', () => {
      expect(wiki.query({ genre: 'death-metal' })).toEqual([]);
    });

    it('returns all when no filters', () => {
      expect(wiki.query({})).toHaveLength(3);
    });
  });

  // ─── Suggest Parameters ─────────────────────────────────────────────

  describe('suggestParameters', () => {
    beforeEach(async () => {
      // Add multiple successful lo-fi entries with varying params
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c1',
        inferredMetas: { genres: ['lo-fi'], bpm: 85 },
        userRating: 5,
        params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
      }));
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c2',
        inferredMetas: { genres: ['lo-fi'], bpm: 80 },
        userRating: 4,
        params: { taskType: 'text2music', cfgStrength: 4, steps: 50, shift: 3 },
      }));
    });

    it('suggests parameters based on genre history', () => {
      const suggestion = wiki.suggestParameters('lo-fi');
      expect(suggestion).toBeTruthy();
      expect(suggestion!.cfgStrength).toBeCloseTo(4.56, 1); // weighted avg by rating
      expect(suggestion!.steps).toBeGreaterThan(0);
    });

    it('returns null for unknown genre', () => {
      expect(wiki.suggestParameters('unknown-genre')).toBeNull();
    });

    it('weights higher-rated entries more', () => {
      const suggestion = wiki.suggestParameters('lo-fi');
      // Rating 5 entry (cfg=5) should pull average above 4.5
      expect(suggestion!.cfgStrength).toBeGreaterThan(4.5);
    });
  });

  // ─── Export / Import ────────────────────────────────────────────────

  describe('export and import', () => {
    it('exports all entries as JSON', async () => {
      await wiki.ingest(makeGenerationEvent({ clipId: 'a' }));
      await wiki.ingest(makeGenerationEvent({ clipId: 'b' }));

      const exported = wiki.export();
      expect(exported.version).toBe(1);
      expect(exported.entries).toHaveLength(2);
      expect(exported.exportedAt).toBeGreaterThan(0);
    });

    it('imports entries from export', async () => {
      await wiki.ingest(makeGenerationEvent({ clipId: 'a' }));
      const exported = wiki.export();

      // Create a fresh wiki and import
      const wiki2 = new RecipeWiki();
      await wiki2.initialize();
      await wiki2.import(exported);

      expect(wiki2.getAllEntries()).toHaveLength(1);
    });

    it('merges on import without duplicates', async () => {
      await wiki.ingest(makeGenerationEvent({ clipId: 'a' }));
      const exported = wiki.export();

      // Import into same wiki — should not duplicate
      await wiki.import(exported);
      expect(wiki.getAllEntries()).toHaveLength(1);
    });

    it('rejects invalid import data', async () => {
      await expect(wiki.import({ version: 999, entries: [], exportedAt: 0 })).rejects.toThrow();
    });
  });

  // ─── Genre Stats ────────────────────────────────────────────────────

  describe('genre stats', () => {
    beforeEach(async () => {
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c1', inferredMetas: { genres: ['lo-fi', 'hip-hop'] }, userRating: 5,
      }));
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c2', inferredMetas: { genres: ['lo-fi'] }, userRating: 3,
      }));
      await wiki.ingest(makeGenerationEvent({
        clipId: 'c3', inferredMetas: { genres: ['rock'] }, userRating: 4,
      }));
    });

    it('returns genre statistics', () => {
      const stats = wiki.getGenreStats();
      expect(stats.get('lo-fi')?.count).toBe(2);
      expect(stats.get('lo-fi')?.averageRating).toBe(4);
      expect(stats.get('rock')?.count).toBe(1);
      expect(stats.get('hip-hop')?.count).toBe(1);
    });
  });

  // ─── Persistence / Restore ─────────────────────────────────────────

  describe('persistence', () => {
    it('restores entries from IndexedDB on initialize', async () => {
      const existingEntries: RecipeEntry[] = [{
        id: 'existing-1',
        prompt: 'stored prompt',
        genres: ['ambient'],
        params: { taskType: 'text2music', cfgStrength: 3, steps: 40 },
        success: true,
        rating: 4,
        timestamp: Date.now(),
        bpm: 90,
        keyScale: 'A minor',
      }];

      mockGet.mockResolvedValueOnce(existingEntries);
      const fresh = new RecipeWiki();
      await fresh.initialize();
      expect(fresh.getAllEntries()).toHaveLength(1);
      expect(fresh.getAllEntries()[0].prompt).toBe('stored prompt');
    });
  });
});

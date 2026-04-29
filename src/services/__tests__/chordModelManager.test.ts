import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CHORD_MODEL_REGISTRY,
  loadChordModelBytes,
  isChordModelCached,
  getChordModelMeta,
} from '../chordModelManager';

// Mock idb-keyval
const mockCache = new Map<string, ArrayBuffer>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn((key: string) => Promise.resolve(mockCache.get(key))),
  set: vi.fn((key: string, value: ArrayBuffer) => {
    mockCache.set(key, value);
    return Promise.resolve();
  }),
}));

describe('chordModelManager', () => {
  beforeEach(() => {
    mockCache.clear();
    vi.restoreAllMocks();
  });

  describe('CHORD_MODEL_REGISTRY', () => {
    it('contains all expected model variants', () => {
      const variants = Object.keys(CHORD_MODEL_REGISTRY);
      expect(variants).toContain('rnn');
      expect(variants).toContain('transformer-s');
      expect(variants).toContain('transformer-m');
      expect(variants).toContain('transformer-l');
      expect(variants).toContain('conditional-s');
      expect(variants).toContain('conditional-m');
      expect(variants).toContain('conditional-l');
      expect(variants).toHaveLength(7);
    });

    it('each model has required fields', () => {
      for (const [id, meta] of Object.entries(CHORD_MODEL_REGISTRY)) {
        expect(meta.id).toBe(id);
        expect(meta.name).toBeTruthy();
        expect(meta.sizeBytes).toBeGreaterThan(0);
        expect(meta.url).toContain('/models/');
        expect(meta.cacheKey).toContain('onnx-model:');
        expect(typeof meta.conditional).toBe('boolean');
      }
    });

    it('conditional models are marked correctly', () => {
      expect(CHORD_MODEL_REGISTRY['rnn'].conditional).toBe(false);
      expect(CHORD_MODEL_REGISTRY['transformer-s'].conditional).toBe(false);
      expect(CHORD_MODEL_REGISTRY['conditional-s'].conditional).toBe(true);
      expect(CHORD_MODEL_REGISTRY['conditional-m'].conditional).toBe(true);
      expect(CHORD_MODEL_REGISTRY['conditional-l'].conditional).toBe(true);
    });

    it('model sizes increase with variant size', () => {
      expect(CHORD_MODEL_REGISTRY['transformer-s'].sizeBytes)
        .toBeLessThan(CHORD_MODEL_REGISTRY['transformer-m'].sizeBytes);
      expect(CHORD_MODEL_REGISTRY['transformer-m'].sizeBytes)
        .toBeLessThan(CHORD_MODEL_REGISTRY['transformer-l'].sizeBytes);
    });
  });

  describe('getChordModelMeta', () => {
    it('returns metadata for a valid variant', () => {
      const meta = getChordModelMeta('rnn');
      expect(meta.id).toBe('rnn');
      expect(meta.name).toBe('Recurrent Network');
    });

    it('returns metadata for transformer variants', () => {
      const meta = getChordModelMeta('transformer-m');
      expect(meta.name).toBe('Transformer M');
      expect(meta.sizeBytes).toBe(9_400_000);
    });
  });

  describe('isChordModelCached', () => {
    it('returns false when model is not cached', async () => {
      const cached = await isChordModelCached('rnn');
      expect(cached).toBe(false);
    });

    it('returns true when model is cached', async () => {
      const meta = CHORD_MODEL_REGISTRY['rnn'];
      mockCache.set(meta.cacheKey, new ArrayBuffer(10));

      const cached = await isChordModelCached('rnn');
      expect(cached).toBe(true);
    });
  });

  describe('loadChordModelBytes', () => {
    it('returns cached model without fetching', async () => {
      const meta = CHORD_MODEL_REGISTRY['rnn'];
      const buffer = new ArrayBuffer(100);
      mockCache.set(meta.cacheKey, buffer);

      const onProgress = vi.fn();
      const result = await loadChordModelBytes('rnn', onProgress);

      expect(result).toBe(buffer);
      expect(onProgress).toHaveBeenCalledWith(100, expect.stringContaining('loaded from cache'));
    });

    it('fetches model from network when not cached', async () => {
      const modelBuffer = new ArrayBuffer(50);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({ 'Content-Length': '50' }),
        body: null,
        arrayBuffer: vi.fn().mockResolvedValue(modelBuffer),
      } as unknown as Response);

      const onProgress = vi.fn();
      const result = await loadChordModelBytes('rnn', onProgress);

      expect(result).toBe(modelBuffer);
      expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('Downloading'));
      expect(onProgress).toHaveBeenCalledWith(100, expect.stringContaining('ready'));

      // Should be cached now
      expect(mockCache.has(CHORD_MODEL_REGISTRY['rnn'].cacheKey)).toBe(true);
    });

    it('throws on failed fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(loadChordModelBytes('rnn'))
        .rejects.toThrow('Failed to download Recurrent Network: 404 Not Found');
    });

    it('handles streaming response with reader', async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5, 6]);

      const reader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: chunk1 })
          .mockResolvedValueOnce({ done: false, value: chunk2 })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({ 'Content-Length': '6' }),
        body: { getReader: () => reader },
      } as unknown as Response);

      const onProgress = vi.fn();
      const result = await loadChordModelBytes('rnn', onProgress);

      expect(result.byteLength).toBe(6);
      const view = new Uint8Array(result);
      expect(Array.from(view)).toEqual([1, 2, 3, 4, 5, 6]);

      // Check that progress was reported
      expect(onProgress).toHaveBeenCalledWith(
        50, // 3/6 * 100 = 50%
        expect.stringContaining('Downloading'),
      );
    });
  });
});

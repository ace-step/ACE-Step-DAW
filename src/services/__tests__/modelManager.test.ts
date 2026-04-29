import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModelBytes, isModelCached, getModelMeta, MODEL_REGISTRY } from '../modelManager';

// Mock idb-keyval
vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    createStore: vi.fn(() => ({})),
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    _store: store,
  };
});

// Access the mock store
import { _store as mockStore, get as mockGet, set as mockSet } from 'idb-keyval';

beforeEach(() => {
  (mockStore as Map<string, unknown>).clear();
  vi.clearAllMocks();
});

describe('getModelMeta', () => {
  it('returns metadata for beat-this-small', () => {
    const meta = getModelMeta('beat-this-small');
    expect(meta.id).toBe('beat-this-small');
    expect(meta.name).toBe('Beat This! (small)');
    expect(meta.sizeBytes).toBeGreaterThan(0);
    expect(meta.url).toContain('.onnx');
    expect(meta.cacheKey).toBe('onnx-model:beat-this-small');
  });

  it('returns metadata for consonance-ace', () => {
    const meta = getModelMeta('consonance-ace');
    expect(meta.id).toBe('consonance-ace');
    expect(meta.name).toBe('Consonance-ACE');
  });
});

describe('isModelCached', () => {
  it('returns false when model is not cached', async () => {
    expect(await isModelCached('beat-this-small')).toBe(false);
  });

  it('returns true when model is cached', async () => {
    const meta = MODEL_REGISTRY['beat-this-small'];
    (mockStore as Map<string, unknown>).set(meta.cacheKey, new ArrayBuffer(100));
    expect(await isModelCached('beat-this-small')).toBe(true);
  });
});

describe('loadModelBytes', () => {
  it('returns cached model without fetching', async () => {
    const meta = MODEL_REGISTRY['beat-this-small'];
    const cachedBuffer = new ArrayBuffer(42);
    (mockStore as Map<string, unknown>).set(meta.cacheKey, cachedBuffer);

    const onProgress = vi.fn();
    const result = await loadModelBytes('beat-this-small', onProgress);

    expect(result).toBe(cachedBuffer);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 100, bytesLoaded: 42, bytesTotal: 42 }),
    );
  });

  it('fetches model when not cached and reports progress', async () => {
    const fakeData = new Uint8Array([1, 2, 3, 4, 5]);
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: fakeData })
        .mockResolvedValueOnce({ done: true }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => (h === 'Content-Length' ? '5' : null) },
      body: { getReader: () => mockReader },
    }) as unknown as typeof fetch;

    const onProgress = vi.fn();
    const result = await loadModelBytes('beat-this-small', onProgress);

    expect(result.byteLength).toBe(5);
    expect(new Uint8Array(result)).toEqual(fakeData);

    // Should have been cached
    expect(mockSet).toHaveBeenCalledWith('onnx-model:beat-this-small', result);

    // Progress reported
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ bytesLoaded: 5, percent: 100 }),
    );
  });

  it('throws on fetch error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }) as unknown as typeof fetch;

    await expect(loadModelBytes('beat-this-small')).rejects.toThrow('Failed to download model');
  });
});

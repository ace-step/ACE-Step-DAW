import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveVideoBlob, loadVideoBlob, deleteVideoBlob, deleteAllProjectVideos } from '../videoStorageService';

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
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    keys: vi.fn(() => Promise.resolve([...store.keys()])),
    __store: store,
  };
});

describe('videoStorageService', () => {
  beforeEach(async () => {
    const { __store } = await import('idb-keyval') as unknown as { __store: Map<string, unknown> };
    __store.clear();
  });

  it('saves a video blob and returns a key', async () => {
    const blob = new Blob(['fake-video'], { type: 'video/mp4' });
    const key = await saveVideoBlob('proj-1', 'clip-1', blob);

    expect(key).toContain('video:proj-1:clip-1:');
    expect(typeof key).toBe('string');
  });

  it('loads a video blob by key', async () => {
    const blob = new Blob(['test-video'], { type: 'video/mp4' });
    const key = await saveVideoBlob('proj-1', 'clip-1', blob);
    const loaded = await loadVideoBlob(key);

    expect(loaded).toBeDefined();
    expect(loaded).toBeInstanceOf(Blob);
  });

  it('returns undefined for non-existent key', async () => {
    const loaded = await loadVideoBlob('video:nonexistent');
    expect(loaded).toBeUndefined();
  });

  it('deletes a video blob by key', async () => {
    const blob = new Blob(['test-video'], { type: 'video/mp4' });
    const key = await saveVideoBlob('proj-1', 'clip-1', blob);
    await deleteVideoBlob(key);

    const loaded = await loadVideoBlob(key);
    expect(loaded).toBeUndefined();
  });

  it('deletes all video blobs for a project', async () => {
    const blob = new Blob(['v'], { type: 'video/mp4' });
    await saveVideoBlob('proj-1', 'clip-1', blob);
    await saveVideoBlob('proj-1', 'clip-2', blob);
    await saveVideoBlob('proj-2', 'clip-1', blob);

    await deleteAllProjectVideos('proj-1');

    const { __store } = await import('idb-keyval') as unknown as { __store: Map<string, unknown> };
    const remaining = [...__store.keys()].filter(k => typeof k === 'string' && k.startsWith('video:proj-1:'));
    expect(remaining).toHaveLength(0);

    // proj-2 data should still exist
    const proj2Keys = [...__store.keys()].filter(k => typeof k === 'string' && k.startsWith('video:proj-2:'));
    expect(proj2Keys).toHaveLength(1);
  });
});

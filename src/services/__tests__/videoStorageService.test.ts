import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval before importing the module
const mockStore = new Map<string, any>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, value: any) => { mockStore.set(key, value); return Promise.resolve(); }),
  del: vi.fn((key: string) => { mockStore.delete(key); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...mockStore.keys()])),
}));

import {
  saveVideoBlob,
  loadVideoBlob,
  deleteVideoBlob,
  deleteAllProjectVideo,
  getVideoObjectURL,
} from '../videoStorageService';

describe('videoStorageService', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  describe('saveVideoBlob', () => {
    it('stores a blob and returns a key', async () => {
      const blob = new Blob(['video-data'], { type: 'video/mp4' });
      const key = await saveVideoBlob('proj-1', 'clip-1', blob);

      expect(key).toMatch(/^video:proj-1:clip-1:/);
      expect(mockStore.has(key)).toBe(true);
      expect(mockStore.get(key)).toBe(blob);
    });

    it('generates unique keys for the same clip', async () => {
      const blob = new Blob(['data']);
      const key1 = await saveVideoBlob('p', 'c', blob);
      const key2 = await saveVideoBlob('p', 'c', blob);
      expect(key1).not.toBe(key2);
    });

    it('key format includes project and clip ids', async () => {
      const key = await saveVideoBlob('myProject', 'myClip', new Blob([]));
      expect(key.startsWith('video:myProject:myClip:')).toBe(true);
    });
  });

  describe('loadVideoBlob', () => {
    it('loads a stored blob by key', async () => {
      const blob = new Blob(['test']);
      const key = await saveVideoBlob('p', 'c', blob);
      const loaded = await loadVideoBlob(key);
      expect(loaded).toBe(blob);
    });

    it('returns undefined for missing key', async () => {
      const result = await loadVideoBlob('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('deleteVideoBlob', () => {
    it('removes a blob by key', async () => {
      const key = await saveVideoBlob('p', 'c', new Blob([]));
      expect(mockStore.has(key)).toBe(true);
      await deleteVideoBlob(key);
      expect(mockStore.has(key)).toBe(false);
    });
  });

  describe('deleteAllProjectVideo', () => {
    it('deletes all video blobs for a project', async () => {
      await saveVideoBlob('proj-1', 'c1', new Blob([]));
      await saveVideoBlob('proj-1', 'c2', new Blob([]));
      await saveVideoBlob('proj-2', 'c3', new Blob([]));

      expect(mockStore.size).toBe(3);
      await deleteAllProjectVideo('proj-1');

      // Only proj-2 blob remains
      const remaining = [...mockStore.keys()];
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatch(/^video:proj-2:/);
    });

    it('does nothing if no video blobs exist for the project', async () => {
      await saveVideoBlob('other', 'c', new Blob([]));
      await deleteAllProjectVideo('nonexistent');
      expect(mockStore.size).toBe(1);
    });
  });

  describe('getVideoObjectURL', () => {
    it('returns an object URL for a stored blob', async () => {
      const blob = new Blob(['video'], { type: 'video/mp4' });
      const key = await saveVideoBlob('p', 'c', blob);

      // Mock URL.createObjectURL
      const originalCreate = URL.createObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-url');

      const url = await getVideoObjectURL(key);
      expect(url).toBe('blob:http://localhost/test-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

      URL.createObjectURL = originalCreate;
    });

    it('returns null for missing key', async () => {
      const url = await getVideoObjectURL('nonexistent');
      expect(url).toBeNull();
    });
  });
});

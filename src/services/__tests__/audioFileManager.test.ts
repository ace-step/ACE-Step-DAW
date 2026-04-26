import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveAudioBlob,
  loadAudioBlob,
  loadAudioBlobByKey,
  deleteAudioBlob,
  deleteAllProjectAudio,
} from '../audioFileManager';

// Mock idb-keyval
const mockStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve(Array.from(mockStore.keys()))),
}));

describe('audioFileManager', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  describe('saveAudioBlob', () => {
    it('saves a blob and returns a key', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/wav' });
      const key = await saveAudioBlob('proj-1', 'clip-1', 'cumulative', blob);

      expect(key).toContain('audio:proj-1:clip-1:cumulative:');
      expect(mockStore.get(key)).toBe(blob);
    });

    it('generates unique keys for successive saves', async () => {
      const blob1 = new Blob(['audio 1']);
      const blob2 = new Blob(['audio 2']);

      const key1 = await saveAudioBlob('proj-1', 'clip-1', 'isolated', blob1);
      const key2 = await saveAudioBlob('proj-1', 'clip-1', 'isolated', blob2);

      expect(key1).not.toBe(key2);
    });

    it('stores the correct type in the key', async () => {
      const blob = new Blob(['data']);
      const cumulativeKey = await saveAudioBlob('p', 'c', 'cumulative', blob);
      const isolatedKey = await saveAudioBlob('p', 'c', 'isolated', blob);

      expect(cumulativeKey).toContain(':cumulative:');
      expect(isolatedKey).toContain(':isolated:');
    });
  });

  describe('loadAudioBlob', () => {
    it('loads a blob by the unversioned key (legacy format)', async () => {
      // loadAudioBlob uses the unversioned key format: audio:project:clip:type
      const blob = new Blob(['saved audio']);
      mockStore.set('audio:proj-1:clip-1:cumulative', blob);

      const loaded = await loadAudioBlob('proj-1', 'clip-1', 'cumulative');
      expect(loaded).toBe(blob);
    });

    it('loads a saved blob via loadAudioBlobByKey using the key from saveAudioBlob', async () => {
      const blob = new Blob(['saved audio']);
      const key = await saveAudioBlob('proj-1', 'clip-1', 'cumulative', blob);

      const loadedByKey = await loadAudioBlobByKey(key);
      expect(loadedByKey).toBe(blob);
    });

    it('returns undefined when not found', async () => {
      const loaded = await loadAudioBlob('nonexistent', 'clip', 'cumulative');
      expect(loaded).toBeUndefined();
    });
  });

  describe('loadAudioBlobByKey', () => {
    it('loads a blob by exact key', async () => {
      const blob = new Blob(['keyed audio']);
      mockStore.set('custom-key-123', blob);

      const loaded = await loadAudioBlobByKey('custom-key-123');
      expect(loaded).toBe(blob);
    });

    it('returns undefined for missing key', async () => {
      const loaded = await loadAudioBlobByKey('missing');
      expect(loaded).toBeUndefined();
    });
  });

  describe('deleteAudioBlob', () => {
    it('deletes the unversioned key (legacy format)', async () => {
      // deleteAudioBlob targets the unversioned key: audio:project:clip:type
      mockStore.set('audio:proj-1:clip-1:isolated', new Blob(['data']));

      await deleteAudioBlob('proj-1', 'clip-1', 'isolated');

      expect(mockStore.has('audio:proj-1:clip-1:isolated')).toBe(false);
    });

    it('note: versioned keys from saveAudioBlob are cleaned via deleteAllProjectAudio', async () => {
      // saveAudioBlob creates versioned keys (audio:...:type:suffix)
      // deleteAudioBlob only removes the unversioned key
      // deleteAllProjectAudio handles cleanup of versioned keys by prefix
      const blob = new Blob(['data']);
      const key = await saveAudioBlob('proj-1', 'clip-1', 'isolated', blob);

      expect(mockStore.has(key)).toBe(true);

      await deleteAllProjectAudio('proj-1');

      expect(mockStore.has(key)).toBe(false);
    });
  });

  describe('deleteAllProjectAudio', () => {
    it('deletes all audio for a given project', async () => {
      mockStore.set('audio:proj-1:clip-1:cumulative', new Blob(['a']));
      mockStore.set('audio:proj-1:clip-2:isolated', new Blob(['b']));
      mockStore.set('audio:proj-2:clip-1:cumulative', new Blob(['c']));

      await deleteAllProjectAudio('proj-1');

      expect(mockStore.has('audio:proj-1:clip-1:cumulative')).toBe(false);
      expect(mockStore.has('audio:proj-1:clip-2:isolated')).toBe(false);
      // proj-2 audio should remain
      expect(mockStore.has('audio:proj-2:clip-1:cumulative')).toBe(true);
    });

    it('handles empty store gracefully', async () => {
      await deleteAllProjectAudio('nonexistent');
      // Should not throw
    });

    it('only deletes keys with correct prefix', async () => {
      mockStore.set('audio:proj-1:clip-1:cumulative', new Blob(['a']));
      mockStore.set('other:proj-1:data', new Blob(['b']));
      mockStore.set('audio:proj-10:clip-1:cumulative', new Blob(['c']));

      await deleteAllProjectAudio('proj-1');

      expect(mockStore.has('audio:proj-1:clip-1:cumulative')).toBe(false);
      expect(mockStore.has('other:proj-1:data')).toBe(true);
      expect(mockStore.has('audio:proj-10:clip-1:cumulative')).toBe(true);
    });
  });
});

/**
 * Tests for Strudel Freeze/Bounce to Audio — Issue #758
 *
 * Tests the store action `freezeStrudelToAudio(trackId, bars)` which:
 * 1. Reads the strudel track's code
 * 2. Renders N bars to an audio buffer via OfflineAudioContext
 * 3. Creates a new stems track with the rendered audio clip
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import type { Track } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const DEFAULT_PROJECT = {
  id: 'test-project',
  name: 'Test',
  bpm: 120,
  timeSignature: 4,
  measures: 64,
  totalDuration: 128,
  tracks: [],
  tempoMap: [],
  timeSignatureMap: [],
  sampleRate: 44100,
  keyScale: 'C major',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  masterVolume: 0,
};

describe('Strudel Freeze/Bounce to Audio', () => {
  let store: ReturnType<typeof useProjectStore.getState>;
  let strudelTrack: Track;

  beforeEach(() => {
    useProjectStore.setState({ project: DEFAULT_PROJECT as never });
    store = useProjectStore.getState();
    strudelTrack = store.addTrack('custom', 'strudel');
    store = useProjectStore.getState();

    store.updateStrudelCode(strudelTrack.id, 's("[bd sd]*2").bank("RolandTR808")');
    store = useProjectStore.getState();
  });

  it('should have freezeStrudelToAudio action on store', () => {
    expect(typeof store.freezeStrudelToAudio).toBe('function');
  });

  it('should throw if track is not a strudel track', async () => {
    const audioTrack = store.addTrack('custom', 'stems');
    store = useProjectStore.getState();
    await expect(store.freezeStrudelToAudio(audioTrack.id, 4)).rejects.toThrow(/not a strudel track/i);
  });

  it('should throw if track has no strudel code', async () => {
    store.updateStrudelCode(strudelTrack.id, '');
    store = useProjectStore.getState();
    await expect(store.freezeStrudelToAudio(strudelTrack.id, 4)).rejects.toThrow(/no strudel code/i);
  });

  it('should reject invalid bars parameter', async () => {
    await expect(store.freezeStrudelToAudio(strudelTrack.id, 0)).rejects.toThrow(/bars must be/i);
    await expect(store.freezeStrudelToAudio(strudelTrack.id, -1)).rejects.toThrow(/bars must be/i);
  });

  it('should throw for non-existent track', async () => {
    await expect(store.freezeStrudelToAudio('non-existent', 4)).rejects.toThrow(/not a strudel track/i);
  });
});

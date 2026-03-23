import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../hooks/useRecording', () => ({
  useRecording: () => ({ armedTrackIds: [], toggleArmTrack: vi.fn() }),
}));
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({ getTrackLevel: () => 0 }),
}));

import { useProjectStore } from '../projectStore';

describe('Strudel pattern versioning', () => {
  let strudelTrackId: string;

  beforeEach(() => {
    useProjectStore.getState().createProject('Test Project');
    const track = useProjectStore.getState().addTrack('custom', 'strudel');
    strudelTrackId = track.id;
    // Set initial code
    useProjectStore.getState().updateStrudelCode(strudelTrackId, 's("bd sd")');
  });

  it('captureStrudelVersion captures current code as a version', () => {
    const store = useProjectStore.getState();
    store.captureStrudelVersion(strudelTrackId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === strudelTrackId)!;
    expect(track.strudelVersions).toHaveLength(1);
    expect(track.strudelVersions![0].code).toBe('s("bd sd")');
    expect(track.strudelVersions![0].timestamp).toBeGreaterThan(0);
  });

  it('captureStrudelVersion with label', () => {
    const store = useProjectStore.getState();
    store.captureStrudelVersion(strudelTrackId, 'v1 drums');

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === strudelTrackId)!;
    expect(track.strudelVersions![0].label).toBe('v1 drums');
  });

  it('captures multiple versions', () => {
    const store = useProjectStore.getState();
    store.captureStrudelVersion(strudelTrackId, 'v1');

    store.updateStrudelCode(strudelTrackId, 's("bd sd hh oh")');
    store.captureStrudelVersion(strudelTrackId, 'v2');

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === strudelTrackId)!;
    expect(track.strudelVersions).toHaveLength(2);
    expect(track.strudelVersions![0].code).toBe('s("bd sd")');
    expect(track.strudelVersions![1].code).toBe('s("bd sd hh oh")');
  });

  it('restoreStrudelVersion updates strudelCode from version', () => {
    const store = useProjectStore.getState();
    store.captureStrudelVersion(strudelTrackId, 'v1');

    store.updateStrudelCode(strudelTrackId, 's("bd sd hh oh")');
    store.captureStrudelVersion(strudelTrackId, 'v2');

    // Restore v1
    store.restoreStrudelVersion(strudelTrackId, 0);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === strudelTrackId)!;
    expect(track.strudelCode).toBe('s("bd sd")');
  });

  it('does nothing for non-existent track', () => {
    const store = useProjectStore.getState();
    // Should not throw
    store.captureStrudelVersion('nonexistent');
    store.restoreStrudelVersion('nonexistent', 0);
  });

  it('does nothing for non-strudel track', () => {
    const store = useProjectStore.getState();
    const pianoTrack = store.addTrack('keyboard', 'pianoRoll');
    store.captureStrudelVersion(pianoTrack.id);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === pianoTrack.id)!;
    expect(track.strudelVersions).toBeUndefined();
  });
});

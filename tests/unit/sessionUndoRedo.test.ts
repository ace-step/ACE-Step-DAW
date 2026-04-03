import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('session clip undo/redo integration', () => {
  let trackId: string;
  let clipId: string;
  let sceneId: string;

  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });

    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    trackId = track.id;
    const clip = store.addClip(trackId, {
      startTime: 0,
      duration: 2,
      prompt: 'Kick groove',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    clipId = clip.id;

    const session = useProjectStore.getState().project?.session;
    sceneId = session!.scenes[0].id;

    useTransportStore.setState({ currentTime: 0, isPlaying: false });
  });

  it('undo after launchSessionClip restores previous session state', () => {
    // Before launch — no active clip
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();

    // Launch clip
    useProjectStore.getState().launchSessionClip(trackId, sceneId);
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

    // Undo — should restore to no active clip
    useProjectStore.getState().undo('session');
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();
  });

  it('redo after undo restores the launched clip', () => {
    useProjectStore.getState().launchSessionClip(trackId, sceneId);
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

    useProjectStore.getState().undo('session');
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();

    useProjectStore.getState().redo('session');
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);
  });

  it('undo after stopSessionTrack restores the active clip', () => {
    // Launch then stop
    useProjectStore.getState().launchSessionClip(trackId, sceneId);
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

    useProjectStore.getState().stopSessionTrack(trackId);
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();

    // Undo the stop — should restore active clip
    useProjectStore.getState().undo('session');
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);
  });

  it('undo after stopAllSessionClips restores all active clips', () => {
    // Launch clip
    useProjectStore.getState().launchSessionClip(trackId, sceneId);
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

    useProjectStore.getState().stopAllSessionClips();
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();

    // Undo — should restore active clips
    useProjectStore.getState().undo('session');
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);
  });

  it('session undo history entries have correct labels', () => {
    useProjectStore.getState().launchSessionClip(trackId, sceneId);
    const history = useProjectStore.getState().getUndoHistory('session');
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].label).toBe('Launch session clip');
  });
});

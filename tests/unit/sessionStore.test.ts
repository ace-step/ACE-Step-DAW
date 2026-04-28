import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('session clip launcher store', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('auto-assigns new clips into session slots and commits quantized launches', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clip = store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'Kick groove',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });

    const session = useProjectStore.getState().project?.session;
    const firstScene = session?.scenes[0];
    expect(firstScene).not.toBeUndefined();
    expect(session?.slots.find((slot) => slot.trackId === track.id && slot.sceneId === firstScene?.id)?.clipId).toBe(clip.id);

    useTransportStore.setState({ currentTime: 2.1, isPlaying: true });
    store.launchSessionClip(track.id, firstScene!.id);

    let nextSession = useProjectStore.getState().project?.session;
    expect(nextSession?.pendingLaunches).toHaveLength(1);
    expect(nextSession?.activeClipIdsByTrackId[track.id]).toBeUndefined();

    store.commitPendingSessionLaunches(4);
    nextSession = useProjectStore.getState().project?.session;
    expect(nextSession?.pendingLaunches).toHaveLength(0);
    expect(nextSession?.activeClipIdsByTrackId[track.id]).toBe(clip.id);
  });

  it('prints launched session clips into arrangement clips', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('bass');
    const sourceClip = store.addClip(track.id, {
      startTime: 0,
      duration: 4,
      prompt: 'Bass riff',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    const session = useProjectStore.getState().project?.session;
    const firstScene = session?.scenes[0];
    expect(firstScene).not.toBeUndefined();

    useTransportStore.setState({ currentTime: 0, isPlaying: false });
    store.startSessionArrangementRecording(0);
    store.launchSessionClip(track.id, firstScene!.id);
    useTransportStore.setState({ currentTime: 1.5, isPlaying: false });
    store.stopSessionTrack(track.id);
    const printed = store.stopSessionArrangementRecording(1.5);

    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({
      trackId: track.id,
      startTime: 0,
      duration: 1.5,
    });

    const project = useProjectStore.getState().project;
    const trackClips = project?.tracks.find((candidate) => candidate.id === track.id)?.clips ?? [];
    expect(trackClips).toHaveLength(2);
    expect(trackClips[0].id).toBe(sourceClip.id);
    expect(trackClips[1].startTime).toBe(0);
    expect(trackClips[1].duration).toBe(1.5);
    expect(project?.session?.isRecordingToArrangement).toBe(false);
  });
});

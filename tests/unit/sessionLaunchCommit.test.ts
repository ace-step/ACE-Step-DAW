import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('commitPendingSessionLaunches', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('does nothing when there are no pending launches', () => {
    useProjectStore.getState().commitPendingSessionLaunches(10);
    const session = useProjectStore.getState().project?.session;
    expect(session?.pendingLaunches).toHaveLength(0);
  });

  it('commits a clip launch when currentTime passes executeAt', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clip = store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'kick',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });

    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();
    const scene = session?.scenes[0];
    expect(scene).toBeDefined();

    // Make sure transport is playing so launch is quantized
    useTransportStore.setState({ currentTime: 0.5, isPlaying: true });
    useProjectStore.getState().launchSessionClip(track.id, scene!.id);

    let pending = useProjectStore.getState().project?.session?.pendingLaunches ?? [];
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]).toBeDefined();

    // Advance time past the execute-at point
    const executeAt = pending[0].executeAt;
    useProjectStore.getState().commitPendingSessionLaunches(executeAt + 0.01);

    pending = useProjectStore.getState().project?.session?.pendingLaunches ?? [];
    expect(pending).toHaveLength(0);

    // Clip should now be active
    const active = useProjectStore.getState().project?.session?.activeClipIdsByTrackId[track.id];
    expect(active).toBe(clip.id);
  });

  it('does not commit launches scheduled in the future', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'kick',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });

    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();
    const scene = session?.scenes[0];
    expect(scene).toBeDefined();

    useTransportStore.setState({ currentTime: 0.5, isPlaying: true });
    useProjectStore.getState().launchSessionClip(track.id, scene!.id);

    const pending = useProjectStore.getState().project?.session?.pendingLaunches ?? [];
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]).toBeDefined();
    const executeAt = pending[0].executeAt;

    // Commit at time BEFORE executeAt
    useProjectStore.getState().commitPendingSessionLaunches(executeAt - 1);

    const stillPending = useProjectStore.getState().project?.session?.pendingLaunches ?? [];
    expect(stillPending.length).toBeGreaterThanOrEqual(1);
  });

  it('commits scene launches activating all clips in scene', () => {
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');
    const track2 = store.addTrack('bass');
    const clip1 = store.addClip(track1.id, {
      startTime: 0,
      duration: 2,
      prompt: 'kick',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    const clip2 = store.addClip(track2.id, {
      startTime: 0,
      duration: 2,
      prompt: 'bass',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });

    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();
    const scene = session?.scenes[0];
    expect(scene).toBeDefined();

    // Queue scene launch while playing (quantized)
    useTransportStore.setState({ currentTime: 0.5, isPlaying: true });
    useProjectStore.getState().launchSessionScene(scene!.id);

    const pending = useProjectStore.getState().project?.session?.pendingLaunches ?? [];
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]).toBeDefined();

    // Commit past the executeAt time
    useProjectStore.getState().commitPendingSessionLaunches(pending[0].executeAt + 0.01);

    const active = useProjectStore.getState().project?.session?.activeClipIdsByTrackId;
    expect(active?.[track1.id]).toBe(clip1.id);
    expect(active?.[track2.id]).toBe(clip2.id);
  });
});

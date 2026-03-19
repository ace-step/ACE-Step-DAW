import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('sends/returns mixer buses', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
  });

  it('addReturnTrack creates a return track with defaults', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Reverb Bus');
    expect(rt.name).toBe('Reverb Bus');
    expect(rt.volume).toBe(1);
    expect(rt.pan).toBe(0);
    expect(rt.effects).toEqual([]);
    const returnTracks = useProjectStore.getState().project!.returnTracks!;
    expect(returnTracks).toHaveLength(1);
    expect(returnTracks[0].id).toBe(rt.id);
  });

  it('removeReturnTrack deletes the bus and cleans up sends on all tracks', () => {
    const store = useProjectStore.getState();
    // Add a track and a return track
    store.addTrack('stems');
    const rt = store.addReturnTrack('Delay Bus');
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    // Wire a send
    store.updateTrackSend(trackId, rt.id, 0.5);
    expect(useProjectStore.getState().project!.tracks[0].sends).toHaveLength(1);
    // Remove the return track
    store.removeReturnTrack(rt.id);
    expect(useProjectStore.getState().project!.returnTracks).toHaveLength(0);
    // Send referencing deleted return track should be cleaned up
    expect(useProjectStore.getState().project!.tracks[0].sends).toHaveLength(0);
  });

  it('updateTrackSend adds, updates, and removes sends', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    const rt = store.addReturnTrack();
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    // Add a send
    store.updateTrackSend(trackId, rt.id, 0.7);
    let sends = useProjectStore.getState().project!.tracks[0].sends!;
    expect(sends).toHaveLength(1);
    expect(sends[0].returnTrackId).toBe(rt.id);
    expect(sends[0].amount).toBe(0.7);

    // Update send amount
    store.updateTrackSend(trackId, rt.id, 0.3);
    sends = useProjectStore.getState().project!.tracks[0].sends!;
    expect(sends).toHaveLength(1);
    expect(sends[0].amount).toBe(0.3);

    // Remove send by setting amount to 0
    store.updateTrackSend(trackId, rt.id, 0);
    sends = useProjectStore.getState().project!.tracks[0].sends!;
    expect(sends).toHaveLength(0);
  });
});

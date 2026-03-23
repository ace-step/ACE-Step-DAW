import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useUIStore } from '../uiStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Delete track confirmation flow', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useUIStore.setState({ pendingDeleteTrackIds: null });
  });

  it('stores pending track IDs when requesting deletion of tracks with multiple clips', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('stems');

    // Add two clips to the track
    store.addClip(track.id, { type: 'stems', startTime: 0, duration: 4, label: 'Clip 1' });
    store.addClip(track.id, { type: 'stems', startTime: 4, duration: 4, label: 'Clip 2' });

    const ui = useUIStore.getState();
    ui.requestDeleteTracks([track.id]);

    // Should show confirmation dialog
    expect(useUIStore.getState().pendingDeleteTrackIds).toEqual([track.id]);
  });

  it('deletes immediately when track has 0 or 1 clip', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('stems');

    // Only one clip
    store.addClip(track.id, { type: 'stems', startTime: 0, duration: 4, label: 'Clip 1' });

    const ui = useUIStore.getState();
    ui.requestDeleteTracks([track.id]);

    // Should delete immediately, no dialog
    expect(useUIStore.getState().pendingDeleteTrackIds).toBeNull();
    expect(useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)).toBeUndefined();
  });

  it('deletes immediately when track has no clips', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('stems');

    const ui = useUIStore.getState();
    ui.requestDeleteTracks([track.id]);

    // Should delete immediately, no dialog
    expect(useUIStore.getState().pendingDeleteTrackIds).toBeNull();
    expect(useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)).toBeUndefined();
  });

  it('confirms deletion removes tracks and clears pending state', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('stems');
    store.addClip(track.id, { type: 'stems', startTime: 0, duration: 4, label: 'Clip 1' });
    store.addClip(track.id, { type: 'stems', startTime: 4, duration: 4, label: 'Clip 2' });

    const ui = useUIStore.getState();
    ui.requestDeleteTracks([track.id]);

    // Dialog is showing
    expect(useUIStore.getState().pendingDeleteTrackIds).toEqual([track.id]);

    // Confirm deletion
    useUIStore.getState().confirmDeleteTracks();

    expect(useUIStore.getState().pendingDeleteTrackIds).toBeNull();
    expect(useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)).toBeUndefined();
  });

  it('cancelling deletion clears pending state without removing tracks', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('stems');
    store.addClip(track.id, { type: 'stems', startTime: 0, duration: 4, label: 'Clip 1' });
    store.addClip(track.id, { type: 'stems', startTime: 4, duration: 4, label: 'Clip 2' });

    const ui = useUIStore.getState();
    ui.requestDeleteTracks([track.id]);

    expect(useUIStore.getState().pendingDeleteTrackIds).toEqual([track.id]);

    // Cancel deletion
    useUIStore.getState().cancelDeleteTracks();

    expect(useUIStore.getState().pendingDeleteTrackIds).toBeNull();
    // Track still exists
    expect(useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)).toBeDefined();
  });
});

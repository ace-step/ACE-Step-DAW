import { beforeEach, describe, expect, it } from 'vitest';
import { resolveFocusedTrackId } from '../../src/services/focusResolution';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('focusResolution', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('returns null when no project exists', () => {
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('returns null when project has no tracks', () => {
    useProjectStore.getState().createProject({ name: 'Empty' });
    // Remove all tracks
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: { ...project, tracks: [] },
    });
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('prioritizes keyboard context trackId when it exists in the project', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.getState().setKeyboardContext('timeline', track2.id);

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('ignores keyboard context trackId that is not in the project', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.getState().setKeyboardContext('timeline', 'nonexistent-id');

    // Falls back to first track since the keyboard trackId is invalid
    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('falls back to openPianoRollTrackId when keyboard context has no trackId', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({ openPianoRollTrackId: track2.id });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to openSequencerTrackId when piano roll is not open', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({
      openPianoRollTrackId: null,
      openSequencerTrackId: track2.id,
    });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to openDrumMachineTrackId when sequencer is not open', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({
      openPianoRollTrackId: null,
      openSequencerTrackId: null,
      openDrumMachineTrackId: track2.id,
    });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to expandedTrackId when no editor is open', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({
      openPianoRollTrackId: null,
      openSequencerTrackId: null,
      openDrumMachineTrackId: null,
      expandedTrackId: track2.id,
    });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('resolves track from selected clip IDs when no editor is open', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    // Add a clip to track2
    useProjectStore.getState().addClip(track2.id, {
      startTime: 0,
      duration: 4,
      name: 'Test Clip',
    });

    const clipId = useProjectStore.getState().project!.tracks.find(
      (t) => t.id === track2.id,
    )!.clips[0].id;

    useUIStore.setState({ selectedClipIds: new Set([clipId]) });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to the first track when no other signal is available', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track1 = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addTrack('bass');

    // No keyboard context, no editors, no selected clips
    expect(resolveFocusedTrackId()).toBe(track1.id);
  });

  it('ignores editor trackIds not present in the project', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.setState({ openPianoRollTrackId: 'deleted-track-id' });

    // Falls back to first track
    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('ignores selected clips that do not belong to any track', () => {
    useProjectStore.getState().createProject({ name: 'Focus Test' });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.setState({ selectedClipIds: new Set(['nonexistent-clip']) });

    // Falls back to first track
    expect(resolveFocusedTrackId()).toBe(track.id);
  });
});

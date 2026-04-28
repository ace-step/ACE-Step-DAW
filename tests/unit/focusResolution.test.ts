import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFocusedTrackId } from '../../src/services/focusResolution';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('resolveFocusedTrackId', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('returns null when no project exists', () => {
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('returns null when project has no tracks', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('returns first track when no focus context is set', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track = useProjectStore.getState().addTrack('drums');

    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('prioritizes keyboardContext.trackId over all others', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.getState().setKeyboardContext('timeline', track2.id);
    useUIStore.getState().setExpandedTrackId(track1.id);

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('ignores stale keyboardContext.trackId and falls back', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.getState().setKeyboardContext('timeline', 'non-existent-track');

    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('falls back to openPianoRollTrackId when no keyboard context exists', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.getState().setOpenPianoRoll(track2.id);
    useUIStore.setState((state) => ({
      keyboardContext: { ...state.keyboardContext, trackId: null },
    }));

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to openSequencerTrackId when piano roll is not open', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({
      openPianoRollTrackId: null,
      openSequencerTrackId: track2.id,
    });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to openDrumMachineTrackId when sequencer is not open', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.setState({
      openPianoRollTrackId: null,
      openSequencerTrackId: null,
      openDrumMachineTrackId: track2.id,
    });

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to expandedTrackId when no editor is open', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');

    useUIStore.getState().setExpandedTrackId(track2.id);

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to track owning selected clip', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track = useProjectStore.getState().addTrack('drums');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });

    useUIStore.getState().selectClips([clip.id]);

    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('ignores stale editor trackIds not present in the project', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.setState({ openPianoRollTrackId: 'deleted-track-id' });

    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('ignores selected clips that do not belong to any track', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const track = useProjectStore.getState().addTrack('drums');

    useUIStore.getState().selectClips(['nonexistent-clip']);

    expect(resolveFocusedTrackId()).toBe(track.id);
  });
});

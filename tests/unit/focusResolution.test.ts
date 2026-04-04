import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFocusedTrackId } from '../../src/services/focusResolution';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('resolveFocusedTrackId', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('returns null when no project exists', () => {
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('returns first track when no focus context is set', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');

    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('prioritizes keyboardContext.trackId over all others', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');
    const track2 = store.addTrack('bass');

    // Set both keyboard context and expanded track
    useUIStore.getState().setKeyboardContext('timeline', track2.id);
    useUIStore.getState().setExpandedTrackId(track1.id);

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to openPianoRollTrackId when no keyboard context', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    store.addTrack('drums');
    const track2 = store.addTrack('bass');

    useUIStore.getState().setOpenPianoRoll(track2.id);
    // Clear keyboardContext.trackId so the fallback to openPianoRollTrackId is exercised
    useUIStore.setState((state) => ({
      ...state,
      keyboardContext: { ...state.keyboardContext, trackId: null },
    }));

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to expandedTrackId', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');
    const track2 = store.addTrack('bass');

    useUIStore.getState().setExpandedTrackId(track2.id);

    expect(resolveFocusedTrackId()).toBe(track2.id);
  });

  it('falls back to track owning selected clip', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clip = store.addClip(track.id, {
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

  it('ignores stale trackId not in project', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');

    // Set keyboard context to a non-existent track
    useUIStore.getState().setKeyboardContext('timeline', 'non-existent-track');

    // Should skip the stale ID and fall back to the first real track
    expect(resolveFocusedTrackId()).toBe(track.id);
  });

  it('returns null when project has no tracks', () => {
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
    // Project exists but has no tracks
    expect(resolveFocusedTrackId()).toBeNull();
  });
});

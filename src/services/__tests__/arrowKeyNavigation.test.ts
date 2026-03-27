import { describe, it, expect, beforeEach } from 'vitest';
import type { Clip, MidiNote, Track, Project } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import {
  navigateTimelineByArrow,
  navigateMixerByArrow,
  navigatePianoRollByArrow,
} from '../arrowKeyNavigation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let clipCounter = 0;
let noteCounter = 0;

function makeClip(overrides: Partial<Clip> = {}): Clip {
  clipCounter++;
  return {
    id: `clip-${clipCounter}`,
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    prompt: '',
    lyrics: '',
    generationStatus: 'idle',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  } as Clip;
}

function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  noteCounter++;
  return {
    id: `note-${noteCounter}`,
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 0.8,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'drums',
    displayName: 'Track 1',
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    effects: [],
    ...overrides,
  } as Track;
}

function makeProject(tracks: Track[]): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    bpm: 120,
    tracks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Project;
}

function setProject(tracks: Track[]) {
  useProjectStore.setState({ project: makeProject(tracks) });
}

function resetStores() {
  useProjectStore.setState({ project: null });
  useUIStore.setState({
    selectedClipIds: new Set(),
    selectedTrackIds: new Set(),
    expandedTrackId: null,
    openPianoRollClipId: null,
    openPianoRollTrackId: null,
    selectedPianoRollNoteIds: [],
    keyboardContext: { scope: 'global', trackId: null, clipId: null },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clipCounter = 0;
  noteCounter = 0;
  resetStores();
});

// ═══════════════════════════════════════════════════════════════════════════════
// navigateTimelineByArrow
// ═══════════════════════════════════════════════════════════════════════════════

describe('navigateTimelineByArrow', () => {
  it('returns false when there is no project', () => {
    expect(navigateTimelineByArrow('right')).toBe(false);
  });

  it('returns false when there are no tracks', () => {
    setProject([]);
    expect(navigateTimelineByArrow('right')).toBe(false);
  });

  // ─── Horizontal Navigation ──────────────────────────────────────────

  describe('horizontal (left/right)', () => {
    it('selects the first clip when pressing right with nothing selected', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip2, clip1] })]);

      const result = navigateTimelineByArrow('right');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.size).toBe(1);
      expect(selected.has(clip1.id)).toBe(true);
    });

    it('selects the last clip when pressing left with nothing selected', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip1, clip2] })]);

      const result = navigateTimelineByArrow('left');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.size).toBe(1);
      expect(selected.has(clip2.id)).toBe(true);
    });

    it('moves right to the next clip on the same track', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip1, clip2] })]);
      useUIStore.getState().selectClip(clip1.id, false);

      const result = navigateTimelineByArrow('right');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.size).toBe(1);
      expect(selected.has(clip2.id)).toBe(true);
    });

    it('moves left to the previous clip on the same track', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip1, clip2] })]);
      useUIStore.getState().selectClip(clip2.id, false);

      const result = navigateTimelineByArrow('left');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.has(clip1.id)).toBe(true);
    });

    it('stays on the last clip when pressing right at the end', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip1, clip2] })]);
      useUIStore.getState().selectClip(clip2.id, false);

      const result = navigateTimelineByArrow('right');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.has(clip2.id)).toBe(true);
    });

    it('stays on the first clip when pressing left at the beginning', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clip1, clip2] })]);
      useUIStore.getState().selectClip(clip1.id, false);

      const result = navigateTimelineByArrow('left');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.has(clip1.id)).toBe(true);
    });

    it('returns false on right when track has no clips', () => {
      setProject([makeTrack({ id: 'track-1', clips: [] })]);
      expect(navigateTimelineByArrow('right')).toBe(false);
    });

    it('sorts clips by startTime then duration then id for horizontal nav', () => {
      const clipA = makeClip({ id: 'clip-a', trackId: 'track-1', startTime: 2, duration: 1 });
      const clipB = makeClip({ id: 'clip-b', trackId: 'track-1', startTime: 2, duration: 2 });
      const clipC = makeClip({ id: 'clip-c', trackId: 'track-1', startTime: 0, duration: 4 });
      setProject([makeTrack({ id: 'track-1', clips: [clipA, clipB, clipC] })]);

      // Right with nothing selected should pick earliest clip (clipC at startTime 0)
      navigateTimelineByArrow('right');
      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.has('clip-c')).toBe(true);

      // Navigate right again: should be clipA (startTime 2, duration 1)
      navigateTimelineByArrow('right');
      const selected2 = useUIStore.getState().selectedClipIds;
      expect(selected2.has('clip-a')).toBe(true);

      // Navigate right again: should be clipB (startTime 2, duration 2)
      navigateTimelineByArrow('right');
      const selected3 = useUIStore.getState().selectedClipIds;
      expect(selected3.has('clip-b')).toBe(true);
    });
  });

  // ─── Vertical Navigation ────────────────────────────────────────────

  describe('vertical (up/down)', () => {
    it('moves down to the nearest clip on the next track', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 2 });
      const clip2 = makeClip({ trackId: 'track-2', startTime: 1 });
      const clip3 = makeClip({ trackId: 'track-2', startTime: 10 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1] }),
        makeTrack({ id: 'track-2', order: 1, clips: [clip2, clip3] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      navigateTimelineByArrow('down');

      const selected = useUIStore.getState().selectedClipIds;
      // clip2 at startTime 1 is closer to 2 than clip3 at startTime 10
      expect(selected.has(clip2.id)).toBe(true);
      expect(selected.size).toBe(1);
    });

    it('moves up to the nearest clip on the previous track', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 5 });
      const clip2 = makeClip({ trackId: 'track-1', startTime: 0 });
      const clip3 = makeClip({ trackId: 'track-2', startTime: 4 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1, clip2] }),
        makeTrack({ id: 'track-2', order: 1, clips: [clip3] }),
      ]);
      useUIStore.getState().selectClip(clip3.id, false);

      navigateTimelineByArrow('up');

      const selected = useUIStore.getState().selectedClipIds;
      // clip1 at startTime 5 is closer to 4 than clip2 at startTime 0
      expect(selected.has(clip1.id)).toBe(true);
    });

    it('returns false when pressing up on the first track with no clips above', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      expect(navigateTimelineByArrow('up')).toBe(false);
    });

    it('returns false when pressing down on the last track with no clips below', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      expect(navigateTimelineByArrow('down')).toBe(false);
    });

    it('moves to adjacent track and deselects when target track has no clips', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1] }),
        makeTrack({ id: 'track-2', order: 1, clips: [] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      const result = navigateTimelineByArrow('down');
      expect(result).toBe(true);

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.size).toBe(0);
      expect(useUIStore.getState().expandedTrackId).toBe('track-2');
    });

    it('uses track order for vertical navigation, not array position', () => {
      const clip1 = makeClip({ trackId: 'track-a', startTime: 0 });
      const clip2 = makeClip({ trackId: 'track-b', startTime: 0 });
      const clip3 = makeClip({ trackId: 'track-c', startTime: 0 });
      setProject([
        makeTrack({ id: 'track-c', order: 2, clips: [clip3] }),
        makeTrack({ id: 'track-a', order: 0, clips: [clip1] }),
        makeTrack({ id: 'track-b', order: 1, clips: [clip2] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      navigateTimelineByArrow('down');

      const selected = useUIStore.getState().selectedClipIds;
      expect(selected.has(clip2.id)).toBe(true);
    });

    it('selects first clip on target track when navigating down with no current clip', () => {
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [] }),
        makeTrack({
          id: 'track-2',
          order: 1,
          clips: [
            makeClip({ trackId: 'track-2', startTime: 5 }),
            makeClip({ trackId: 'track-2', startTime: 1 }),
          ],
        }),
      ]);
      // Focus on first track with no selection
      useUIStore.setState({
        keyboardContext: { scope: 'timeline', trackId: 'track-1', clipId: null },
      });

      navigateTimelineByArrow('down');

      // Should pick the earliest clip (startTime 1)
      const selectedIds = [...useUIStore.getState().selectedClipIds];
      expect(selectedIds.length).toBe(1);
      // the clip at startTime 1 was the second created in this test block
      const project = useProjectStore.getState().project!;
      const track2Clips = project.tracks.find((t) => t.id === 'track-2')!.clips;
      const earliestClip = track2Clips.reduce((a, b) => (a.startTime < b.startTime ? a : b));
      expect(useUIStore.getState().selectedClipIds.has(earliestClip.id)).toBe(true);
    });

    it('picks the clip with lower startTime when two are equidistant vertically', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 5 });
      const clipLeft = makeClip({ trackId: 'track-2', startTime: 3 });
      const clipRight = makeClip({ trackId: 'track-2', startTime: 7 });
      setProject([
        makeTrack({ id: 'track-1', order: 0, clips: [clip1] }),
        makeTrack({ id: 'track-2', order: 1, clips: [clipLeft, clipRight] }),
      ]);
      useUIStore.getState().selectClip(clip1.id, false);

      navigateTimelineByArrow('down');

      const selected = useUIStore.getState().selectedClipIds;
      // Both are distance 2 from startTime 5; the one with lower startTime wins
      expect(selected.has(clipLeft.id)).toBe(true);
    });
  });

  // ─── Focus / side-effects ───────────────────────────────────────────

  describe('focus side-effects', () => {
    it('sets expandedTrackId to the selected clip track', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      setProject([makeTrack({ id: 'track-1', order: 0, clips: [clip1] })]);

      navigateTimelineByArrow('right');

      expect(useUIStore.getState().expandedTrackId).toBe('track-1');
    });

    it('sets keyboard context to timeline scope', () => {
      const clip1 = makeClip({ trackId: 'track-1', startTime: 0 });
      setProject([makeTrack({ id: 'track-1', order: 0, clips: [clip1] })]);

      navigateTimelineByArrow('right');

      expect(useUIStore.getState().keyboardContext.scope).toBe('timeline');
      expect(useUIStore.getState().keyboardContext.trackId).toBe('track-1');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// navigateMixerByArrow
// ═══════════════════════════════════════════════════════════════════════════════

describe('navigateMixerByArrow', () => {
  it('returns false when there are no tracks', () => {
    setProject([]);
    expect(navigateMixerByArrow('right')).toBe(false);
  });

  it('returns false when there is no project', () => {
    expect(navigateMixerByArrow('right')).toBe(false);
  });

  it('moves right from first track to second', () => {
    setProject([
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ]);
    useUIStore.setState({
      keyboardContext: { scope: 'mixer', trackId: 'track-1', clipId: null },
    });

    const result = navigateMixerByArrow('right');
    expect(result).toBe(true);
    expect(useUIStore.getState().expandedTrackId).toBe('track-2');
    expect(useUIStore.getState().keyboardContext.scope).toBe('mixer');
  });

  it('moves left from second track to first', () => {
    setProject([
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ]);
    useUIStore.setState({
      keyboardContext: { scope: 'mixer', trackId: 'track-2', clipId: null },
    });

    const result = navigateMixerByArrow('left');
    expect(result).toBe(true);
    expect(useUIStore.getState().expandedTrackId).toBe('track-1');
  });

  it('returns false when pressing right on the last track', () => {
    setProject([
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ]);
    useUIStore.setState({
      keyboardContext: { scope: 'mixer', trackId: 'track-2', clipId: null },
    });

    expect(navigateMixerByArrow('right')).toBe(false);
  });

  it('returns false when pressing left on the first track', () => {
    setProject([
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ]);
    useUIStore.setState({
      keyboardContext: { scope: 'mixer', trackId: 'track-1', clipId: null },
    });

    expect(navigateMixerByArrow('left')).toBe(false);
  });

  it('respects track order for navigation', () => {
    setProject([
      makeTrack({ id: 'track-b', order: 1 }),
      makeTrack({ id: 'track-a', order: 0 }),
      makeTrack({ id: 'track-c', order: 2 }),
    ]);
    useUIStore.setState({
      keyboardContext: { scope: 'mixer', trackId: 'track-a', clipId: null },
    });

    navigateMixerByArrow('right');
    expect(useUIStore.getState().expandedTrackId).toBe('track-b');
  });

  it('defaults to the first track when no focus exists', () => {
    setProject([
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ]);

    const result = navigateMixerByArrow('right');
    expect(result).toBe(true);
    expect(useUIStore.getState().expandedTrackId).toBe('track-2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// navigatePianoRollByArrow
// ═══════════════════════════════════════════════════════════════════════════════

describe('navigatePianoRollByArrow', () => {
  function setupPianoRoll(notes: MidiNote[], trackId = 'track-1', clipId = 'clip-pr') {
    const clip = makeClip({
      id: clipId,
      trackId,
      midiData: { notes, grid: '1/16' },
    });
    setProject([makeTrack({ id: trackId, clips: [clip] })]);
    useUIStore.setState({
      openPianoRollClipId: clipId,
      openPianoRollTrackId: trackId,
    });
  }

  it('returns false when piano roll is not open', () => {
    setProject([makeTrack({ id: 'track-1' })]);
    expect(navigatePianoRollByArrow('right')).toBe(false);
  });

  it('returns false when the clip has no notes', () => {
    setupPianoRoll([]);
    expect(navigatePianoRollByArrow('right')).toBe(false);
  });

  // ─── Initial selection (no note selected) ──────────────────────────

  describe('initial selection', () => {
    it('selects the first note (earliest) when pressing right with no selection', () => {
      const noteA = makeNote({ startBeat: 4, pitch: 60 });
      const noteB = makeNote({ startBeat: 0, pitch: 62 });
      setupPianoRoll([noteA, noteB]);

      const result = navigatePianoRollByArrow('right');
      expect(result).toBe(true);

      const selectedIds = useUIStore.getState().selectedPianoRollNoteIds;
      expect(selectedIds.length).toBe(1);
      // noteB has lower startBeat, so it comes first in sorted order
      expect(selectedIds[0]).toBe(noteB.id);
    });

    it('selects the last note when pressing left with no selection', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 4, pitch: 62 });
      setupPianoRoll([noteA, noteB]);

      navigatePianoRollByArrow('left');

      const selectedIds = useUIStore.getState().selectedPianoRollNoteIds;
      expect(selectedIds[0]).toBe(noteB.id);
    });

    it('selects the first note when pressing down with no selection', () => {
      const noteA = makeNote({ startBeat: 4, pitch: 60 });
      const noteB = makeNote({ startBeat: 0, pitch: 62 });
      setupPianoRoll([noteA, noteB]);

      navigatePianoRollByArrow('down');

      const selectedIds = useUIStore.getState().selectedPianoRollNoteIds;
      expect(selectedIds[0]).toBe(noteB.id);
    });

    it('selects the last note when pressing up with no selection', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 4, pitch: 62 });
      setupPianoRoll([noteA, noteB]);

      navigatePianoRollByArrow('up');

      const selectedIds = useUIStore.getState().selectedPianoRollNoteIds;
      expect(selectedIds[0]).toBe(noteB.id);
    });
  });

  // ─── Horizontal navigation ─────────────────────────────────────────

  describe('horizontal', () => {
    it('moves right to the next note by startBeat', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 60 });
      const noteC = makeNote({ startBeat: 4, pitch: 60 });
      setupPianoRoll([noteA, noteB, noteC]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('right');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteB.id]);
    });

    it('moves left to the previous note by startBeat', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 60 });
      setupPianoRoll([noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteB.id] });

      navigatePianoRollByArrow('left');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteA.id]);
    });

    it('stays on the last note when pressing right at the end', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 60 });
      setupPianoRoll([noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteB.id] });

      navigatePianoRollByArrow('right');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteB.id]);
    });

    it('stays on the first note when pressing left at the beginning', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 60 });
      setupPianoRoll([noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('left');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteA.id]);
    });
  });

  // ─── Vertical navigation ───────────────────────────────────────────

  describe('vertical', () => {
    it('moves up to the nearest higher-pitch note', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 0, pitch: 64 });
      const noteC = makeNote({ startBeat: 0, pitch: 72 });
      setupPianoRoll([noteA, noteB, noteC]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('up');

      // noteB (pitch 64) is closer to 60 than noteC (pitch 72)
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteB.id]);
    });

    it('moves down to the nearest lower-pitch note', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 72 });
      const noteB = makeNote({ startBeat: 0, pitch: 64 });
      const noteC = makeNote({ startBeat: 0, pitch: 48 });
      setupPianoRoll([noteA, noteB, noteC]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('down');

      // noteB (pitch 64) is closer to 72 than noteC (pitch 48)
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteB.id]);
    });

    it('stays on the current note when no higher pitch exists (up)', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 55 });
      setupPianoRoll([noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('up');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteA.id]);
    });

    it('stays on the current note when no lower pitch exists (down)', () => {
      const noteA = makeNote({ startBeat: 0, pitch: 60 });
      const noteB = makeNote({ startBeat: 2, pitch: 72 });
      setupPianoRoll([noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [noteA.id] });

      navigatePianoRollByArrow('down');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteA.id]);
    });

    it('breaks ties by preferring note closer in startBeat', () => {
      const current = makeNote({ startBeat: 4, pitch: 60 });
      const noteClose = makeNote({ startBeat: 3, pitch: 65 });
      const noteFar = makeNote({ startBeat: 10, pitch: 65 });
      setupPianoRoll([current, noteClose, noteFar]);
      useUIStore.setState({ selectedPianoRollNoteIds: [current.id] });

      navigatePianoRollByArrow('up');

      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteClose.id]);
    });

    it('breaks pitch+startBeat ties by preferring earlier startBeat', () => {
      const current = makeNote({ startBeat: 5, pitch: 60 });
      const noteA = makeNote({ startBeat: 3, pitch: 65 });
      const noteB = makeNote({ startBeat: 7, pitch: 65 });
      // Both are distance 5 in pitch, distance 2 in startBeat
      setupPianoRoll([current, noteA, noteB]);
      useUIStore.setState({ selectedPianoRollNoteIds: [current.id] });

      navigatePianoRollByArrow('up');

      // Equal pitch distance, equal start distance — pick lower startBeat
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual([noteA.id]);
    });
  });

  // ─── Sort order ─────────────────────────────────────────────────────

  describe('note sort order', () => {
    it('sorts by startBeat then pitch then id', () => {
      const noteA = makeNote({ id: 'n-b', startBeat: 0, pitch: 62 });
      const noteB = makeNote({ id: 'n-a', startBeat: 0, pitch: 60 });
      const noteC = makeNote({ id: 'n-c', startBeat: 1, pitch: 60 });
      setupPianoRoll([noteA, noteB, noteC]);

      // Right with no selection picks first in sorted order
      navigatePianoRollByArrow('right');
      // Sort: startBeat 0/pitch 60 (n-a), startBeat 0/pitch 62 (n-b), startBeat 1/pitch 60 (n-c)
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['n-a']);

      navigatePianoRollByArrow('right');
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['n-b']);

      navigatePianoRollByArrow('right');
      expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['n-c']);
    });
  });

  // ─── Keyboard context ──────────────────────────────────────────────

  describe('keyboard context', () => {
    it('sets keyboard context to pianoRoll scope', () => {
      const note = makeNote({ startBeat: 0, pitch: 60 });
      setupPianoRoll([note]);

      navigatePianoRollByArrow('right');

      const ctx = useUIStore.getState().keyboardContext;
      expect(ctx.scope).toBe('pianoRoll');
      expect(ctx.trackId).toBe('track-1');
    });
  });
});

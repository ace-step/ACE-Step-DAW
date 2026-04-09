import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  navigateTimelineByArrow,
  navigateMixerByArrow,
  navigatePianoRollByArrow,
} from '../arrowKeyNavigation';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { Clip, MidiNote, Track } from '../../types/project';

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: vi.fn() },
}));

vi.mock('../../store/uiStore', () => ({
  useUIStore: { getState: vi.fn() },
}));

import { resolveFocusedTrackId } from '../focusResolution';

vi.mock('../focusResolution', () => ({
  resolveFocusedTrackId: vi.fn(() => 'track-1'),
}));

// ── Helpers ────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    prompt: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: [],
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    displayName: 'Track 1',
    type: 'audio',
    order: 0,
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    clips: [],
    color: '#4a9eff',
    instrumentType: 'none',
    ...overrides,
  } as Track;
}

function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 100,
    ...overrides,
  };
}

function mockStores(
  project: { tracks: Track[] } | null,
  uiOverrides: Record<string, unknown> = {},
) {
  const selectClip = vi.fn();
  const setExpandedTrackId = vi.fn();
  const setKeyboardContext = vi.fn();
  const deselectAll = vi.fn();
  const setSelectedPianoRollNoteIds = vi.fn();

  const uiState = {
    selectedClipIds: new Set<string>(),
    selectedPianoRollNoteIds: [] as string[],
    openPianoRollClipId: null as string | null,
    openPianoRollTrackId: null as string | null,
    selectClip,
    setExpandedTrackId,
    setKeyboardContext,
    deselectAll,
    setSelectedPianoRollNoteIds,
    ...uiOverrides,
  };

  vi.mocked(useProjectStore.getState).mockReturnValue({ project } as ReturnType<typeof useProjectStore.getState>);
  vi.mocked(useUIStore.getState).mockReturnValue(uiState as ReturnType<typeof useUIStore.getState>);

  return { selectClip, setExpandedTrackId, setKeyboardContext, deselectAll, setSelectedPianoRollNoteIds };
}

// ── navigateTimelineByArrow ────────────────────────────────────────

describe('navigateTimelineByArrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no project', () => {
    mockStores(null);
    expect(navigateTimelineByArrow('right')).toBe(false);
  });

  it('returns false when project has no tracks', () => {
    mockStores({ tracks: [] });
    expect(navigateTimelineByArrow('right')).toBe(false);
  });

  it('navigates right to next clip on same track', () => {
    const clips = [
      makeClip({ id: 'c1', startTime: 0 }),
      makeClip({ id: 'c2', startTime: 4 }),
    ];
    const track = makeTrack({ clips });
    const { selectClip } = mockStores({ tracks: [track] }, { selectedClipIds: new Set(['c1']) });

    expect(navigateTimelineByArrow('right')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c2', false);
  });

  it('navigates left to previous clip on same track', () => {
    const clips = [
      makeClip({ id: 'c1', startTime: 0 }),
      makeClip({ id: 'c2', startTime: 4 }),
    ];
    const track = makeTrack({ clips });
    const { selectClip } = mockStores({ tracks: [track] }, { selectedClipIds: new Set(['c2']) });

    expect(navigateTimelineByArrow('left')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c1', false);
  });

  it('stays on current clip when at boundary (right)', () => {
    const clips = [makeClip({ id: 'c1', startTime: 0 })];
    const track = makeTrack({ clips });
    const { selectClip } = mockStores({ tracks: [track] }, { selectedClipIds: new Set(['c1']) });

    expect(navigateTimelineByArrow('right')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c1', false);
  });

  it('selects first clip when nothing is selected and pressing right', () => {
    const clips = [
      makeClip({ id: 'c1', startTime: 0 }),
      makeClip({ id: 'c2', startTime: 4 }),
    ];
    const track = makeTrack({ clips });
    const { selectClip } = mockStores({ tracks: [track] });

    expect(navigateTimelineByArrow('right')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c1', false);
  });

  it('selects last clip when nothing is selected and pressing left', () => {
    const clips = [
      makeClip({ id: 'c1', startTime: 0 }),
      makeClip({ id: 'c2', startTime: 4 }),
    ];
    const track = makeTrack({ clips });
    const { selectClip } = mockStores({ tracks: [track] });

    expect(navigateTimelineByArrow('left')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c2', false);
  });

  it('returns false for empty track on horizontal navigation', () => {
    const track = makeTrack({ clips: [] });
    mockStores({ tracks: [track] });

    expect(navigateTimelineByArrow('right')).toBe(false);
  });

  it('navigates down to closest clip on next track', () => {
    const track1 = makeTrack({ id: 'track-1', order: 0, clips: [makeClip({ id: 'c1', trackId: 'track-1', startTime: 2 })] });
    const track2 = makeTrack({
      id: 'track-2',
      order: 1,
      clips: [
        makeClip({ id: 'c2a', trackId: 'track-2', startTime: 0 }),
        makeClip({ id: 'c2b', trackId: 'track-2', startTime: 3 }),
      ],
    });
    const { selectClip } = mockStores(
      { tracks: [track1, track2] },
      { selectedClipIds: new Set(['c1']) },
    );

    expect(navigateTimelineByArrow('down')).toBe(true);
    expect(selectClip).toHaveBeenCalledWith('c2b', false);
  });

  it('moves focus to next track when no clips in that direction', () => {
    const track1 = makeTrack({ id: 'track-1', order: 0, clips: [makeClip({ id: 'c1', trackId: 'track-1' })] });
    const track2 = makeTrack({ id: 'track-2', order: 1, clips: [] });
    const { deselectAll, setExpandedTrackId } = mockStores(
      { tracks: [track1, track2] },
      { selectedClipIds: new Set(['c1']) },
    );

    expect(navigateTimelineByArrow('down')).toBe(true);
    expect(deselectAll).toHaveBeenCalled();
    expect(setExpandedTrackId).toHaveBeenCalledWith('track-2');
  });

  it('returns false when already at bottom track boundary', () => {
    const track = makeTrack({ id: 'track-1', order: 0, clips: [makeClip({ id: 'c1', trackId: 'track-1' })] });
    mockStores({ tracks: [track] }, { selectedClipIds: new Set(['c1']) });

    expect(navigateTimelineByArrow('down')).toBe(false);
  });
});

// ── navigateMixerByArrow ───────────────────────────────────────────

describe('navigateMixerByArrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no project', () => {
    mockStores(null);
    expect(navigateMixerByArrow('right')).toBe(false);
  });

  it('returns false when no tracks', () => {
    mockStores({ tracks: [] });
    expect(navigateMixerByArrow('right')).toBe(false);
  });

  it('navigates right to next track', () => {
    const tracks = [
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ];
    const { setExpandedTrackId, setKeyboardContext } = mockStores({ tracks });

    expect(navigateMixerByArrow('right')).toBe(true);
    expect(setExpandedTrackId).toHaveBeenCalledWith('track-2');
    expect(setKeyboardContext).toHaveBeenCalledWith('mixer', 'track-2');
  });

  it('returns false when at rightmost track', () => {
    vi.mocked(resolveFocusedTrackId).mockReturnValue('track-2');

    const tracks = [
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ];
    mockStores({ tracks });

    expect(navigateMixerByArrow('right')).toBe(false);

    // Restore default
    vi.mocked(resolveFocusedTrackId).mockReturnValue('track-1');
  });

  it('returns false when navigating left from first track', () => {
    const tracks = [
      makeTrack({ id: 'track-1', order: 0 }),
      makeTrack({ id: 'track-2', order: 1 }),
    ];
    mockStores({ tracks });

    expect(navigateMixerByArrow('left')).toBe(false);
  });
});

// ── navigatePianoRollByArrow ────────────────────────────────────

describe('navigatePianoRollByArrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no project', () => {
    mockStores(null, {
      openPianoRollClipId: 'clip-1',
      openPianoRollTrackId: 'track-1',
    });
    expect(navigatePianoRollByArrow('right')).toBe(false);
  });

  it('returns false when no piano roll is open', () => {
    const track = makeTrack();
    mockStores({ tracks: [track] });
    expect(navigatePianoRollByArrow('right')).toBe(false);
  });

  it('returns false when clip has no notes', () => {
    const clip = makeClip({ id: 'pr-clip', midiData: { notes: [], grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
    });
    expect(navigatePianoRollByArrow('right')).toBe(false);
  });

  it('selects first note when nothing selected and pressing right', () => {
    const notes = [
      makeNote({ id: 'n1', startBeat: 0 }),
      makeNote({ id: 'n2', startBeat: 2 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: [],
    });

    expect(navigatePianoRollByArrow('right')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n1']);
  });

  it('selects last note when nothing selected and pressing left', () => {
    const notes = [
      makeNote({ id: 'n1', startBeat: 0 }),
      makeNote({ id: 'n2', startBeat: 2 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: [],
    });

    expect(navigatePianoRollByArrow('left')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n2']);
  });

  it('navigates right to next note', () => {
    const notes = [
      makeNote({ id: 'n1', startBeat: 0 }),
      makeNote({ id: 'n2', startBeat: 2 }),
      makeNote({ id: 'n3', startBeat: 4 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: ['n1'],
    });

    expect(navigatePianoRollByArrow('right')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n2']);
  });

  it('navigates up to closest higher-pitched note', () => {
    const notes = [
      makeNote({ id: 'n1', pitch: 60, startBeat: 0 }),
      makeNote({ id: 'n2', pitch: 64, startBeat: 0 }),
      makeNote({ id: 'n3', pitch: 72, startBeat: 0 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: ['n1'],
    });

    expect(navigatePianoRollByArrow('up')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n2']);
  });

  it('navigates down to closest lower-pitched note', () => {
    const notes = [
      makeNote({ id: 'n1', pitch: 48, startBeat: 0 }),
      makeNote({ id: 'n2', pitch: 55, startBeat: 0 }),
      makeNote({ id: 'n3', pitch: 60, startBeat: 0 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: ['n3'],
    });

    expect(navigatePianoRollByArrow('down')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n2']);
  });

  it('stays on same note when at pitch boundary (up)', () => {
    const notes = [
      makeNote({ id: 'n1', pitch: 60, startBeat: 0 }),
    ];
    const clip = makeClip({ id: 'pr-clip', midiData: { notes, grid: '1/16' } });
    const track = makeTrack({ clips: [clip] });
    const { setSelectedPianoRollNoteIds } = mockStores({ tracks: [track] }, {
      openPianoRollClipId: 'pr-clip',
      openPianoRollTrackId: 'track-1',
      selectedPianoRollNoteIds: ['n1'],
    });

    expect(navigatePianoRollByArrow('up')).toBe(true);
    expect(setSelectedPianoRollNoteIds).toHaveBeenCalledWith(['n1']);
  });
});

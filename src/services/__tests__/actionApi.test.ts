import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectActionApi } from '../actionApi';
import type { Clip, MidiNote, Track, SequencerPattern, SequencerRow, TrackPreset } from '../../types/project';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ProjectState } from '../../store/projectStore';

// ── Helpers ────────────────────────────────────────────────────────

type ProjectStore = UseBoundStore<StoreApi<ProjectState>>;

function makeMidiNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 100,
    ...overrides,
  };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    prompt: 'test',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: [],
    ...overrides,
  };
}

function makeSequencerRow(overrides: Partial<SequencerRow> = {}): SequencerRow {
  return {
    id: 'row-1',
    sampleKey: 'kick',
    label: 'Kick',
    muted: false,
    steps: [
      { active: false, velocity: 1 },
      { active: true, velocity: 1 },
      { active: false, velocity: 1 },
      { active: false, velocity: 1 },
    ],
    ...overrides,
  } as SequencerRow;
}

function makeSequencerPattern(overrides: Partial<SequencerPattern> = {}): SequencerPattern {
  return {
    rows: [makeSequencerRow()],
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    ...overrides,
  } as SequencerPattern;
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    displayName: 'Track 1',
    trackName: 'Track 1',
    order: 0,
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    armed: false,
    clips: [],
    color: '#4a9eff',
    ...overrides,
  } as Track;
}

function makeTrackPreset(overrides: Partial<TrackPreset> = {}): TrackPreset {
  return {
    id: 'preset-1',
    name: 'My Preset',
    instrumentType: 'none',
    ...overrides,
  } as TrackPreset;
}

interface MockProject {
  name: string;
  bpm: number;
  timeSignature: number;
  timeSignatureMap?: Array<{ numerator: number; denominator: number }>;
  tracks: Track[];
  trackPresets?: TrackPreset[];
}

function makeProject(overrides: Partial<MockProject> = {}): MockProject {
  return {
    name: 'Test Project',
    bpm: 120,
    timeSignature: 4,
    tracks: [makeTrack()],
    trackPresets: [],
    ...overrides,
  };
}

function createMockStore(project: MockProject | null = null): ProjectStore {
  let _project = project;
  const state: Record<string, unknown> = {
    project: _project,
    addClip: vi.fn((trackId: string, clip: Partial<Clip>) => {
      return { ...makeClip({ trackId }), ...clip, id: 'new-clip-1' };
    }),
    toggleSequencerStep: vi.fn(),
    addMidiNote: vi.fn(() => 'new-note-1'),
    resizeMidiNote: vi.fn(),
    saveTrackPreset: vi.fn(() => makeTrackPreset()),
    applyTrackPreset: vi.fn(() => makeTrack()),
    isViewerMode: vi.fn(() => false),
    consolidateClips: vi.fn(async () => makeClip({ id: 'consolidated-1' })),
    separateStems: vi.fn(async () => [makeTrack({ id: 'stem-1' }), makeTrack({ id: 'stem-2' })]),
    bounceInPlace: vi.fn(async () => makeClip({ id: 'bounced-1' })),
  };

  const store = (() => state) as unknown as ProjectStore;
  store.getState = () => state as unknown as ProjectState;
  store.setState = vi.fn();
  store.subscribe = vi.fn();
  store.destroy = vi.fn();
  return store;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('createProjectActionApi', () => {
  let store: ProjectStore;
  let api: ReturnType<typeof createProjectActionApi>;

  beforeEach(() => {
    store = createMockStore(makeProject());
    api = createProjectActionApi(store);
  });

  // ── addClip ─────────────────────────────────────────────────────

  describe('addClip', () => {
    it('returns PROJECT_REQUIRED when no project exists', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);

      const result = api.addClip({ trackId: 'track-1', clip: { startTime: 0, duration: 4, prompt: 'test', lyrics: '' } as Clip });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PROJECT_REQUIRED');
      }
    });

    it('returns TRACK_NOT_FOUND for nonexistent track', () => {
      const result = api.addClip({ trackId: 'nonexistent', clip: { startTime: 0, duration: 4, prompt: 'test', lyrics: '' } as Clip });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TRACK_NOT_FOUND');
        expect(result.error.context).toEqual(expect.objectContaining({ trackId: 'nonexistent' }));
      }
    });

    it('returns ok with clip on success', () => {
      const result = api.addClip({ trackId: 'track-1', clip: { startTime: 0, duration: 4, prompt: 'test', lyrics: '' } as Clip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(expect.objectContaining({ trackId: 'track-1' }));
      }
    });

    it('returns ACTION_FAILED when addClip throws', () => {
      (store.getState() as Record<string, unknown>).addClip = vi.fn(() => { throw new Error('boom'); });
      const result = api.addClip({ trackId: 'track-1', clip: { startTime: 0, duration: 4, prompt: 'test', lyrics: '' } as Clip });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_FAILED');
        expect(result.error.message).toBe('boom');
      }
    });
  });

  // ── toggleSequencerStep ────────────────────────────────────────

  describe('toggleSequencerStep', () => {
    beforeEach(() => {
      const track = makeTrack({
        sequencerPattern: makeSequencerPattern(),
      });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
    });

    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'row-1', stepIndex: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_NOT_FOUND for unknown track', () => {
      const result = api.toggleSequencerStep({ trackId: 'ghost', rowId: 'row-1', stepIndex: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_NOT_FOUND');
    });

    it('returns SEQUENCER_PATTERN_REQUIRED when track has no pattern', () => {
      store = createMockStore(makeProject({ tracks: [makeTrack()] }));
      api = createProjectActionApi(store);
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'row-1', stepIndex: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('SEQUENCER_PATTERN_REQUIRED');
    });

    it('returns SEQUENCER_ROW_NOT_FOUND for unknown row', () => {
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'ghost-row', stepIndex: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('SEQUENCER_ROW_NOT_FOUND');
    });

    it('returns STEP_INDEX_OUT_OF_RANGE for negative index', () => {
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'row-1', stepIndex: -1 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('STEP_INDEX_OUT_OF_RANGE');
    });

    it('returns STEP_INDEX_OUT_OF_RANGE for index beyond row length', () => {
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'row-1', stepIndex: 100 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('STEP_INDEX_OUT_OF_RANGE');
    });

    it('returns ok with toggle result on success', () => {
      const result = api.toggleSequencerStep({ trackId: 'track-1', rowId: 'row-1', stepIndex: 1 });
      expect(result.ok).toBe(true);
    });
  });

  // ── addMidiNote ────────────────────────────────────────────────

  describe('addMidiNote', () => {
    beforeEach(() => {
      const clip = makeClip({ midiData: { notes: [], grid: '1/16' } });
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
    });

    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.addMidiNote({ clipId: 'clip-1', note: makeMidiNote() });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns CLIP_NOT_FOUND for unknown clip', () => {
      const result = api.addMidiNote({ clipId: 'ghost', note: makeMidiNote() });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CLIP_NOT_FOUND');
    });

    it('returns MIDI_CLIP_REQUIRED for non-midi clip', () => {
      const clip = makeClip(); // no midiData
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);

      const result = api.addMidiNote({ clipId: 'clip-1', note: makeMidiNote() });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('MIDI_CLIP_REQUIRED');
    });

    it('returns ok with noteId on success', () => {
      const result = api.addMidiNote({ clipId: 'clip-1', note: makeMidiNote() });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ clipId: 'clip-1', noteId: 'new-note-1' });
      }
    });

    it('returns ACTION_FAILED when addMidiNote returns null', () => {
      (store.getState() as Record<string, unknown>).addMidiNote = vi.fn(() => null);
      const result = api.addMidiNote({ clipId: 'clip-1', note: makeMidiNote() });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('ACTION_FAILED');
    });
  });

  // ── resizeMidiNote ─────────────────────────────────────────────

  describe('resizeMidiNote', () => {
    const existingNote = makeMidiNote({ id: 'note-1', startBeat: 0, durationBeats: 2 });

    beforeEach(() => {
      const clip = makeClip({
        midiData: { notes: [existingNote], grid: '1/16' },
      });
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
    });

    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.resizeMidiNote({ clipId: 'clip-1', noteId: 'note-1', edge: 'right' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns CLIP_NOT_FOUND for unknown clip', () => {
      const result = api.resizeMidiNote({ clipId: 'ghost', noteId: 'note-1', edge: 'right' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CLIP_NOT_FOUND');
    });

    it('returns MIDI_CLIP_REQUIRED for non-midi clip', () => {
      const track = makeTrack({ clips: [makeClip()] }); // no midiData
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);

      const result = api.resizeMidiNote({ clipId: 'clip-1', noteId: 'note-1', edge: 'right' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('MIDI_CLIP_REQUIRED');
    });

    it('returns MIDI_NOTES_REQUIRED for unknown note', () => {
      const result = api.resizeMidiNote({ clipId: 'clip-1', noteId: 'ghost-note', edge: 'right' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('MIDI_NOTES_REQUIRED');
    });

    it('returns ok with resized note data on success', () => {
      // The store.getState() after resizeMidiNote must still contain the note
      const resizedNote = makeMidiNote({ id: 'note-1', startBeat: 0, durationBeats: 4 });
      const clipAfter = makeClip({ midiData: { notes: [resizedNote], grid: '1/16' } });
      const trackAfter = makeTrack({ clips: [clipAfter] });
      const projectAfter = makeProject({ tracks: [trackAfter] });

      // First call gets the original state (with note for validation), subsequent calls get resized state
      const originalGetState = store.getState;
      const originalState = originalGetState();
      let callCount = 0;
      store.getState = () => {
        callCount++;
        if (callCount <= 1) return originalState;
        return { ...originalState, project: projectAfter } as unknown as ProjectState;
      };

      const result = api.resizeMidiNote({ clipId: 'clip-1', noteId: 'note-1', edge: 'right', endBeat: 4 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clipId).toBe('clip-1');
        expect(result.value.noteId).toBe('note-1');
        expect(result.value.durationBeats).toBe(4);
      }
    });
  });

  // ── saveTrackPreset ─────────────────────────────────────────────

  describe('saveTrackPreset', () => {
    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.saveTrackPreset({ trackId: 'track-1', presetName: 'My Preset' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_NOT_FOUND for unknown track', () => {
      const result = api.saveTrackPreset({ trackId: 'ghost', presetName: 'My Preset' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_NOT_FOUND');
    });

    it('returns PRESET_NAME_REQUIRED for empty name', () => {
      const result = api.saveTrackPreset({ trackId: 'track-1', presetName: '  ' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PRESET_NAME_REQUIRED');
    });

    it('returns ok with preset on success', () => {
      const result = api.saveTrackPreset({ trackId: 'track-1', presetName: 'My Preset' });
      expect(result.ok).toBe(true);
    });

    it('returns ACTION_FAILED in viewer mode', () => {
      (store.getState() as Record<string, unknown>).isViewerMode = vi.fn(() => true);
      const result = api.saveTrackPreset({ trackId: 'track-1', presetName: 'My Preset' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_FAILED');
        expect(result.error.message).toMatch(/viewer mode/i);
      }
    });
  });

  // ── applyTrackPreset ───────────────────────────────────────────

  describe('applyTrackPreset', () => {
    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.applyTrackPreset({ presetId: 'preset-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_PRESET_NOT_FOUND for unknown preset', () => {
      store = createMockStore(makeProject({ trackPresets: [] }));
      api = createProjectActionApi(store);
      const result = api.applyTrackPreset({ presetId: 'ghost-preset' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_PRESET_NOT_FOUND');
    });

    it('returns ok with track on success', () => {
      store = createMockStore(makeProject({ trackPresets: [makeTrackPreset()] }));
      api = createProjectActionApi(store);
      const result = api.applyTrackPreset({ presetId: 'preset-1' });
      expect(result.ok).toBe(true);
    });

    it('returns ACTION_FAILED in viewer mode', () => {
      store = createMockStore(makeProject({ trackPresets: [makeTrackPreset()] }));
      (store.getState() as Record<string, unknown>).isViewerMode = vi.fn(() => true);
      api = createProjectActionApi(store);
      const result = api.applyTrackPreset({ presetId: 'preset-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_FAILED');
        expect(result.error.message).toMatch(/viewer mode/i);
      }
    });

    it('returns ACTION_FAILED when applyTrackPreset returns null', () => {
      store = createMockStore(makeProject({ trackPresets: [makeTrackPreset()] }));
      (store.getState() as Record<string, unknown>).applyTrackPreset = vi.fn(() => null);
      api = createProjectActionApi(store);
      const result = api.applyTrackPreset({ presetId: 'preset-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('ACTION_FAILED');
    });
  });

  // ── consolidateClips ────────────────────────────────────────────

  describe('consolidateClips', () => {
    beforeEach(() => {
      const clips = [
        makeClip({ id: 'clip-a', startTime: 0, duration: 2 }),
        makeClip({ id: 'clip-b', startTime: 2, duration: 2 }),
      ];
      const track = makeTrack({ clips });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
    });

    it('returns PROJECT_REQUIRED when no project', async () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = await api.consolidateClips({ trackId: 'track-1', clipIds: ['clip-a'] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_NOT_FOUND for unknown track', async () => {
      const result = await api.consolidateClips({ trackId: 'ghost', clipIds: ['clip-a'] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_NOT_FOUND');
    });

    it('returns CLIP_SELECTION_REQUIRED for empty clipIds', async () => {
      const result = await api.consolidateClips({ trackId: 'track-1', clipIds: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CLIP_SELECTION_REQUIRED');
    });

    it('returns CLIP_NOT_FOUND for missing clip id', async () => {
      const result = await api.consolidateClips({ trackId: 'track-1', clipIds: ['clip-a', 'nonexistent'] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CLIP_NOT_FOUND');
        expect(result.error.context).toEqual(expect.objectContaining({ missingClipId: 'nonexistent' }));
      }
    });

    it('returns ok with consolidated clip on success', async () => {
      const result = await api.consolidateClips({ trackId: 'track-1', clipIds: ['clip-a', 'clip-b'] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('consolidated-1');
      }
    });

    it('returns ACTION_FAILED when consolidateClips returns null', async () => {
      (store.getState() as Record<string, unknown>).consolidateClips = vi.fn(async () => null);
      const result = await api.consolidateClips({ trackId: 'track-1', clipIds: ['clip-a', 'clip-b'] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('ACTION_FAILED');
    });
  });

  // ── separateStems ──────────────────────────────────────────────

  describe('separateStems', () => {
    beforeEach(() => {
      const clip = makeClip({
        id: 'audio-clip',
        isolatedAudioKey: 'iso-key',
        cumulativeMixKey: 'cum-key',
      });
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
    });

    it('returns PROJECT_REQUIRED when no project', async () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = await api.separateStems({ clipId: 'audio-clip', stemCount: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_NOT_FOUND when clip track not found', async () => {
      const result = await api.separateStems({ clipId: 'ghost', stemCount: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_NOT_FOUND');
    });

    it('returns AUDIO_CLIP_REQUIRED when clip has no audio', async () => {
      const clip = makeClip({ id: 'no-audio', isolatedAudioKey: null, cumulativeMixKey: null });
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
      const result = await api.separateStems({ clipId: 'no-audio', stemCount: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('AUDIO_CLIP_REQUIRED');
    });

    it('returns ok with stem tracks on success', async () => {
      const result = await api.separateStems({ clipId: 'audio-clip', stemCount: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('classifies AUDIO_SOURCE_MISSING errors correctly', async () => {
      (store.getState() as Record<string, unknown>).separateStems = vi.fn(async () => {
        throw new Error('Audio for clip not found');
      });
      const result = await api.separateStems({ clipId: 'audio-clip', stemCount: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('AUDIO_SOURCE_MISSING');
    });
  });

  // ── bounceInPlace ──────────────────────────────────────────────

  describe('bounceInPlace', () => {
    it('returns PROJECT_REQUIRED when no project', async () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = await api.bounceInPlace({ trackId: 'track-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns TRACK_NOT_FOUND for unknown track', async () => {
      const result = await api.bounceInPlace({ trackId: 'ghost' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TRACK_NOT_FOUND');
    });

    it('returns ok with bounced clip on success', async () => {
      const result = await api.bounceInPlace({ trackId: 'track-1' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('bounced-1');
      }
    });

    it('returns ACTION_FAILED when bounceInPlace returns null', async () => {
      (store.getState() as Record<string, unknown>).bounceInPlace = vi.fn(async () => null);
      const result = await api.bounceInPlace({ trackId: 'track-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('ACTION_FAILED');
    });
  });

  // ── exportMidiClip ─────────────────────────────────────────────

  describe('exportMidiClip', () => {
    beforeEach(() => {
      const notes = [makeMidiNote({ id: 'n1' }), makeMidiNote({ id: 'n2', startBeat: 1 })];
      const clip = makeClip({
        id: 'midi-clip',
        prompt: 'melody',
        midiData: { notes, grid: '1/16' },
      });
      const track = makeTrack({ displayName: 'Piano', clips: [clip] });
      store = createMockStore(makeProject({ name: 'My Song', tracks: [track] }));
      api = createProjectActionApi(store);

      // Mock DOM APIs
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: vi.fn(),
      } as unknown as HTMLElement);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns PROJECT_REQUIRED when no project', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      const result = api.exportMidiClip({ clipId: 'midi-clip' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('PROJECT_REQUIRED');
    });

    it('returns CLIP_NOT_FOUND for unknown clip', () => {
      const result = api.exportMidiClip({ clipId: 'ghost' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CLIP_NOT_FOUND');
    });

    it('returns MIDI_CLIP_REQUIRED for non-midi clip', () => {
      const clip = makeClip({ id: 'audio-clip' }); // no midiData
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
      const result = api.exportMidiClip({ clipId: 'audio-clip' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('MIDI_CLIP_REQUIRED');
    });

    it('returns MIDI_NOTES_REQUIRED when clip has no notes', () => {
      const clip = makeClip({
        id: 'empty-midi',
        midiData: { notes: [], grid: '1/16' },
      });
      const track = makeTrack({ clips: [clip] });
      store = createMockStore(makeProject({ tracks: [track] }));
      api = createProjectActionApi(store);
      const result = api.exportMidiClip({ clipId: 'empty-midi' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('MIDI_NOTES_REQUIRED');
    });

    it('returns ok with export details on success', () => {
      const result = api.exportMidiClip({ clipId: 'midi-clip' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clipId).toBe('midi-clip');
        expect(result.value.noteCount).toBe(2);
        expect(result.value.fileName).toContain('.mid');
        expect(result.value.fileName).toContain('My Song');
        expect(result.value.fileName).toContain('Piano');
      }
    });
  });

  // ── getLastError / clearLastError ──────────────────────────────

  describe('error tracking', () => {
    it('getLastError returns null initially', () => {
      expect(api.getLastError()).toBeNull();
    });

    it('getLastError captures the last error', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      api.addClip({ trackId: 'any', clip: {} as Clip });
      const error = api.getLastError();
      expect(error).not.toBeNull();
      expect(error?.code).toBe('PROJECT_REQUIRED');
    });

    it('clearLastError resets to null', () => {
      store = createMockStore(null);
      api = createProjectActionApi(store);
      api.addClip({ trackId: 'any', clip: {} as Clip });
      expect(api.getLastError()).not.toBeNull();
      api.clearLastError();
      expect(api.getLastError()).toBeNull();
    });

    it('successful action clears last error', () => {
      // Use a store that starts with no project, then gets one
      const mutableState: Record<string, unknown> = {
        project: null,
        addClip: vi.fn((_trackId: string, clip: Partial<Clip>) => {
          return { ...makeClip(), ...clip, id: 'new-clip-1' };
        }),
      };
      const mutableStore = (() => mutableState) as unknown as ProjectStore;
      mutableStore.getState = () => mutableState as unknown as ProjectState;
      mutableStore.setState = vi.fn();
      mutableStore.subscribe = vi.fn();
      mutableStore.destroy = vi.fn();

      const sameApi = createProjectActionApi(mutableStore);

      // Trigger an error first (no project)
      sameApi.addClip({ trackId: 'any', clip: {} as Clip });
      expect(sameApi.getLastError()).not.toBeNull();

      // Now add a project and make a successful call on the same API instance
      mutableState.project = makeProject();
      sameApi.addClip({ trackId: 'track-1', clip: { startTime: 0, duration: 4, prompt: '', lyrics: '' } as Clip });
      expect(sameApi.getLastError()).toBeNull();
    });
  });
});

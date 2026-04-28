import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMidiSlice, appendMidiNotesToClip, type MidiSliceDeps, type MidiSliceActions } from '../slices/midiSlice';
import type { Project, MidiNote } from '../../types/project';

function makeProject(clipId: string, notes: MidiNote[] = []): Project {
  return {
    id: 'test-project',
    name: 'Test',
    bpm: 120,
    timeSignature: 4,
    timeSignatureDenominator: 4,
    masterVolume: 1,
    measures: 16,
    tracks: [{
      id: 'track-1',
      trackName: 'piano',
      trackType: 'pianoRoll',
      color: '#ff0000',
      volume: 1,
      clips: [{
        id: clipId,
        startTime: 0,
        duration: 4,
        name: 'Clip 1',
        color: '#ff0000',
        midiData: { notes, grid: '1/16' },
      }],
    }],
    updatedAt: Date.now(),
    createdAt: Date.now(),
    globalCaption: '',
    assets: [],
    returnTracks: [],
  } as unknown as Project;
}

function makeNote(overrides?: Partial<MidiNote>): MidiNote {
  return {
    id: 'note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 100,
    ...overrides,
  };
}

describe('midiSlice', () => {
  let project: Project | null;
  let setFn: (partial: { project: Project | null }) => void;
  let getFn: () => { project: Project | null };
  let deps: MidiSliceDeps;
  let slice: MidiSliceActions;

  beforeEach(() => {
    project = makeProject('clip-1', [makeNote()]);
    setFn = vi.fn((partial) => { project = partial.project; });
    getFn = () => ({ project });
    deps = {
      isViewerMode: vi.fn(() => false),
      pushHistory: vi.fn(),
    };
    slice = createMidiSlice(setFn, getFn, deps);
  });

  describe('addMidiNote', () => {
    it('adds a note to the clip and returns the note ID', () => {
      const noteId = slice.addMidiNote('clip-1', { pitch: 64, startBeat: 2, durationBeats: 0.5, velocity: 80 });
      expect(noteId).not.toBeUndefined();
      expect(project!.tracks[0].clips[0].midiData!.notes).toHaveLength(2);
      expect(project!.tracks[0].clips[0].midiData!.notes[1].pitch).toBe(64);
    });

    it('pushes history before mutation', () => {
      slice.addMidiNote('clip-1', { pitch: 64, startBeat: 2, durationBeats: 0.5, velocity: 80 });
      expect(deps.pushHistory).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scope: 'pianoRoll', clipId: 'clip-1' }),
      );
    });

    it('returns undefined in viewer mode', () => {
      (deps.isViewerMode as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const result = slice.addMidiNote('clip-1', { pitch: 64, startBeat: 0, durationBeats: 1, velocity: 100 });
      expect(result).toBeUndefined();
    });

    it('uses provided ID if given', () => {
      const noteId = slice.addMidiNote('clip-1', { id: 'custom-id', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      expect(noteId).toBe('custom-id');
    });
  });

  describe('updateMidiNote', () => {
    it('updates a note by ID', () => {
      slice.updateMidiNote('clip-1', 'note-1', { pitch: 72 });
      expect(project!.tracks[0].clips[0].midiData!.notes[0].pitch).toBe(72);
    });

    it('preserves other note properties', () => {
      slice.updateMidiNote('clip-1', 'note-1', { pitch: 72 });
      const note = project!.tracks[0].clips[0].midiData!.notes[0];
      expect(note.velocity).toBe(100);
      expect(note.startBeat).toBe(0);
    });
  });

  describe('removeMidiNote', () => {
    it('removes a note by ID', () => {
      slice.removeMidiNote('clip-1', 'note-1');
      expect(project!.tracks[0].clips[0].midiData!.notes).toHaveLength(0);
    });
  });

  describe('setNoteVelocity', () => {
    it('clamps velocity to 1–127', () => {
      slice.setNoteVelocity('clip-1', 'note-1', 200);
      expect(project!.tracks[0].clips[0].midiData!.notes[0].velocity).toBe(127);

      slice.setNoteVelocity('clip-1', 'note-1', -5);
      expect(project!.tracks[0].clips[0].midiData!.notes[0].velocity).toBe(1);
    });
  });

  describe('resizeMidiNote', () => {
    it('resizes from right edge', () => {
      slice.resizeMidiNote('clip-1', 'note-1', { edge: 'right', endBeat: 3 });
      expect(project!.tracks[0].clips[0].midiData!.notes[0].durationBeats).toBe(3);
    });

    it('resizes from left edge', () => {
      project = makeProject('clip-1', [makeNote({ startBeat: 1, durationBeats: 2 })]);
      slice.resizeMidiNote('clip-1', 'note-1', { edge: 'left', startBeat: 0.5 });
      const note = project!.tracks[0].clips[0].midiData!.notes[0];
      expect(note.startBeat).toBe(0.5);
      expect(note.durationBeats).toBe(2.5);
    });

    it('enforces minimum duration', () => {
      slice.resizeMidiNote('clip-1', 'note-1', { edge: 'right', endBeat: 0.001, minDurationBeats: 0.25 });
      expect(project!.tracks[0].clips[0].midiData!.notes[0].durationBeats).toBe(0.25);
    });
  });

  describe('stampChord', () => {
    it('creates notes for each interval', () => {
      const ids = slice.stampChord('clip-1', 60, [0, 4, 7], 0, 1, 90);
      expect(ids).toHaveLength(3);
      const notes = project!.tracks[0].clips[0].midiData!.notes;
      // Original note + 3 chord notes
      expect(notes).toHaveLength(4);
      expect(notes.slice(1).map((n) => n.pitch)).toEqual([60, 64, 67]);
    });

    it('filters out-of-range pitches', () => {
      const ids = slice.stampChord('clip-1', 126, [0, 4, 7], 0, 1, 90);
      // 126+0 = 126 (ok), 126+4 = 130 > 127 (filtered), 126+7 = 133 > 127 (filtered)
      expect(ids).toHaveLength(1);
    });
  });

  describe('appendMidiNotesToClip (pure function)', () => {
    it('appends notes to existing midiData', () => {
      const proj = makeProject('clip-1', [makeNote()]);
      const result = appendMidiNotesToClip(proj, 'clip-1', [makeNote({ id: 'note-2', pitch: 64 })]);
      expect(result.tracks[0].clips[0].midiData!.notes).toHaveLength(2);
    });

    it('creates midiData if missing', () => {
      const proj = makeProject('clip-1');
      // Remove midiData
      proj.tracks[0].clips[0].midiData = undefined as never;
      const result = appendMidiNotesToClip(proj, 'clip-1', [makeNote()]);
      expect(result.tracks[0].clips[0].midiData!.notes).toHaveLength(1);
    });
  });
});

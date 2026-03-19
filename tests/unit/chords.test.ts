import { describe, expect, it, beforeEach } from 'vitest';
import { chordPitches, pitchToNoteName, CHORD_SHAPES } from '../../src/utils/chords';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('chords', () => {
  describe('chordPitches', () => {
    it('generates C major chord (C4 E4 G4)', () => {
      const major = CHORD_SHAPES.find((s) => s.abbr === 'maj')!;
      expect(chordPitches(60, major)).toEqual([60, 64, 67]);
    });

    it('generates A minor chord (A3 C4 E4)', () => {
      const minor = CHORD_SHAPES.find((s) => s.abbr === 'min')!;
      expect(chordPitches(57, minor)).toEqual([57, 60, 64]);
    });

    it('generates G7 chord', () => {
      const dom7 = CHORD_SHAPES.find((s) => s.abbr === '7')!;
      expect(chordPitches(67, dom7)).toEqual([67, 71, 74, 77]);
    });

    it('clips pitches above 127', () => {
      const major = CHORD_SHAPES.find((s) => s.abbr === 'maj')!;
      const result = chordPitches(126, major);
      expect(result).toEqual([126]); // 130 and 133 clipped
    });
  });

  describe('pitchToNoteName', () => {
    it('converts middle C', () => {
      expect(pitchToNoteName(60)).toBe('C4');
    });

    it('converts A4 (440Hz)', () => {
      expect(pitchToNoteName(69)).toBe('A4');
    });
  });

  describe('stampChord (store action)', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('stamps a major chord (3 notes) at once', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const major = CHORD_SHAPES.find((s) => s.abbr === 'maj')!;

      const noteIds = useProjectStore.getState().stampChord(
        clip.id, 60, major.intervals, 0, 1, 100
      );

      expect(noteIds).toHaveLength(3);
      const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
      expect(notes).toHaveLength(3);
      expect(notes.map((n) => n.pitch).sort()).toEqual([60, 64, 67]);
      expect(notes.every((n) => n.velocity === 100)).toBe(true);
    });

    it('is undoable as a single action', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const minor = CHORD_SHAPES.find((s) => s.abbr === 'min')!;

      useProjectStore.getState().stampChord(clip.id, 60, minor.intervals, 0, 1);

      expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(3);

      useProjectStore.getState().undo();

      expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(0);
    });

    it('does not push history when every generated pitch is out of range', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);

      const before = useProjectStore.getState().getUndoHistory('pianoRoll', { clipId: clip.id }).length;
      const noteIds = useProjectStore.getState().stampChord(clip.id, 128, [0, 4, 7], 0, 1);

      expect(noteIds).toEqual([]);
      expect(useProjectStore.getState().getUndoHistory('pianoRoll', { clipId: clip.id })).toHaveLength(before);
      expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(0);
    });
  });

  describe('activeChordShape (UI store)', () => {
    it('defaults to "maj"', () => {
      expect(useUIStore.getState().activeChordShape).toBe('maj');
    });

    it('can be changed via setActiveChordShape', () => {
      useUIStore.getState().setActiveChordShape('min');
      expect(useUIStore.getState().activeChordShape).toBe('min');

      useUIStore.getState().setActiveChordShape('7');
      expect(useUIStore.getState().activeChordShape).toBe('7');
    });

    it('clamps invalid chord shapes back to the default abbreviation', () => {
      useUIStore.getState().setActiveChordShape('invalid-shape');
      expect(useUIStore.getState().activeChordShape).toBe('maj');
    });
  });

  describe('stampChord with chord shape integration', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('stamps a diminished chord', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const dim = CHORD_SHAPES.find((s) => s.abbr === 'dim')!;

      const noteIds = useProjectStore.getState().stampChord(
        clip.id, 60, dim.intervals, 2, 0.5, 80
      );

      expect(noteIds).toHaveLength(3);
      const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
      expect(notes.map((n) => n.pitch).sort()).toEqual([60, 63, 66]);
      expect(notes.every((n) => n.startBeat === 2)).toBe(true);
      expect(notes.every((n) => n.durationBeats === 0.5)).toBe(true);
      expect(notes.every((n) => n.velocity === 80)).toBe(true);
    });

    it('stamps a 7th chord (4 notes)', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const dom7 = CHORD_SHAPES.find((s) => s.abbr === '7')!;

      const noteIds = useProjectStore.getState().stampChord(
        clip.id, 60, dom7.intervals, 0, 1
      );

      expect(noteIds).toHaveLength(4);
      const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
      expect(notes.map((n) => n.pitch).sort()).toEqual([60, 64, 67, 70]);
    });

    it('uses activeChordShape from UI store to look up intervals', () => {
      useUIStore.getState().setActiveChordShape('min');
      const abbr = useUIStore.getState().activeChordShape;
      const shape = CHORD_SHAPES.find((s) => s.abbr === abbr)!;

      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);

      const noteIds = useProjectStore.getState().stampChord(
        clip.id, 60, shape.intervals, 0, 1
      );

      expect(noteIds).toHaveLength(3);
      const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
      expect(notes.map((n) => n.pitch).sort()).toEqual([60, 63, 67]);
    });
  });
});

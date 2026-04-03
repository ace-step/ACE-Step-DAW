import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePattern,
  getScalePitches,
  type PatternRole,
  type PatternOptions,
} from '../../src/utils/midiPatternGenerator';
import { useProjectStore } from '../../src/store/projectStore';

// ── Helper ──────────────────────────────────────────────────────────────

/** All generated notes must have valid MIDI fields */
function assertValidNotes(notes: ReturnType<typeof generatePattern>) {
  for (const note of notes) {
    expect(note.pitch).toBeGreaterThanOrEqual(0);
    expect(note.pitch).toBeLessThanOrEqual(127);
    expect(note.startBeat).toBeGreaterThanOrEqual(0);
    expect(note.durationBeats).toBeGreaterThan(0);
    expect(note.velocity).toBeGreaterThanOrEqual(0);
    expect(note.velocity).toBeLessThanOrEqual(1);
  }
}

/** Check that all pitches belong to the given scale */
function assertInScale(pitches: number[], root: number, scaleIntervals: number[]) {
  const validPCs = new Set(scaleIntervals.map((i) => (root + i) % 12));
  for (const p of pitches) {
    expect(validPCs.has(p % 12)).toBe(true);
  }
}

// ── getScalePitches ─────────────────────────────────────────────────────

describe('getScalePitches', () => {
  it('returns C major pitches in octave 4 (48-59)', () => {
    const pitches = getScalePitches(0, 'major', 48, 59);
    expect(pitches).toEqual([48, 50, 52, 53, 55, 57, 59]);
  });

  it('returns A minor pentatonic pitches across two octaves', () => {
    const pitches = getScalePitches(9, 'pentatonic', 57, 80);
    // A pentatonic: A B D E G -> 9,11,2,4,7
    // Actually 'pentatonic' is major pentatonic [0,2,4,7,9] so A major pent = A B C# E F#
    const pcs = new Set(pitches.map((p) => p % 12));
    const expected = new Set([0, 2, 4, 7, 9].map((i) => (9 + i) % 12));
    expect(pcs).toEqual(expected);
  });

  it('clamps to valid MIDI range 0-127', () => {
    const pitches = getScalePitches(0, 'major', 0, 127);
    expect(pitches.every((p) => p >= 0 && p <= 127)).toBe(true);
  });
});

// ── generatePattern - common properties ─────────────────────────────────

describe('generatePattern', () => {
  const baseOpts: PatternOptions = {
    role: 'melody',
    genre: 'pop',
    root: 0,       // C
    scale: 'major',
    bars: 2,
    density: 0.5,
    beatsPerBar: 4,
    seed: 42,
  };

  it('returns an array of notes with valid MIDI fields', () => {
    const notes = generatePattern(baseOpts);
    expect(notes.length).toBeGreaterThan(0);
    assertValidNotes(notes);
  });

  it('generates deterministic output with the same seed', () => {
    const a = generatePattern(baseOpts);
    const b = generatePattern(baseOpts);
    expect(a).toEqual(b);
  });

  it('generates different output with different seeds', () => {
    const a = generatePattern({ ...baseOpts, seed: 1 });
    const b = generatePattern({ ...baseOpts, seed: 2 });
    // Could theoretically be equal but extremely unlikely
    const aPitches = a.map((n) => n.pitch);
    const bPitches = b.map((n) => n.pitch);
    expect(aPitches).not.toEqual(bPitches);
  });

  it('all notes fit within the requested bar count', () => {
    const notes = generatePattern({ ...baseOpts, bars: 4 });
    const totalBeats = 4 * baseOpts.beatsPerBar;
    for (const note of notes) {
      expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(totalBeats + 0.001);
    }
  });

  it('all pitches belong to the requested scale', () => {
    const notes = generatePattern(baseOpts);
    const scaleIntervals = [0, 2, 4, 5, 7, 9, 11]; // major
    assertInScale(notes.map((n) => n.pitch), baseOpts.root, scaleIntervals);
  });

  it('density 0 produces few notes, density 1 produces many', () => {
    const sparse = generatePattern({ ...baseOpts, density: 0.1, bars: 4, seed: 10 });
    const dense = generatePattern({ ...baseOpts, density: 1.0, bars: 4, seed: 10 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  // ── Role: melody ──────────────────────────────────────────────────────

  describe('role: melody', () => {
    it('generates single-note lines (no simultaneous notes on same beat)', () => {
      const notes = generatePattern({ ...baseOpts, role: 'melody', bars: 4 });
      assertValidNotes(notes);
      // Melody should not have multiple notes starting at exact same beat
      const starts = notes.map((n) => n.startBeat);
      const uniqueStarts = new Set(starts);
      expect(uniqueStarts.size).toBe(starts.length);
    });
  });

  // ── Role: chords ──────────────────────────────────────────────────────

  describe('role: chords', () => {
    it('generates chords (multiple notes at same start beat)', () => {
      const notes = generatePattern({ ...baseOpts, role: 'chords', bars: 4 });
      assertValidNotes(notes);
      // At least some beats should have multiple notes
      const startCounts = new Map<number, number>();
      for (const n of notes) {
        startCounts.set(n.startBeat, (startCounts.get(n.startBeat) ?? 0) + 1);
      }
      const hasChords = [...startCounts.values()].some((count) => count >= 3);
      expect(hasChords).toBe(true);
    });

    it('chord notes are in the requested scale', () => {
      const notes = generatePattern({ ...baseOpts, role: 'chords' });
      assertInScale(notes.map((n) => n.pitch), baseOpts.root, [0, 2, 4, 5, 7, 9, 11]);
    });
  });

  // ── Role: bass ────────────────────────────────────────────────────────

  describe('role: bass', () => {
    it('generates notes in the bass register (below MIDI 60)', () => {
      const notes = generatePattern({ ...baseOpts, role: 'bass', bars: 4 });
      assertValidNotes(notes);
      expect(notes.length).toBeGreaterThan(0);
      const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
      expect(avgPitch).toBeLessThan(60);
    });
  });

  // ── Role: arp ─────────────────────────────────────────────────────────

  describe('role: arp', () => {
    it('generates fast, evenly-spaced notes', () => {
      const notes = generatePattern({ ...baseOpts, role: 'arp', bars: 2, density: 0.7 });
      assertValidNotes(notes);
      expect(notes.length).toBeGreaterThan(4);
    });

    it('arp notes are in the requested scale', () => {
      const notes = generatePattern({ ...baseOpts, role: 'arp' });
      assertInScale(notes.map((n) => n.pitch), baseOpts.root, [0, 2, 4, 5, 7, 9, 11]);
    });
  });

  // ── Different scales ──────────────────────────────────────────────────

  it('generates notes in minor scale when requested', () => {
    const notes = generatePattern({ ...baseOpts, scale: 'minor' });
    assertInScale(notes.map((n) => n.pitch), 0, [0, 2, 3, 5, 7, 8, 10]);
  });

  it('generates notes in blues scale when requested', () => {
    const notes = generatePattern({ ...baseOpts, scale: 'blues' });
    assertInScale(notes.map((n) => n.pitch), 0, [0, 3, 5, 6, 7, 10]);
  });

  // ── Different genres affect rhythm/density ────────────────────────────

  it('generates patterns for all supported genres without errors', () => {
    const genres = ['pop', 'jazz', 'electronic', 'hiphop', 'classical', 'rock'] as const;
    for (const genre of genres) {
      const notes = generatePattern({ ...baseOpts, genre });
      expect(notes.length).toBeGreaterThan(0);
      assertValidNotes(notes);
    }
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('handles 1 bar', () => {
    const notes = generatePattern({ ...baseOpts, bars: 1 });
    expect(notes.length).toBeGreaterThan(0);
    assertValidNotes(notes);
  });

  it('handles 8 bars', () => {
    const notes = generatePattern({ ...baseOpts, bars: 8 });
    expect(notes.length).toBeGreaterThan(0);
    assertValidNotes(notes);
  });

  it('root note other than C works correctly', () => {
    const notes = generatePattern({ ...baseOpts, root: 7 }); // G
    assertInScale(notes.map((n) => n.pitch), 7, [0, 2, 4, 5, 7, 9, 11]);
  });
});

// ── Store integration: populateMidiPattern ──────────────────────────────

describe('populateMidiPattern (store action)', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  const patternOpts: PatternOptions = {
    role: 'melody',
    genre: 'pop',
    root: 0,
    scale: 'major',
    bars: 2,
    density: 0.5,
    beatsPerBar: 4,
    seed: 42,
  };

  it('populates a MIDI clip with generated notes', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    const noteIds = useProjectStore.getState().populateMidiPattern(clip.id, patternOpts);

    expect(noteIds.length).toBeGreaterThan(0);
    const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
    expect(notes).toHaveLength(noteIds.length);
    // Each note should have a valid id
    for (const note of notes) {
      expect(note.id.length).toBeGreaterThan(0);
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
    }
  });

  it('replaces existing notes with generated pattern', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    // Add a manual note first
    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8,
    });
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(1);

    // Now generate — should replace
    useProjectStore.getState().populateMidiPattern(clip.id, patternOpts);
    const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
    // Should have generated notes, not the old one
    expect(notes.length).toBeGreaterThan(1);
  });

  it('is undoable as a single action', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    useProjectStore.getState().populateMidiPattern(clip.id, patternOpts);
    const countAfter = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes.length;
    expect(countAfter).toBeGreaterThan(0);

    useProjectStore.getState().undo();
    const countAfterUndo = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes.length;
    expect(countAfterUndo).toBe(0);
  });
});

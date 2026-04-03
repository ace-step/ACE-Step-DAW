import { describe, it, expect } from 'vitest';
import { generatePattern, getScalePitches, type PatternOptions, type GeneratedNote } from '../midiPatternGenerator';

// ─── getScalePitches ────────────────────────────────────────────────────────

describe('getScalePitches', () => {
  it('returns pitches within the specified range', () => {
    const pitches = getScalePitches(0, 'major', 60, 72);
    for (const p of pitches) {
      expect(p).toBeGreaterThanOrEqual(60);
      expect(p).toBeLessThanOrEqual(72);
    }
  });

  it('returns sorted pitches', () => {
    const pitches = getScalePitches(0, 'major', 48, 84);
    for (let i = 1; i < pitches.length; i++) {
      expect(pitches[i]).toBeGreaterThanOrEqual(pitches[i - 1]);
    }
  });

  it('returns C major scale pitches in one octave', () => {
    // C major scale from C4 (60) to B4 (71)
    const pitches = getScalePitches(0, 'major', 60, 71);
    // C major intervals: 0, 2, 4, 5, 7, 9, 11
    // So pitches should be: 60, 62, 64, 65, 67, 69, 71
    expect(pitches).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it('returns A minor scale pitches', () => {
    // A minor = natural minor (A, B, C, D, E, F, G)
    // root=9 (A), intervals: 0, 2, 3, 5, 7, 8, 10
    const pitches = getScalePitches(9, 'minor', 69, 80);
    // A4=69, B4=71, C5=72, D5=74, E5=76, F5=77, G5=79
    expect(pitches).toEqual([69, 71, 72, 74, 76, 77, 79]);
  });

  it('returns empty array when range contains no scale pitches', () => {
    // C major (root=0) between MIDI 61 and 61 — only C# which is not in C major
    const pitches = getScalePitches(0, 'major', 61, 61);
    expect(pitches).toEqual([]);
  });

  it('falls back to major scale for unknown scale name', () => {
    const unknown = getScalePitches(0, 'nonexistent_scale', 60, 72);
    const major = getScalePitches(0, 'major', 60, 72);
    expect(unknown).toEqual(major);
  });

  it('handles wide range spanning multiple octaves', () => {
    const pitches = getScalePitches(0, 'major', 36, 96);
    expect(pitches.length).toBeGreaterThan(7); // more than one octave
    // All should be in C major
    for (const p of pitches) {
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(p % 12);
    }
  });
});

// ─── generatePattern ────────────────────────────────────────────────────────

function makeOpts(overrides: Partial<PatternOptions> = {}): PatternOptions {
  return {
    role: 'melody',
    genre: 'pop',
    root: 0,
    scale: 'major',
    bars: 2,
    density: 0.5,
    beatsPerBar: 4,
    seed: 42,
    ...overrides,
  };
}

describe('generatePattern', () => {
  it('generates notes for melody role', () => {
    const notes = generatePattern(makeOpts({ role: 'melody' }));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('generates notes for chords role', () => {
    const notes = generatePattern(makeOpts({ role: 'chords' }));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('generates notes for bass role', () => {
    const notes = generatePattern(makeOpts({ role: 'bass' }));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('generates notes for arp role', () => {
    const notes = generatePattern(makeOpts({ role: 'arp' }));
    expect(notes.length).toBeGreaterThan(0);
  });

  it('is deterministic — same seed produces same output', () => {
    const a = generatePattern(makeOpts({ seed: 123 }));
    const b = generatePattern(makeOpts({ seed: 123 }));
    expect(a).toEqual(b);
  });

  it('is deterministic for another chosen seed', () => {
    const a = generatePattern(makeOpts({ seed: 1 }));
    const b = generatePattern(makeOpts({ seed: 1 }));
    expect(a).toEqual(b);
  });

  it('all notes have valid properties', () => {
    for (const role of ['melody', 'chords', 'bass', 'arp'] as const) {
      const notes = generatePattern(makeOpts({ role, density: 0.8 }));
      for (const note of notes) {
        expect(note.pitch).toBeGreaterThanOrEqual(0);
        expect(note.pitch).toBeLessThanOrEqual(127);
        expect(note.startBeat).toBeGreaterThanOrEqual(0);
        expect(note.durationBeats).toBeGreaterThan(0);
        expect(note.velocity).toBeGreaterThanOrEqual(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('notes stay within total beat range', () => {
    const opts = makeOpts({ bars: 4, beatsPerBar: 4 });
    const totalBeats = 16;
    const notes = generatePattern(opts);
    for (const note of notes) {
      expect(note.startBeat).toBeLessThan(totalBeats);
      expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(totalBeats + 0.01);
    }
  });

  it('melody notes are in middle register (60-84)', () => {
    const notes = generatePattern(makeOpts({ role: 'melody', density: 1 }));
    for (const note of notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(60);
      expect(note.pitch).toBeLessThanOrEqual(84);
    }
  });

  it('bass notes are in low register (28-55)', () => {
    const notes = generatePattern(makeOpts({ role: 'bass', density: 1 }));
    for (const note of notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(28);
      expect(note.pitch).toBeLessThanOrEqual(55);
    }
  });

  it('higher density produces more notes', () => {
    const sparse = generatePattern(makeOpts({ density: 0.1, seed: 100 }));
    const dense = generatePattern(makeOpts({ density: 0.9, seed: 100 }));
    expect(dense.length).toBeGreaterThanOrEqual(sparse.length);
  });

  it('notes conform to the chosen scale', () => {
    const opts = makeOpts({ root: 0, scale: 'major', role: 'melody', density: 1 });
    const notes = generatePattern(opts);
    const majorDegrees = [0, 2, 4, 5, 7, 9, 11];
    for (const note of notes) {
      expect(majorDegrees).toContain(note.pitch % 12);
    }
  });

  it('works with all genres', () => {
    for (const genre of ['pop', 'jazz', 'electronic', 'hiphop', 'classical', 'rock'] as const) {
      const notes = generatePattern(makeOpts({ genre, density: 0.5 }));
      expect(notes.length).toBeGreaterThan(0);
    }
  });

  it('chord role generates multiple simultaneous notes', () => {
    const notes = generatePattern(makeOpts({ role: 'chords', density: 0.8 }));
    // Group by startBeat
    const byStart = new Map<number, GeneratedNote[]>();
    for (const n of notes) {
      const key = Math.round(n.startBeat * 100);
      byStart.set(key, [...(byStart.get(key) ?? []), n]);
    }
    // At least one beat should have 2+ simultaneous notes (a chord)
    const hasChord = [...byStart.values()].some((group) => group.length >= 2);
    expect(hasChord).toBe(true);
  });

  it('handles 1-bar patterns', () => {
    const notes = generatePattern(makeOpts({ bars: 1, density: 0.8 }));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.startBeat).toBeLessThan(4);
    }
  });

  it('handles non-4/4 time signature (3 beats per bar)', () => {
    const notes = generatePattern(makeOpts({ beatsPerBar: 3, bars: 2 }));
    const totalBeats = 6;
    for (const n of notes) {
      expect(n.startBeat).toBeLessThan(totalBeats);
    }
  });
});

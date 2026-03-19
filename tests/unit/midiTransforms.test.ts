import { describe, it, expect } from 'vitest';
import type { MidiNote } from '../../src/types/project';
import {
  humanize,
  transpose,
  invert,
  retrograde,
  legato,
  scaleCorrect,
  velocityScale,
  applyTransform,
} from '../../src/utils/midiTransforms';

function makeNote(overrides: Partial<MidiNote> & { id: string }): MidiNote {
  return { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100, ...overrides };
}

// ── Humanize ────────────────────────────────────────────────────────────

describe('humanize', () => {
  it('randomizes timing and velocity within bounds', () => {
    const notes = [makeNote({ id: 'a', startBeat: 2, velocity: 80 })];
    const result = humanize(notes, { type: 'humanize', timingAmount: 0.1, velocityAmount: 10, seed: 42 });
    expect(result).toHaveLength(1);
    expect(result[0].startBeat).not.toBe(2);
    expect(Math.abs(result[0].startBeat - 2)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result[0].velocity - 80)).toBeLessThanOrEqual(10);
  });

  it('clamps startBeat to >= 0', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0, velocity: 100 })];
    const result = humanize(notes, { type: 'humanize', timingAmount: 10, velocityAmount: 0, seed: 1 });
    expect(result[0].startBeat).toBeGreaterThanOrEqual(0);
  });

  it('clamps velocity to 1-127', () => {
    const notes = [makeNote({ id: 'a', velocity: 1 })];
    const result = humanize(notes, { type: 'humanize', timingAmount: 0, velocityAmount: 100, seed: 999 });
    expect(result[0].velocity).toBeGreaterThanOrEqual(1);
    expect(result[0].velocity).toBeLessThanOrEqual(127);
  });

  it('is deterministic with same seed', () => {
    const notes = [makeNote({ id: 'a', startBeat: 4, velocity: 64 })];
    const r1 = humanize(notes, { type: 'humanize', timingAmount: 0.5, velocityAmount: 20, seed: 7 });
    const r2 = humanize(notes, { type: 'humanize', timingAmount: 0.5, velocityAmount: 20, seed: 7 });
    expect(r1).toEqual(r2);
  });
});

// ── Transpose ───────────────────────────────────────────────────────────

describe('transpose', () => {
  it('shifts pitch by semitones', () => {
    const notes = [makeNote({ id: 'a', pitch: 60 }), makeNote({ id: 'b', pitch: 64 })];
    const result = transpose(notes, { type: 'transpose', semitones: 7 });
    expect(result.map((n) => n.pitch)).toEqual([67, 71]);
  });

  it('clamps pitch to 0-127', () => {
    const notes = [makeNote({ id: 'a', pitch: 125 })];
    expect(transpose(notes, { type: 'transpose', semitones: 5 })[0].pitch).toBe(127);
    expect(transpose(notes, { type: 'transpose', semitones: -200 })[0].pitch).toBe(0);
  });

  it('supports negative (downward) transposition', () => {
    const notes = [makeNote({ id: 'a', pitch: 60 })];
    expect(transpose(notes, { type: 'transpose', semitones: -12 })[0].pitch).toBe(48);
  });
});

// ── Invert ──────────────────────────────────────────────────────────────

describe('invert', () => {
  it('mirrors notes around the midpoint by default', () => {
    const notes = [
      makeNote({ id: 'a', pitch: 60 }),
      makeNote({ id: 'b', pitch: 64 }),
      makeNote({ id: 'c', pitch: 67 }),
    ];
    // midpoint = round((60+67)/2) = 64 (63.5 → 64)
    const result = invert(notes, { type: 'invert' });
    expect(result.map((n) => n.pitch)).toEqual([68, 64, 61]);
  });

  it('mirrors around a specified axis', () => {
    const notes = [makeNote({ id: 'a', pitch: 60 })];
    const result = invert(notes, { type: 'invert', axis: 64 });
    expect(result[0].pitch).toBe(68);
  });

  it('clamps to MIDI range', () => {
    const notes = [makeNote({ id: 'a', pitch: 5 })];
    const result = invert(notes, { type: 'invert', axis: 0 });
    expect(result[0].pitch).toBe(0); // 2*0-5 = -5 → clamped to 0
  });

  it('returns empty array for empty input', () => {
    expect(invert([], { type: 'invert' })).toEqual([]);
  });
});

// ── Retrograde ──────────────────────────────────────────────────────────

describe('retrograde', () => {
  it('reverses note order in time', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 1 }),
      makeNote({ id: 'b', startBeat: 1, durationBeats: 2 }),
      makeNote({ id: 'c', startBeat: 3, durationBeats: 1 }),
    ];
    const result = retrograde(notes);
    // total span: 0 to 4
    // note a (start 0, dur 1): new start = 4 - 0 - 1 = 3
    // note b (start 1, dur 2): new start = 4 - 1 - 2 = 1
    // note c (start 3, dur 1): new start = 4 - 3 - 1 = 0
    expect(result.map((n) => ({ id: n.id, s: n.startBeat }))).toEqual([
      { id: 'a', s: 3 },
      { id: 'b', s: 1 },
      { id: 'c', s: 0 },
    ]);
  });

  it('preserves durations', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 2 }),
      makeNote({ id: 'b', startBeat: 2, durationBeats: 3 }),
    ];
    const result = retrograde(notes);
    expect(result.map((n) => n.durationBeats)).toEqual([2, 3]);
  });

  it('handles empty array', () => {
    expect(retrograde([])).toEqual([]);
  });
});

// ── Legato ──────────────────────────────────────────────────────────────

describe('legato', () => {
  it('extends each note to touch the next', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 0.5 }),
      makeNote({ id: 'b', startBeat: 2, durationBeats: 0.5 }),
      makeNote({ id: 'c', startBeat: 4, durationBeats: 1 }),
    ];
    const result = legato(notes, { type: 'legato' });
    expect(result.map((n) => n.durationBeats)).toEqual([2, 2, 1]);
  });

  it('supports overlap', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 0.5 }),
      makeNote({ id: 'b', startBeat: 2, durationBeats: 0.5 }),
    ];
    const result = legato(notes, { type: 'legato', overlapBeats: 0.25 });
    expect(result[0].durationBeats).toBe(2.25);
  });

  it('returns single note unchanged', () => {
    const notes = [makeNote({ id: 'a' })];
    const result = legato(notes, { type: 'legato' });
    expect(result).toEqual(notes);
  });
});

// ── Scale Correct ───────────────────────────────────────────────────────

describe('scaleCorrect', () => {
  it('snaps notes to C major scale', () => {
    // C major = C D E F G A B
    // C#(61) → C(60), D#(63) → D(62), F#(66) → F(65) or G(67)
    const notes = [
      makeNote({ id: 'a', pitch: 61 }), // C# → C (snap down)
      makeNote({ id: 'b', pitch: 63 }), // D# → D (snap down)
      makeNote({ id: 'c', pitch: 60 }), // C stays C
    ];
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 0, scale: 'major' });
    expect(result[0].pitch).toBe(60); // C# → C
    expect(result[1].pitch).toBe(62); // D# → D
    expect(result[2].pitch).toBe(60); // C stays
  });

  it('snaps to A minor pentatonic', () => {
    // A minor pentatonic: A C D E G = 9 0 2 4 7 (relative to A=root)
    const notes = [makeNote({ id: 'a', pitch: 70 })]; // A#4
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 9, scale: 'minor-pentatonic' });
    // A#=70 is not in A minor pent. Nearest: A(69) or C(72)? Offset from root: 70%12=10, root=9, so semitone=1
    // Valid intervals from root 9: 9,0,2,4,7 → pitches near 70: 69(A), 72(C)
    // snap down preference: 69
    expect(result[0].pitch).toBe(69);
  });

  it('returns notes unchanged for unknown scale', () => {
    const notes = [makeNote({ id: 'a', pitch: 61 })];
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 0, scale: 'nonexistent' });
    expect(result[0].pitch).toBe(61);
  });
});

// ── Velocity Scale ──────────────────────────────────────────────────────

describe('velocityScale', () => {
  it('maps velocity range to new min/max', () => {
    const notes = [
      makeNote({ id: 'a', velocity: 50 }),
      makeNote({ id: 'b', velocity: 100 }),
    ];
    const result = velocityScale(notes, { type: 'velocityScale', min: 20, max: 120 });
    expect(result[0].velocity).toBe(20);
    expect(result[1].velocity).toBe(120);
  });

  it('handles all same velocity', () => {
    const notes = [
      makeNote({ id: 'a', velocity: 80 }),
      makeNote({ id: 'b', velocity: 80 }),
    ];
    const result = velocityScale(notes, { type: 'velocityScale', min: 40, max: 100 });
    // normalized = 0.5 when range=0, so mapped to midpoint
    expect(result[0].velocity).toBe(70);
  });

  it('clamps to 1-127', () => {
    const notes = [makeNote({ id: 'a', velocity: 50 }), makeNote({ id: 'b', velocity: 100 })];
    const result = velocityScale(notes, { type: 'velocityScale', min: 0, max: 200 });
    expect(result[0].velocity).toBeGreaterThanOrEqual(1);
    expect(result[1].velocity).toBeLessThanOrEqual(127);
  });
});

// ── applyTransform dispatcher ───────────────────────────────────────────

describe('applyTransform', () => {
  const notes = [makeNote({ id: 'a', pitch: 60, startBeat: 0 })];

  it('dispatches transpose', () => {
    const result = applyTransform(notes, { type: 'transpose', semitones: 12 });
    expect(result[0].pitch).toBe(72);
  });

  it('dispatches retrograde', () => {
    const twoNotes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 1 }),
      makeNote({ id: 'b', startBeat: 1, durationBeats: 1 }),
    ];
    const result = applyTransform(twoNotes, { type: 'retrograde' });
    expect(result[0].startBeat).toBe(1);
    expect(result[1].startBeat).toBe(0);
  });

  it('dispatches humanize', () => {
    const result = applyTransform(notes, { type: 'humanize', timingAmount: 0.01, velocityAmount: 1, seed: 1 });
    expect(result).toHaveLength(1);
  });

  it('dispatches legato', () => {
    const twoNotes = [
      makeNote({ id: 'a', startBeat: 0, durationBeats: 0.5 }),
      makeNote({ id: 'b', startBeat: 2, durationBeats: 0.5 }),
    ];
    const result = applyTransform(twoNotes, { type: 'legato' });
    expect(result[0].durationBeats).toBe(2);
  });

  it('dispatches scaleCorrect', () => {
    const result = applyTransform(
      [makeNote({ id: 'a', pitch: 61 })],
      { type: 'scaleCorrect', root: 0, scale: 'major' },
    );
    expect(result[0].pitch).toBe(60);
  });

  it('dispatches velocityScale', () => {
    const result = applyTransform(
      [makeNote({ id: 'a', velocity: 50 }), makeNote({ id: 'b', velocity: 100 })],
      { type: 'velocityScale', min: 10, max: 110 },
    );
    expect(result[0].velocity).toBe(10);
    expect(result[1].velocity).toBe(110);
  });

  it('dispatches invert', () => {
    const result = applyTransform(
      [makeNote({ id: 'a', pitch: 60 }), makeNote({ id: 'b', pitch: 64 })],
      { type: 'invert', axis: 62 },
    );
    expect(result[0].pitch).toBe(64);
    expect(result[1].pitch).toBe(60);
  });
});

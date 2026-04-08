import { describe, it, expect } from 'vitest';
import type { MidiNote } from '../../types/project';
import {
  SCALES,
  humanize,
  transpose,
  invert,
  retrograde,
  legato,
  scaleCorrect,
  velocityScale,
  applyTransform,
} from '../midiTransforms';

function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'n1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 100,
    ...overrides,
  };
}

describe('SCALES', () => {
  it('defines major scale with 7 notes', () => {
    expect(SCALES.major).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('defines chromatic scale with 12 notes', () => {
    expect(SCALES.chromatic).toHaveLength(12);
  });
});

describe('transpose', () => {
  it('shifts pitch by given semitones', () => {
    const notes = [makeNote({ pitch: 60 })];
    const result = transpose(notes, { type: 'transpose', semitones: 7 });
    expect(result[0].pitch).toBe(67);
  });

  it('clamps pitch to 0-127 range', () => {
    const high = transpose([makeNote({ pitch: 120 })], { type: 'transpose', semitones: 20 });
    expect(high[0].pitch).toBe(127);

    const low = transpose([makeNote({ pitch: 5 })], { type: 'transpose', semitones: -10 });
    expect(low[0].pitch).toBe(0);
  });

  it('preserves other note properties', () => {
    const note = makeNote({ velocity: 80, startBeat: 2 });
    const result = transpose([note], { type: 'transpose', semitones: 3 });
    expect(result[0].velocity).toBe(80);
    expect(result[0].startBeat).toBe(2);
  });
});

describe('humanize', () => {
  it('randomizes timing and velocity with deterministic seed', () => {
    const notes = [makeNote(), makeNote({ id: 'n2', startBeat: 1 })];
    const result = humanize(notes, {
      type: 'humanize',
      timingAmount: 0.1,
      velocityAmount: 10,
      seed: 42,
    });
    // With seed, results should be deterministic
    const result2 = humanize(notes, {
      type: 'humanize',
      timingAmount: 0.1,
      velocityAmount: 10,
      seed: 42,
    });
    expect(result[0].startBeat).toBe(result2[0].startBeat);
    expect(result[0].velocity).toBe(result2[0].velocity);
  });

  it('clamps startBeat to >= 0', () => {
    const notes = [makeNote({ startBeat: 0 })];
    const result = humanize(notes, {
      type: 'humanize',
      timingAmount: 100,
      velocityAmount: 0,
      seed: 1,
    });
    expect(result[0].startBeat).toBeGreaterThanOrEqual(0);
  });

  it('clamps velocity to 1-127', () => {
    const notes = [makeNote({ velocity: 1 })];
    const result = humanize(notes, {
      type: 'humanize',
      timingAmount: 0,
      velocityAmount: 100,
      seed: 12345,
    });
    expect(result[0].velocity).toBeGreaterThanOrEqual(1);
    expect(result[0].velocity).toBeLessThanOrEqual(127);
  });
});

describe('invert', () => {
  it('inverts notes around the midpoint by default', () => {
    const notes = [
      makeNote({ pitch: 60 }),
      makeNote({ id: 'n2', pitch: 64 }),
      makeNote({ id: 'n3', pitch: 67 }),
    ];
    const result = invert(notes, { type: 'invert' });
    // Midpoint = round((60+67)/2) = 64
    // 60 → 2*64 - 60 = 68
    // 64 → 2*64 - 64 = 64
    // 67 → 2*64 - 67 = 61
    expect(result[0].pitch).toBe(68);
    expect(result[1].pitch).toBe(64);
    expect(result[2].pitch).toBe(61);
  });

  it('inverts around a custom axis', () => {
    const notes = [makeNote({ pitch: 60 })];
    const result = invert(notes, { type: 'invert', axis: 60 });
    expect(result[0].pitch).toBe(60);
  });

  it('returns empty array for empty input', () => {
    expect(invert([], { type: 'invert' })).toEqual([]);
  });
});

describe('retrograde', () => {
  it('reverses the time order of notes', () => {
    const notes = [
      makeNote({ startBeat: 0, durationBeats: 1 }),
      makeNote({ id: 'n2', startBeat: 1, durationBeats: 1 }),
      makeNote({ id: 'n3', startBeat: 2, durationBeats: 1 }),
    ];
    const result = retrograde(notes);
    // maxEnd = 3, minStart = 0
    // note at 0 dur 1 → 3 - 0 - 1 = 2
    // note at 1 dur 1 → 3 - 1 - 1 = 1
    // note at 2 dur 1 → 3 - 2 - 1 = 0
    expect(result[0].startBeat).toBe(2);
    expect(result[1].startBeat).toBe(1);
    expect(result[2].startBeat).toBe(0);
  });

  it('returns empty array for empty input', () => {
    expect(retrograde([])).toEqual([]);
  });
});

describe('legato', () => {
  it('extends note durations to fill gaps', () => {
    const notes = [
      makeNote({ startBeat: 0, durationBeats: 0.5 }),
      makeNote({ id: 'n2', startBeat: 1, durationBeats: 0.5 }),
      makeNote({ id: 'n3', startBeat: 2, durationBeats: 0.5 }),
    ];
    const result = legato(notes, { type: 'legato' });
    expect(result[0].durationBeats).toBe(1); // gap filled
    expect(result[1].durationBeats).toBe(1);
    expect(result[2].durationBeats).toBe(0.5); // last note unchanged
  });

  it('handles overlap parameter', () => {
    const notes = [
      makeNote({ startBeat: 0, durationBeats: 0.5 }),
      makeNote({ id: 'n2', startBeat: 1, durationBeats: 0.5 }),
    ];
    const result = legato(notes, { type: 'legato', overlapBeats: 0.1 });
    expect(result[0].durationBeats).toBe(1.1);
  });

  it('returns unchanged for single note', () => {
    const notes = [makeNote()];
    const result = legato(notes, { type: 'legato' });
    expect(result).toHaveLength(1);
  });
});

describe('scaleCorrect', () => {
  it('snaps notes to C major scale', () => {
    // C# (61) should snap to C (60) or D (62)
    const notes = [makeNote({ pitch: 61 })]; // C#
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 0, scale: 'major' });
    // C major: 0,2,4,5,7,9,11 → pitches 60,62,64,65,67,69,71
    // 61 (C#) → snaps down to 60 (C) since offset 1 tries lower first
    expect(result[0].pitch).toBe(60);
  });

  it('leaves notes already in scale unchanged', () => {
    const notes = [makeNote({ pitch: 60 })]; // C
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 0, scale: 'major' });
    expect(result[0].pitch).toBe(60);
  });

  it('returns unchanged for unknown scale', () => {
    const notes = [makeNote({ pitch: 61 })];
    const result = scaleCorrect(notes, { type: 'scaleCorrect', root: 0, scale: 'nonexistent' });
    expect(result[0].pitch).toBe(61);
  });
});

describe('velocityScale', () => {
  it('scales velocities to target range', () => {
    const notes = [
      makeNote({ velocity: 50 }),
      makeNote({ id: 'n2', velocity: 100 }),
    ];
    const result = velocityScale(notes, { type: 'velocityScale', min: 20, max: 120 });
    expect(result[0].velocity).toBe(20);
    expect(result[1].velocity).toBe(120);
  });

  it('handles uniform velocities', () => {
    const notes = [
      makeNote({ velocity: 80 }),
      makeNote({ id: 'n2', velocity: 80 }),
    ];
    const result = velocityScale(notes, { type: 'velocityScale', min: 40, max: 100 });
    // When srcRange is 0, normalized = 0.5, so newVel = 40 + 0.5 * 60 = 70
    expect(result[0].velocity).toBe(70);
  });

  it('returns empty for empty input', () => {
    expect(velocityScale([], { type: 'velocityScale', min: 0, max: 127 })).toEqual([]);
  });
});

describe('applyTransform', () => {
  it('dispatches to transpose', () => {
    const notes = [makeNote({ pitch: 60 })];
    const result = applyTransform(notes, { type: 'transpose', semitones: 5 });
    expect(result[0].pitch).toBe(65);
  });

  it('dispatches to retrograde', () => {
    const notes = [
      makeNote({ startBeat: 0, durationBeats: 1 }),
      makeNote({ id: 'n2', startBeat: 1, durationBeats: 1 }),
    ];
    const result = applyTransform(notes, { type: 'retrograde' });
    expect(result[0].startBeat).toBe(1);
    expect(result[1].startBeat).toBe(0);
  });
});

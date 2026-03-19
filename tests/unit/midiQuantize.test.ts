import { describe, expect, it } from 'vitest';
import {
  quantizedBeat,
  quantizeNote,
  quantizeNotes,
  type QuantizeOptions,
} from '../../src/utils/midiQuantize';
import type { MidiNote } from '../../src/types/project';

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

const defaultOptions: QuantizeOptions = {
  gridBeats: 0.5, // 1/8 notes
  strength: 100,
  swing: 0,
  scope: 'start',
};

describe('quantizedBeat', () => {
  it('snaps to nearest grid line', () => {
    expect(quantizedBeat(0.3, 0.5, 0)).toBe(0.5);
    expect(quantizedBeat(0.2, 0.5, 0)).toBe(0);
    expect(quantizedBeat(1.0, 0.5, 0)).toBe(1.0);
  });

  it('applies swing to odd grid positions', () => {
    // grid index 1 (odd) at gridBeats=0.5 → 0.5 + swing offset
    const result = quantizedBeat(0.5, 0.5, 100);
    // swing 100% shifts odd positions by gridBeats * 0.5 = 0.25
    expect(result).toBeCloseTo(0.75);
  });

  it('does not apply swing to even grid positions', () => {
    const result = quantizedBeat(1.0, 0.5, 100);
    // grid index 2 (even) — no swing
    expect(result).toBe(1.0);
  });

  it('partial swing applies proportionally', () => {
    // 50% swing on odd position
    const result = quantizedBeat(0.5, 0.5, 50);
    expect(result).toBeCloseTo(0.625);
  });
});

describe('quantizeNote', () => {
  it('100% strength snaps start to grid', () => {
    const note = makeNote({ startBeat: 0.3 });
    const result = quantizeNote(note, { ...defaultOptions, strength: 100 });
    expect(result.startBeat).toBe(0.5);
  });

  it('50% strength moves halfway to grid', () => {
    const note = makeNote({ startBeat: 0.3 });
    const result = quantizeNote(note, { ...defaultOptions, strength: 50 });
    // target = 0.5, distance = 0.2, half = 0.1 → 0.4
    expect(result.startBeat).toBeCloseTo(0.4);
  });

  it('0% strength does not move note', () => {
    const note = makeNote({ startBeat: 0.3 });
    const result = quantizeNote(note, { ...defaultOptions, strength: 0 });
    expect(result.startBeat).toBe(0.3);
  });

  it('preserves duration in start scope', () => {
    const note = makeNote({ startBeat: 0.3, durationBeats: 0.7 });
    const result = quantizeNote(note, { ...defaultOptions, scope: 'start' });
    expect(result.durationBeats).toBe(0.7);
  });

  it('preserves duration in preserveDuration scope', () => {
    const note = makeNote({ startBeat: 0.3, durationBeats: 0.7 });
    const result = quantizeNote(note, { ...defaultOptions, scope: 'preserveDuration' });
    expect(result.durationBeats).toBe(0.7);
    expect(result.startBeat).toBe(0.5); // snapped
  });

  it('quantizes both start and end in startEnd scope', () => {
    const note = makeNote({ startBeat: 0.3, durationBeats: 0.6 });
    // start → 0.5, end 0.9 → 1.0, duration = 0.5
    const result = quantizeNote(note, { ...defaultOptions, scope: 'startEnd' });
    expect(result.startBeat).toBe(0.5);
    expect(result.durationBeats).toBeCloseTo(0.5);
  });

  it('enforces minimum duration in startEnd scope', () => {
    // Note where start and end snap to same grid line
    const note = makeNote({ startBeat: 0.45, durationBeats: 0.1 });
    // start → 0.5, end 0.55 → 0.5, would be 0 duration
    const result = quantizeNote(note, { ...defaultOptions, scope: 'startEnd' });
    expect(result.durationBeats).toBeGreaterThan(0);
  });

  it('does not mutate original note', () => {
    const note = makeNote({ startBeat: 0.3 });
    const original = { ...note };
    quantizeNote(note, defaultOptions);
    expect(note).toEqual(original);
  });

  it('handles gridBeats <= 0 gracefully', () => {
    const note = makeNote({ startBeat: 0.3 });
    const result = quantizeNote(note, { ...defaultOptions, gridBeats: 0 });
    expect(result).toEqual(note);
  });

  it('applies swing with partial strength', () => {
    const note = makeNote({ startBeat: 0.45 });
    const result = quantizeNote(note, {
      gridBeats: 0.5,
      strength: 100,
      swing: 100,
      scope: 'start',
    });
    // nearest grid is index 1 (0.5), swing shifts to 0.75
    expect(result.startBeat).toBeCloseTo(0.75);
  });
});

describe('quantizeNotes', () => {
  it('only quantizes notes in the noteIds set', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0.3 }),
      makeNote({ id: 'b', startBeat: 0.7 }),
    ];
    const result = quantizeNotes(notes, new Set(['a']), defaultOptions);
    expect(result[0].startBeat).toBe(0.5); // quantized
    expect(result[1].startBeat).toBe(0.7); // untouched
  });

  it('returns new array (no mutation)', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0.3 })];
    const result = quantizeNotes(notes, new Set(['a']), defaultOptions);
    expect(result).not.toBe(notes);
    expect(result[0]).not.toBe(notes[0]);
  });

  it('handles empty noteIds set', () => {
    const notes = [makeNote({ id: 'a', startBeat: 0.3 })];
    const result = quantizeNotes(notes, new Set(), defaultOptions);
    expect(result[0].startBeat).toBe(0.3);
  });
});

describe('quantize preview (real-time computation)', () => {
  it('computes preview positions without mutating original notes', () => {
    const notes = [
      makeNote({ id: 'a', startBeat: 0.3, durationBeats: 0.6 }),
      makeNote({ id: 'b', startBeat: 1.7, durationBeats: 0.4 }),
    ];
    const originals = notes.map((n) => ({ ...n }));
    const noteIds = new Set(['a', 'b']);

    const options: QuantizeOptions = { gridBeats: 0.5, strength: 50, swing: 0, scope: 'start' };

    // Simulate what the dialog does: compute quantized positions per-note
    const preview: Record<string, { startBeat: number; durationBeats: number }> = {};
    for (const note of notes) {
      if (noteIds.has(note.id)) {
        const q = quantizeNote(note, options);
        preview[note.id] = { startBeat: q.startBeat, durationBeats: q.durationBeats };
      }
    }

    // Preview positions should be different from originals at 50% strength
    expect(preview['a'].startBeat).toBeCloseTo(0.4); // 0.3 + (0.5 - 0.3) * 0.5
    expect(preview['b'].startBeat).toBeCloseTo(1.6); // 1.7 + (1.5 - 1.7) * 0.5

    // Original notes must be untouched
    expect(notes).toEqual(originals);
  });

  it('preview with 0% strength returns original positions', () => {
    const note = makeNote({ id: 'a', startBeat: 0.37, durationBeats: 0.8 });
    const q = quantizeNote(note, { gridBeats: 0.5, strength: 0, swing: 0, scope: 'start' });
    expect(q.startBeat).toBe(0.37);
    expect(q.durationBeats).toBe(0.8);
  });

  it('preview with different grid sizes produces different results', () => {
    const note = makeNote({ startBeat: 0.3 });

    const q8 = quantizeNote(note, { gridBeats: 0.5, strength: 100, swing: 0, scope: 'start' });
    const q16 = quantizeNote(note, { gridBeats: 0.25, strength: 100, swing: 0, scope: 'start' });

    expect(q8.startBeat).toBe(0.5);  // 1/8 grid: nearest is 0.5
    expect(q16.startBeat).toBe(0.25); // 1/16 grid: nearest is 0.25
  });

  it('preview with swing on startEnd scope quantizes both endpoints', () => {
    const note = makeNote({ startBeat: 0.45, durationBeats: 0.55 });
    const q = quantizeNote(note, { gridBeats: 0.5, strength: 100, swing: 50, scope: 'startEnd' });

    // Start snaps to grid index 1 (0.5), odd → swing: 0.5 + 0.5*0.5*0.25 = 0.625
    expect(q.startBeat).toBeCloseTo(0.625);
    // End (1.0) snaps to grid index 2 (even), no swing → 1.0
    expect(q.startBeat + q.durationBeats).toBeCloseTo(1.0);
  });
});

import { describe, it, expect } from 'vitest';
import { A4_FREQUENCY, MIDI_A4, frequencyToMidi, midiToFrequency } from '../pitch';

describe('midiToFrequency', () => {
  it('returns A4_FREQUENCY exactly for MIDI_A4', () => {
    expect(midiToFrequency(MIDI_A4)).toBe(A4_FREQUENCY);
  });

  it('returns ~261.63 Hz for middle C (MIDI 60)', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it('doubles frequency one octave up', () => {
    const c4 = midiToFrequency(60);
    const c5 = midiToFrequency(72);
    expect(c5).toBeCloseTo(c4 * 2, 4);
  });

  it('halves frequency one octave down', () => {
    const c4 = midiToFrequency(60);
    const c3 = midiToFrequency(48);
    expect(c3).toBeCloseTo(c4 / 2, 4);
  });

  it('handles fractional MIDI values (pitch bend / micro-tone)', () => {
    // MIDI 69.5 is a quarter-tone above A4 — ratio 2^(1/24) ≈ 1.0293
    const quarterToneUp = midiToFrequency(69.5);
    expect(quarterToneUp / A4_FREQUENCY).toBeCloseTo(Math.pow(2, 1 / 24), 6);
  });

  it('covers the MIDI range 0..127 without overflow', () => {
    const low = midiToFrequency(0);
    const high = midiToFrequency(127);
    expect(low).toBeCloseTo(8.176, 2);
    expect(high).toBeCloseTo(12543.85, 1);
  });

  it('returns NaN for NaN input', () => {
    expect(midiToFrequency(NaN)).toBeNaN();
  });

  it('returns 0 for -Infinity (no audible pitch)', () => {
    // Codex P3 regression (PR #1723): the docstring documents
    // this behavior; pin it in a test so a future cleanup can't
    // silently change it.
    expect(midiToFrequency(-Infinity)).toBe(0);
  });

  it('returns +Infinity for +Infinity input', () => {
    // Mathematical consequence of `2^(Infinity/12)` — documented
    // for completeness; callers shouldn't pass this.
    expect(midiToFrequency(Infinity)).toBe(Infinity);
  });
});

describe('frequencyToMidi', () => {
  it('returns MIDI_A4 exactly for A4_FREQUENCY', () => {
    expect(frequencyToMidi(A4_FREQUENCY)).toBe(MIDI_A4);
  });

  it('returns NaN for zero / negative / infinite Hz', () => {
    expect(frequencyToMidi(0)).toBeNaN();
    expect(frequencyToMidi(-100)).toBeNaN();
    expect(frequencyToMidi(Infinity)).toBeNaN();
  });

  it('round-trips midiToFrequency for integer MIDI notes', () => {
    for (const midi of [0, 21, 60, 69, 88, 108, 127]) {
      const hz = midiToFrequency(midi);
      const back = frequencyToMidi(hz);
      expect(back).toBeCloseTo(midi, 6);
    }
  });
});

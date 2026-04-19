/**
 * MIDI pitch / frequency conversion helpers.
 *
 * Pulled out of the Tone.js dependency surface so call sites that just
 * need a MIDI → Hz translation (synth triggers, pitch calculations,
 * etc.) don't drag in the whole Tone library. Pure math — zero
 * external dependencies.
 *
 * The formula is the standard 12-TET equal-temperament mapping:
 *
 *     f(midi) = 440 · 2^((midi - 69) / 12)
 *
 * where MIDI 69 is A4 (440 Hz). MIDI 0 is C-1 (~8.176 Hz), MIDI 127
 * is G9 (~12543 Hz).
 */

/** Standard tuning reference — A4 = 440 Hz at MIDI note 69. */
export const MIDI_A4 = 69;
/** Tuning reference frequency in Hz. */
export const A4_FREQUENCY = 440;

/**
 * Convert a MIDI note number to its frequency in Hz.
 *
 * Accepts fractional MIDI values (for micro-tonal / pitch-bend
 * calculations) — the formula is continuous.
 *
 * Returns `NaN` for `NaN` input (matches the pure-math expectation);
 * returns `0` for `-Infinity` (no audible pitch).
 */
export function midiToFrequency(midiNote: number): number {
  if (Number.isNaN(midiNote)) return NaN;
  return A4_FREQUENCY * Math.pow(2, (midiNote - MIDI_A4) / 12);
}

/**
 * Inverse of [`midiToFrequency`] — convert a frequency in Hz back to
 * a (possibly-fractional) MIDI note number. Mostly useful for
 * pitch-detection / audio-analysis code.
 */
export function frequencyToMidi(hz: number): number {
  if (hz <= 0 || !Number.isFinite(hz)) return NaN;
  return MIDI_A4 + 12 * Math.log2(hz / A4_FREQUENCY);
}

/**
 * Convert a MIDI note number to its scientific pitch name
 * (e.g. 60 → "C4", 61 → "C#4", 69 → "A4"). MIDI 0 maps to "C-1".
 *
 * Bridges into APIs that take note names instead of MIDI numbers
 * (e.g. NativeSynths' `triggerAttackRelease`). Non-integer inputs are
 * rounded with `Math.round`; values outside the MIDI range are clamped
 * to [0, 127] so callers never produce malformed note strings.
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midiNote: number): string {
  const m = Math.max(0, Math.min(127, Math.round(midiNote)));
  const name = NOTE_NAMES[m % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

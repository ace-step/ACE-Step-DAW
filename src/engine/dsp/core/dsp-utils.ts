/**
 * Core DSP utility functions — zero dependencies, AudioWorklet-safe.
 *
 * All functions are pure and allocation-free in hot paths.
 * Part of Phase 2: Core DSP Library (#1123).
 */

// ---------------------------------------------------------------------------
// dB ↔ gain conversion
// ---------------------------------------------------------------------------

const LOG10_20 = 20 / Math.LN10;
const LN10_OVER_20 = Math.LN10 / 20;

/** Convert a linear gain value to decibels. Returns -Infinity for gain ≤ 0. */
export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return LOG10_20 * Math.log(gain);
}

/** Convert decibels to a linear gain value. */
export function dbToGain(db: number): number {
  return Math.exp(db * LN10_OVER_20);
}

// ---------------------------------------------------------------------------
// MIDI note ↔ frequency conversion
// ---------------------------------------------------------------------------

/** Convert a MIDI note number to frequency in Hz. A4 (note 69) = 440 Hz. */
export function noteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Convert a frequency in Hz to the nearest MIDI note number. */
export function freqToNote(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/** Linear interpolation between a and b by fraction t ∈ [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cubic Hermite interpolation for 4 samples and fractional position t. */
export function cubicInterpolate(
  y0: number,
  y1: number,
  y2: number,
  y3: number,
  t: number,
): number {
  const a0 = y3 - y2 - y0 + y1;
  const a1 = y0 - y1 - a0;
  const a2 = y2 - y0;
  const a3 = y1;
  return ((a0 * t + a1) * t + a2) * t + a3;
}

// ---------------------------------------------------------------------------
// Panning
// ---------------------------------------------------------------------------

/**
 * Constant-power stereo panning.
 * @param pan  -1 (hard left) to +1 (hard right)
 * @returns [leftGain, rightGain] with constant total power
 */
export function panToGains(pan: number): [number, number] {
  const p = (pan + 1) * 0.5; // 0..1
  const angle = p * Math.PI * 0.5;
  return [Math.cos(angle), Math.sin(angle)];
}

// ---------------------------------------------------------------------------
// RMS
// ---------------------------------------------------------------------------

/**
 * Compute RMS of a block of samples.
 * @param buf   Sample buffer
 * @param from  Start index (inclusive)
 * @param to    End index (exclusive)
 */
export function rms(buf: Float32Array, from: number, to: number): number {
  let sum = 0;
  const len = to - from;
  if (len <= 0) return 0;
  for (let i = from; i < to; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / len);
}

// ---------------------------------------------------------------------------
// Anti-denormal
// ---------------------------------------------------------------------------

/**
 * Anti-denormal constant. Add to feedback loops:
 *   sample = sample + ANTI_DENORMAL - ANTI_DENORMAL;
 * This flushes denormals without affecting the signal.
 */
export const ANTI_DENORMAL = 1e-18;

/**
 * Flush denormal numbers to zero.
 * Useful for processors that don't use the add/sub trick.
 */
export function flushDenormal(value: number): number {
  return Math.abs(value) < 1e-15 ? 0 : value;
}

// ---------------------------------------------------------------------------
// Clamp
// ---------------------------------------------------------------------------

/** Clamp a value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ---------------------------------------------------------------------------
// Smoothing (one-pole filter for parameter interpolation)
// ---------------------------------------------------------------------------

/**
 * Compute the coefficient for a one-pole smoother.
 * @param timeMs  Smoothing time in milliseconds
 * @param sr      Sample rate
 */
export function smoothCoeff(timeMs: number, sr: number): number {
  if (timeMs <= 0) return 0;
  return Math.exp(-1 / (timeMs * 0.001 * sr));
}

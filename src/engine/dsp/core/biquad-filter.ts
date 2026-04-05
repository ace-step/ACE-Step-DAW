/**
 * Biquad filter — zero-dependency, AudioWorklet-safe.
 *
 * Implements Direct Form II Transposed for better numerical properties.
 * Supports 7 standard filter types via coefficient calculation from
 * Robert Bristow-Johnson's Audio EQ Cookbook.
 *
 * Design: pre-allocated state, block-based processing, no allocations in process().
 * Part of Phase 2: Core DSP Library (#1123).
 */

import { ANTI_DENORMAL } from './dsp-utils';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export type BiquadType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'allpass'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf';

// ---------------------------------------------------------------------------
// Coefficient calculator
// ---------------------------------------------------------------------------

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Calculate biquad filter coefficients using the RBJ cookbook formulas.
 * @param type       Filter type
 * @param freq       Center/cutoff frequency in Hz
 * @param q          Q factor (resonance)
 * @param gainDb     Gain in dB (only used by peaking/shelf types)
 * @param sampleRate Sample rate in Hz
 */
export function calcBiquadCoeffs(
  type: BiquadType,
  freq: number,
  q: number,
  gainDb: number,
  sampleRate: number,
): BiquadCoefficients {
  const nyquist = sampleRate / 2;
  const safeFreq = Math.max(1, Math.min(freq, nyquist - 1));
  const safeQ = Math.max(0.001, q);

  const w0 = (2 * Math.PI * safeFreq) / sampleRate;
  const cos_w0 = Math.cos(w0);
  const sin_w0 = Math.sin(w0);
  const alpha = sin_w0 / (2 * safeQ);

  let b0: number, b1: number, b2: number;
  let a0: number, a1: number, a2: number;

  switch (type) {
    case 'lowpass':
      b1 = 1 - cos_w0;
      b0 = b1 / 2;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos_w0;
      a2 = 1 - alpha;
      break;

    case 'highpass':
      b1 = -(1 + cos_w0);
      b0 = (1 + cos_w0) / 2;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos_w0;
      a2 = 1 - alpha;
      break;

    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos_w0;
      a2 = 1 - alpha;
      break;

    case 'notch':
      b0 = 1;
      b1 = -2 * cos_w0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos_w0;
      a2 = 1 - alpha;
      break;

    case 'allpass':
      b0 = 1 - alpha;
      b1 = -2 * cos_w0;
      b2 = 1 + alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos_w0;
      a2 = 1 - alpha;
      break;

    case 'peaking': {
      const A = Math.pow(10, gainDb / 40);
      const alphaA = alpha * A;
      const alphaOverA = alpha / A;
      b0 = 1 + alphaA;
      b1 = -2 * cos_w0;
      b2 = 1 - alphaA;
      a0 = 1 + alphaOverA;
      a1 = -2 * cos_w0;
      a2 = 1 - alphaOverA;
      break;
    }

    case 'lowshelf': {
      const A = Math.pow(10, gainDb / 40);
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos_w0 + twoSqrtAAlpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cos_w0);
      b2 = A * (A + 1 - (A - 1) * cos_w0 - twoSqrtAAlpha);
      a0 = A + 1 + (A - 1) * cos_w0 + twoSqrtAAlpha;
      a1 = -2 * (A - 1 + (A + 1) * cos_w0);
      a2 = A + 1 + (A - 1) * cos_w0 - twoSqrtAAlpha;
      break;
    }

    case 'highshelf': {
      const A = Math.pow(10, gainDb / 40);
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos_w0 + twoSqrtAAlpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cos_w0);
      b2 = A * (A + 1 + (A - 1) * cos_w0 - twoSqrtAAlpha);
      a0 = A + 1 - (A - 1) * cos_w0 + twoSqrtAAlpha;
      a1 = 2 * (A - 1 - (A + 1) * cos_w0);
      a2 = A + 1 - (A - 1) * cos_w0 - twoSqrtAAlpha;
      break;
    }
  }

  // Normalize by a0
  const inv_a0 = 1 / a0;
  return {
    b0: b0 * inv_a0,
    b1: b1 * inv_a0,
    b2: b2 * inv_a0,
    a1: a1 * inv_a0,
    a2: a2 * inv_a0,
  };
}

// ---------------------------------------------------------------------------
// Single biquad stage (Direct Form II Transposed)
// ---------------------------------------------------------------------------

export class BiquadProcessor {
  /** Filter coefficients (public for modulation). */
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;

  /** State registers (DFII-T). */
  private _z1 = 0;
  private _z2 = 0;

  /**
   * Set coefficients from a BiquadCoefficients object.
   */
  setCoeffs(c: BiquadCoefficients): void {
    this.b0 = c.b0;
    this.b1 = c.b1;
    this.b2 = c.b2;
    this.a1 = c.a1;
    this.a2 = c.a2;
  }

  /**
   * Process a block of samples in-place.
   * @param buf   Sample buffer (modified in-place)
   * @param from  Start index (inclusive)
   * @param to    End index (exclusive)
   */
  process(buf: Float32Array, from: number, to: number): void {
    let z1 = this._z1;
    let z2 = this._z2;
    const { b0, b1, b2, a1, a2 } = this;

    for (let i = from; i < to; i++) {
      const x = buf[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2 + ANTI_DENORMAL;
      z2 = b2 * x - a2 * y;
      buf[i] = y;
    }

    this._z1 = z1 - ANTI_DENORMAL;
    this._z2 = z2;
  }

  /** Process a single sample (for modulated filters). */
  tick(x: number): number {
    const y = this.b0 * x + this._z1;
    const z1 = this.b1 * x - this.a1 * y + this._z2 + ANTI_DENORMAL;
    this._z2 = this.b2 * x - this.a2 * y;
    this._z1 = z1 - ANTI_DENORMAL;
    return y;
  }

  /** Reset internal state. */
  reset(): void {
    this._z1 = 0;
    this._z2 = 0;
  }
}

// ---------------------------------------------------------------------------
// Cascaded biquad stack (for steeper slopes: 12, 24, 36, 48 dB/oct)
// ---------------------------------------------------------------------------

export class BiquadStack {
  private readonly _stages: BiquadProcessor[];

  constructor(stageCount: number) {
    this._stages = [];
    for (let i = 0; i < stageCount; i++) {
      this._stages.push(new BiquadProcessor());
    }
  }

  get stageCount(): number {
    return this._stages.length;
  }

  /** Get a specific stage for individual coefficient setting. */
  stage(index: number): BiquadProcessor {
    return this._stages[index];
  }

  /** Set the same coefficients on all stages. */
  setAllCoeffs(c: BiquadCoefficients): void {
    for (const s of this._stages) {
      s.setCoeffs(c);
    }
  }

  /** Process a block through all stages in series. */
  process(buf: Float32Array, from: number, to: number): void {
    for (const s of this._stages) {
      s.process(buf, from, to);
    }
  }

  /** Reset all stages. */
  reset(): void {
    for (const s of this._stages) {
      s.reset();
    }
  }
}

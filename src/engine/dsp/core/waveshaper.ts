/**
 * Waveshaper / Distortion — zero-dependency, AudioWorklet-safe.
 *
 * Soft/hard clipping, tube saturation, oversampling, bit crushing.
 * Block-based processing.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

import { clamp } from './dsp-utils';

export type WaveshaperMode = 'soft' | 'hard' | 'tube' | 'fuzz';

// ---------------------------------------------------------------------------
// Shaping functions (stateless)
// ---------------------------------------------------------------------------

/** Soft clip using tanh. drive ∈ [1, ∞). */
function softClip(x: number, drive: number): number {
  return Math.tanh(x * drive);
}

/** Hard clip to [-1, 1]. */
function hardClip(x: number, drive: number): number {
  return clamp(x * drive, -1, 1);
}

/** Tube-style asymmetric saturation. */
function tubeClip(x: number, drive: number): number {
  const input = x * drive;
  if (input >= 0) {
    return 1 - Math.exp(-input);
  }
  return -1 + Math.exp(input);
}

/** Fuzz (extreme asymmetric clipping). */
function fuzzClip(x: number, drive: number): number {
  const input = x * drive;
  const sign = input >= 0 ? 1 : -1;
  const abs = Math.abs(input);
  if (abs < 1) {
    return sign * (2 * abs - abs * abs);
  }
  return sign;
}

// ---------------------------------------------------------------------------
// Oversampling (2x) for alias reduction
// ---------------------------------------------------------------------------

/**
 * Simple 2x oversampler using linear interpolation up / averaging down.
 * Not audiophile grade but good enough for real-time use.
 */
class Oversampler2x {
  private readonly _upBuf: Float32Array;
  private _prevSample = 0;

  constructor(maxBlockSize: number) {
    this._upBuf = new Float32Array(maxBlockSize * 2);
  }

  /**
   * Process a block through a shaping function at 2x sample rate.
   * Handles blocks larger than maxBlockSize by processing in chunks.
   */
  process(
    buf: Float32Array,
    from: number,
    to: number,
    shapeFn: (x: number, drive: number) => number,
    drive: number,
  ): void {
    const up = this._upBuf;
    const maxChunkSize = up.length >> 1;
    if (maxChunkSize <= 0 || to <= from) return;

    let prev = this._prevSample;
    let offset = from;

    while (offset < to) {
      const len = Math.min(to - offset, maxChunkSize);

      // Upsample 2x with linear interpolation
      for (let i = 0; i < len; i++) {
        const cur = buf[offset + i];
        up[i * 2] = (prev + cur) * 0.5;
        up[i * 2 + 1] = cur;
        prev = cur;
      }

      // Apply shaping at 2x rate
      const upLen = len * 2;
      for (let i = 0; i < upLen; i++) {
        up[i] = shapeFn(up[i], drive);
      }

      // Downsample 2x by averaging pairs
      for (let i = 0; i < len; i++) {
        buf[offset + i] = (up[i * 2] + up[i * 2 + 1]) * 0.5;
      }

      offset += len;
    }

    this._prevSample = prev;
  }

  reset(): void {
    this._upBuf.fill(0);
    this._prevSample = 0;
  }
}

// ---------------------------------------------------------------------------
// Waveshaper processor
// ---------------------------------------------------------------------------

export class Waveshaper {
  mode: WaveshaperMode = 'soft';
  drive = 1;    // [1, ∞)
  mix = 1;      // dry/wet [0, 1]
  oversample = false;

  private _oversampler: Oversampler2x;
  /** Pre-allocated dry buffer for mix blending (no allocations in process). */
  private readonly _dryBuf: Float32Array;

  constructor(maxBlockSize = 512) {
    this._oversampler = new Oversampler2x(maxBlockSize);
    this._dryBuf = new Float32Array(maxBlockSize);
  }

  /**
   * Process a block in-place.
   */
  process(buf: Float32Array, from: number, to: number): void {
    const shapeFn = this._getShapeFn();

    if (this.oversample) {
      if (this.mix < 1) {
        // Save dry signal using pre-allocated buffer
        const len = to - from;
        const dry = this._dryBuf;
        for (let i = 0; i < len; i++) dry[i] = buf[from + i];
        this._oversampler.process(buf, from, to, shapeFn, this.drive);
        const mix = this.mix;
        for (let i = 0; i < len; i++) {
          buf[from + i] = dry[i] * (1 - mix) + buf[from + i] * mix;
        }
      } else {
        this._oversampler.process(buf, from, to, shapeFn, this.drive);
      }
      return;
    }

    // No oversampling
    const drive = this.drive;
    const mix = this.mix;
    for (let i = from; i < to; i++) {
      const dry = buf[i];
      const wet = shapeFn(dry, drive);
      buf[i] = dry * (1 - mix) + wet * mix;
    }
  }

  private _getShapeFn(): (x: number, drive: number) => number {
    switch (this.mode) {
      case 'soft': return softClip;
      case 'hard': return hardClip;
      case 'tube': return tubeClip;
      case 'fuzz': return fuzzClip;
    }
  }

  reset(): void {
    this._oversampler.reset();
  }
}

// ---------------------------------------------------------------------------
// Bit crusher
// ---------------------------------------------------------------------------

export class BitCrusher {
  bits = 8;          // [1, 24]
  downSample = 1;    // [1, 32] — hold every Nth sample

  private _holdCounter = 0;
  private _holdValue = 0;

  /**
   * Process a block in-place.
   */
  process(buf: Float32Array, from: number, to: number): void {
    const levels = Math.pow(2, this.bits);
    const halfLevels = levels / 2;
    const ds = Math.max(1, Math.round(this.downSample));
    let counter = this._holdCounter;
    let hold = this._holdValue;

    for (let i = from; i < to; i++) {
      if (counter === 0) {
        // Quantize
        hold = Math.round(buf[i] * halfLevels) / halfLevels;
      }
      buf[i] = hold;
      counter = (counter + 1) % ds;
    }

    this._holdCounter = counter;
    this._holdValue = hold;
  }

  reset(): void {
    this._holdCounter = 0;
    this._holdValue = 0;
  }
}

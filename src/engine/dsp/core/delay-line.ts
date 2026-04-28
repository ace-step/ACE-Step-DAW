/**
 * Delay line — zero-dependency, AudioWorklet-safe.
 *
 * Circular buffer with integer and cubic-interpolated reads.
 * Pre-allocated, power-of-2 capacity, bitwise masking.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

import { cubicInterpolate } from './dsp-utils';

/** Round up to next power of 2. */
function nextPow2(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

export class DelayLine {
  private readonly _buf: Float32Array;
  private readonly _mask: number;
  private _writePos = 0;
  readonly capacity: number;

  /**
   * @param maxDelaySamples  Maximum delay in samples. Rounded up to power of 2.
   */
  constructor(maxDelaySamples: number) {
    this.capacity = nextPow2(Math.max(4, maxDelaySamples + 1));
    this._buf = new Float32Array(this.capacity);
    this._mask = this.capacity - 1;
  }

  /** Push one sample into the delay line. */
  push(sample: number): void {
    this._buf[this._writePos & this._mask] = sample;
    this._writePos++;
  }

  /** Read a sample at an integer delay (in samples). 0 = most recent. */
  readInt(delaySamples: number): number {
    return this._buf[(this._writePos - 1 - delaySamples) & this._mask];
  }

  /**
   * Read a sample at a fractional delay using cubic interpolation.
   * @param delaySamples  Delay in samples (can be fractional)
   */
  readCubic(delaySamples: number): number {
    const d = Math.max(1, delaySamples);
    const intPart = Math.floor(d);
    const frac = d - intPart;

    const wp = this._writePos - 1;
    const mask = this._mask;
    const y0 = this._buf[(wp - intPart + 1) & mask];
    const y1 = this._buf[(wp - intPart) & mask];
    const y2 = this._buf[(wp - intPart - 1) & mask];
    const y3 = this._buf[(wp - intPart - 2) & mask];

    return cubicInterpolate(y0, y1, y2, y3, frac);
  }

  /** Read with linear interpolation. */
  readLinear(delaySamples: number): number {
    const d = Math.max(0, delaySamples);
    const intPart = Math.floor(d);
    const frac = d - intPart;

    const wp = this._writePos - 1;
    const mask = this._mask;
    const s0 = this._buf[(wp - intPart) & mask];
    const s1 = this._buf[(wp - intPart - 1) & mask];

    return s0 + (s1 - s0) * frac;
  }

  /** Clear the delay line. */
  reset(): void {
    this._buf.fill(0);
    this._writePos = 0;
  }

  /**
   * Process a block as a simple delay with feedback.
   * @param input   Input buffer
   * @param output  Output buffer (may be same as input)
   * @param from    Start index
   * @param to      End index
   * @param delaySamples  Delay time in samples
   * @param feedback Feedback amount [0, 1)
   */
  processBlock(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
    delaySamples: number,
    feedback: number,
  ): void {
    for (let i = from; i < to; i++) {
      const delayed = this.readLinear(delaySamples);
      this.push(input[i] + delayed * feedback);
      output[i] = delayed;
    }
  }
}

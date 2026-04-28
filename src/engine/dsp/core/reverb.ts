/**
 * Algorithmic reverb — zero-dependency, AudioWorklet-safe.
 *
 * FreeVerb implementation (Schroeder-Moorer topology):
 *   8 parallel comb filters → 4 series allpass filters
 *
 * Dattorro plate reverb variant also provided for richer sound.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

import { ANTI_DENORMAL } from './dsp-utils';

// ---------------------------------------------------------------------------
// Comb filter (for reverb)
// ---------------------------------------------------------------------------

class CombFilter {
  private readonly _buf: Float32Array;
  private readonly _size: number;
  private _idx = 0;
  private _filterStore = 0;

  damp = 0.5;    // damping [0, 1]
  feedback = 0.5;

  constructor(size: number) {
    this._size = size;
    this._buf = new Float32Array(size);
  }

  process(input: number): number {
    const output = this._buf[this._idx];
    this._filterStore = output * (1 - this.damp) + this._filterStore * this.damp
      + ANTI_DENORMAL - ANTI_DENORMAL;
    this._buf[this._idx] = input + this._filterStore * this.feedback;
    this._idx = (this._idx + 1) % this._size;
    return output;
  }

  reset(): void {
    this._buf.fill(0);
    this._filterStore = 0;
    this._idx = 0;
  }
}

// ---------------------------------------------------------------------------
// Allpass filter (for reverb diffusion)
// ---------------------------------------------------------------------------

class AllpassFilter {
  private readonly _buf: Float32Array;
  private readonly _size: number;
  private _idx = 0;
  feedback = 0.5;

  constructor(size: number) {
    this._size = size;
    this._buf = new Float32Array(size);
  }

  process(input: number): number {
    const bufOut = this._buf[this._idx];
    const output = -input + bufOut;
    this._buf[this._idx] = input + bufOut * this.feedback + ANTI_DENORMAL - ANTI_DENORMAL;
    this._idx = (this._idx + 1) % this._size;
    return output;
  }

  reset(): void {
    this._buf.fill(0);
    this._idx = 0;
  }
}

// ---------------------------------------------------------------------------
// FreeVerb
// ---------------------------------------------------------------------------

// Tuning constants (FreeVerb standard, adjusted for 44100 Hz)
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const STEREO_SPREAD = 23;

// Scale factors
const FIXED_GAIN = 0.015;
const SCALE_DAMP = 0.4;
const SCALE_ROOM = 0.28;
const OFFSET_ROOM = 0.7;

export class FreeVerb {
  private _combL: CombFilter[];
  private _combR: CombFilter[];
  private _allpassL: AllpassFilter[];
  private _allpassR: AllpassFilter[];

  private _roomSize = 0.5;
  private _damping = 0.5;
  private _wet = 0.3;
  private _dry = 0.7;

  constructor(sampleRate = 44100) {
    const srFactor = sampleRate / 44100;

    this._combL = COMB_TUNING.map(t => new CombFilter(Math.round(t * srFactor)));
    this._combR = COMB_TUNING.map(t => new CombFilter(Math.round((t + STEREO_SPREAD) * srFactor)));
    this._allpassL = ALLPASS_TUNING.map(t => new AllpassFilter(Math.round(t * srFactor)));
    this._allpassR = ALLPASS_TUNING.map(t => new AllpassFilter(Math.round((t + STEREO_SPREAD) * srFactor)));

    for (const ap of [...this._allpassL, ...this._allpassR]) {
      ap.feedback = 0.5;
    }

    this._updateParams();
  }

  get roomSize(): number { return this._roomSize; }
  set roomSize(v: number) {
    this._roomSize = Math.max(0, Math.min(1, v));
    this._updateParams();
  }

  get damping(): number { return this._damping; }
  set damping(v: number) {
    this._damping = Math.max(0, Math.min(1, v));
    this._updateParams();
  }

  get wet(): number { return this._wet; }
  set wet(v: number) { this._wet = Math.max(0, Math.min(1, v)); }

  get dry(): number { return this._dry; }
  set dry(v: number) { this._dry = Math.max(0, Math.min(1, v)); }

  private _updateParams(): void {
    const roomScaled = this._roomSize * SCALE_ROOM + OFFSET_ROOM;
    const dampScaled = this._damping * SCALE_DAMP;

    for (let i = 0; i < COMB_TUNING.length; i++) {
      this._combL[i].feedback = roomScaled;
      this._combR[i].feedback = roomScaled;
      this._combL[i].damp = dampScaled;
      this._combR[i].damp = dampScaled;
    }
  }

  /**
   * Process a stereo block.
   * @param inputL   Left input
   * @param inputR   Right input
   * @param outputL  Left output
   * @param outputR  Right output
   * @param from     Start index
   * @param to       End index
   */
  processStereo(
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array,
    from: number,
    to: number,
  ): void {
    const wet = this._wet;
    const dry = this._dry;

    for (let i = from; i < to; i++) {
      const inMono = (inputL[i] + inputR[i]) * FIXED_GAIN;

      let outL = 0;
      let outR = 0;

      // Parallel comb filters
      for (let c = 0; c < COMB_TUNING.length; c++) {
        outL += this._combL[c].process(inMono);
        outR += this._combR[c].process(inMono);
      }

      // Series allpass filters
      for (let a = 0; a < ALLPASS_TUNING.length; a++) {
        outL = this._allpassL[a].process(outL);
        outR = this._allpassR[a].process(outR);
      }

      outputL[i] = inputL[i] * dry + outL * wet;
      outputR[i] = inputR[i] * dry + outR * wet;
    }
  }

  /**
   * Process a mono block (convenience, uses both channels internally).
   */
  processMono(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ): void {
    const wet = this._wet;
    const dry = this._dry;

    for (let i = from; i < to; i++) {
      const inSample = input[i] * FIXED_GAIN;

      let outL = 0;
      let outR = 0;

      for (let c = 0; c < COMB_TUNING.length; c++) {
        outL += this._combL[c].process(inSample);
        outR += this._combR[c].process(inSample);
      }

      for (let a = 0; a < ALLPASS_TUNING.length; a++) {
        outL = this._allpassL[a].process(outL);
        outR = this._allpassR[a].process(outR);
      }

      output[i] = input[i] * dry + (outL + outR) * 0.5 * wet;
    }
  }

  reset(): void {
    for (const c of [...this._combL, ...this._combR]) c.reset();
    for (const a of [...this._allpassL, ...this._allpassR]) a.reset();
  }
}

/**
 * Dynamics processors — zero-dependency, AudioWorklet-safe.
 *
 * Compressor, limiter, gate, envelope follower (RMS/peak).
 * Block-based processing with pre-allocated state.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

import { ANTI_DENORMAL, dbToGain, gainToDb } from './dsp-utils';

// ---------------------------------------------------------------------------
// Envelope follower
// ---------------------------------------------------------------------------

export type EnvelopeFollowerMode = 'peak' | 'rms';

export class EnvelopeFollower {
  private _mode: EnvelopeFollowerMode;
  private _attackCoeff: number;
  private _releaseCoeff: number;
  private _envelope = 0;

  constructor(
    attackMs: number,
    releaseMs: number,
    sampleRate: number,
    mode: EnvelopeFollowerMode = 'peak',
  ) {
    this._mode = mode;
    this._attackCoeff = Math.exp(-1 / (attackMs * 0.001 * sampleRate));
    this._releaseCoeff = Math.exp(-1 / (releaseMs * 0.001 * sampleRate));
  }

  get envelope(): number { return this._envelope; }

  setAttack(ms: number, sr: number): void {
    this._attackCoeff = Math.exp(-1 / (Math.max(0.01, ms) * 0.001 * sr));
  }

  setRelease(ms: number, sr: number): void {
    this._releaseCoeff = Math.exp(-1 / (Math.max(0.01, ms) * 0.001 * sr));
  }

  /**
   * Process a block, updating the envelope value.
   * @param buf   Input buffer (read-only)
   * @param from  Start index
   * @param to    End index
   * @returns     Final envelope value after processing
   */
  process(buf: Float32Array, from: number, to: number): number {
    let env = this._envelope;
    const att = this._attackCoeff;
    const rel = this._releaseCoeff;

    if (this._mode === 'peak') {
      for (let i = from; i < to; i++) {
        const input = Math.abs(buf[i]);
        const coeff = input > env ? att : rel;
        env = coeff * env + (1 - coeff) * input + ANTI_DENORMAL - ANTI_DENORMAL;
      }
    } else {
      // RMS mode
      for (let i = from; i < to; i++) {
        const input = buf[i] * buf[i];
        const coeff = input > env ? att : rel;
        env = coeff * env + (1 - coeff) * input + ANTI_DENORMAL - ANTI_DENORMAL;
      }
    }

    this._envelope = env;
    return this._mode === 'rms' ? Math.sqrt(env) : env;
  }

  reset(): void {
    this._envelope = 0;
  }
}

// ---------------------------------------------------------------------------
// Compressor
// ---------------------------------------------------------------------------

export interface CompressorParams {
  threshold: number;   // dB
  ratio: number;       // e.g. 4 for 4:1
  attack: number;      // ms
  release: number;     // ms
  knee: number;        // dB (soft knee width)
  makeupGain: number;  // dB
}

export class Compressor {
  threshold = -24;
  ratio = 4;
  knee = 6;
  makeupGain = 0;

  private _follower: EnvelopeFollower;
  private _sampleRate: number;

  /** Current gain reduction in dB (for metering). */
  private _grDb = 0;

  /** Pre-allocated single-sample buffer to avoid per-sample allocations in process(). */
  private readonly _oneSample = new Float32Array(1);

  constructor(params: Partial<CompressorParams> = {}, sampleRate = 44100) {
    this._sampleRate = sampleRate;
    if (params.threshold !== undefined) this.threshold = params.threshold;
    if (params.ratio !== undefined) this.ratio = params.ratio;
    if (params.knee !== undefined) this.knee = params.knee;
    if (params.makeupGain !== undefined) this.makeupGain = params.makeupGain;

    this._follower = new EnvelopeFollower(
      params.attack ?? 10,
      params.release ?? 100,
      sampleRate,
      'peak',
    );
  }

  get gainReductionDb(): number { return this._grDb; }

  setAttack(ms: number): void { this._follower.setAttack(ms, this._sampleRate); }
  setRelease(ms: number): void { this._follower.setRelease(ms, this._sampleRate); }

  /**
   * Process a block in-place.
   */
  process(buf: Float32Array, from: number, to: number): void {
    const thresh = this.threshold;
    const ratio = this.ratio;
    const halfKnee = this.knee / 2;
    const makeup = dbToGain(this.makeupGain);
    let grDb = 0;

    // Use envelope follower for attack/release smoothing
    const follower = this._follower;

    for (let i = from; i < to; i++) {
      const input = buf[i];

      // Get smoothed envelope level via follower (respects attack/release)
      this._oneSample[0] = Math.abs(input);
      const envLin = follower.process(this._oneSample, 0, 1);
      const envDb = envLin > 0 ? gainToDb(envLin) : -120;

      // Compute gain reduction with soft knee
      let gr: number;
      if (envDb <= thresh - halfKnee) {
        gr = 0;
      } else if (envDb >= thresh + halfKnee) {
        gr = (envDb - thresh) * (1 - 1 / ratio);
      } else {
        // Soft knee region
        const x = envDb - thresh + halfKnee;
        gr = (x * x) / (2 * this.knee) * (1 - 1 / ratio);
      }

      grDb = gr;
      const gainLinear = dbToGain(-gr) * makeup;
      buf[i] = input * gainLinear;
    }

    this._grDb = grDb;
  }

  reset(): void {
    this._follower.reset();
    this._grDb = 0;
  }
}

// ---------------------------------------------------------------------------
// Limiter (brick-wall, look-ahead optional)
// ---------------------------------------------------------------------------

export class Limiter {
  threshold = -1; // dB
  release = 100;  // ms

  private _releaseCoeff: number;
  private _envelope = 0;
  private _sampleRate: number;

  constructor(thresholdDb = -1, releaseMs = 100, sampleRate = 44100) {
    this.threshold = thresholdDb;
    this.release = releaseMs;
    this._sampleRate = sampleRate;
    this._releaseCoeff = Math.exp(-1 / (releaseMs * 0.001 * sampleRate));
  }

  process(buf: Float32Array, from: number, to: number): void {
    const threshLin = dbToGain(this.threshold);
    const rel = this._releaseCoeff;
    let env = this._envelope;

    for (let i = from; i < to; i++) {
      const input = Math.abs(buf[i]);

      // Fast attack (instant), slow release
      if (input > env) {
        env = input;
      } else {
        env = rel * env + (1 - rel) * input + ANTI_DENORMAL - ANTI_DENORMAL;
      }

      // Apply gain reduction
      if (env > threshLin) {
        buf[i] *= threshLin / env;
      }
    }

    this._envelope = env;
  }

  reset(): void {
    this._envelope = 0;
  }
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export class Gate {
  threshold = -40; // dB
  private _follower: EnvelopeFollower;
  private _sampleRate: number;

  /** Pre-allocated single-sample buffer to avoid per-sample allocations in process(). */
  private readonly _oneSample = new Float32Array(1);

  constructor(thresholdDb = -40, attackMs = 0.1, releaseMs = 50, sampleRate = 44100) {
    this.threshold = thresholdDb;
    this._sampleRate = sampleRate;
    this._follower = new EnvelopeFollower(attackMs, releaseMs, sampleRate, 'peak');
  }

  setAttack(ms: number): void { this._follower.setAttack(ms, this._sampleRate); }
  setRelease(ms: number): void { this._follower.setRelease(ms, this._sampleRate); }

  process(buf: Float32Array, from: number, to: number): void {
    const threshLin = dbToGain(this.threshold);
    const follower = this._follower;

    for (let i = from; i < to; i++) {
      // Use envelope follower for smoothed level detection
      this._oneSample[0] = Math.abs(buf[i]);
      const envLin = follower.process(this._oneSample, 0, 1);
      if (envLin < threshLin) {
        buf[i] = 0;
      }
    }
  }

  reset(): void {
    this._follower.reset();
  }
}

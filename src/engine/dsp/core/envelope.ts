/**
 * ADSR Envelope generator — zero-dependency, AudioWorklet-safe.
 *
 * 5-state machine: idle → attack → decay → sustain → release.
 * Supports linear and exponential curves, retrigger.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

export type EnvelopeState = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';
export type EnvelopeCurve = 'linear' | 'exponential';

const MIN_TIME = 0.001; // 1ms minimum for exp curves to avoid division issues

export class ADSREnvelope {
  /** ADSR times in seconds. */
  attack = 0.01;
  decay = 0.1;
  sustain = 0.7;
  release = 0.3;
  curve: EnvelopeCurve = 'exponential';

  private _state: EnvelopeState = 'idle';
  private _value = 0;
  private _sampleRate: number;

  /** Coefficients for exponential curves, computed per-segment. */
  private _coeff = 0;
  private _base = 0;

  /** Sample counter within current segment. */
  private _stageCounter = 0;
  private _stageSamples = 0;

  /** Target value for current segment. */
  private _startValue = 0;
  private _targetValue = 0;

  constructor(sampleRate = 44100) {
    this._sampleRate = sampleRate;
  }

  get state(): EnvelopeState { return this._state; }
  get value(): number { return this._value; }
  get sampleRate(): number { return this._sampleRate; }
  set sampleRate(sr: number) { this._sampleRate = sr; }

  /** Trigger the attack phase. If already playing, retriggers from current value. */
  gate(on: boolean): void {
    if (on) {
      this._startValue = this._value;
      this._targetValue = 1;
      this._state = 'attack';
      this._enterStage('attack');
    } else {
      if (this._state !== 'idle') {
        this._startValue = this._value;
        this._targetValue = 0;
        this._state = 'release';
        this._enterStage('release');
      }
    }
  }

  /** Convenience: trigger attack. */
  triggerAttack(): void { this.gate(true); }

  /** Convenience: trigger release. */
  triggerRelease(): void { this.gate(false); }

  /**
   * Process a block — writes envelope values to output.
   * @param output  Buffer to fill with envelope values
   * @param from    Start index
   * @param to      End index
   */
  process(output: Float32Array, from: number, to: number): void {
    for (let i = from; i < to; i++) {
      output[i] = this._advance();
    }
  }

  /** Advance one sample and return the envelope value. */
  private _advance(): number {
    switch (this._state) {
      case 'idle':
        return this._value;

      case 'attack':
        this._value = this._interpolate();
        this._stageCounter++;
        if (this._stageCounter >= this._stageSamples) {
          this._value = 1;
          this._startValue = 1;
          this._targetValue = this.sustain;
          this._state = 'decay';
          this._enterStage('decay');
        }
        return this._value;

      case 'decay':
        this._value = this._interpolate();
        this._stageCounter++;
        if (this._stageCounter >= this._stageSamples) {
          this._value = this.sustain;
          this._state = 'sustain';
        }
        return this._value;

      case 'sustain':
        this._value = this.sustain;
        return this._value;

      case 'release':
        this._value = this._interpolate();
        this._stageCounter++;
        if (this._stageCounter >= this._stageSamples) {
          this._value = 0;
          this._state = 'idle';
        }
        return this._value;
    }
  }

  private _enterStage(stage: 'attack' | 'decay' | 'release'): void {
    let timeSec: number;
    switch (stage) {
      case 'attack': timeSec = Math.max(MIN_TIME, this.attack); break;
      case 'decay': timeSec = Math.max(MIN_TIME, this.decay); break;
      case 'release': timeSec = Math.max(MIN_TIME, this.release); break;
    }
    this._stageSamples = Math.max(1, Math.round(timeSec * this._sampleRate));
    this._stageCounter = 0;

    if (this.curve === 'exponential') {
      // Compute exponential coefficient
      const range = this._targetValue - this._startValue;
      if (Math.abs(range) < 1e-10) {
        this._coeff = 0;
        this._base = this._targetValue;
      } else {
        this._coeff = Math.exp(-Math.log((Math.abs(range) + 0.001) / 0.001) / this._stageSamples);
        this._base = this._targetValue;
      }
    }
  }

  private _interpolate(): number {
    if (this.curve === 'linear') {
      const t = this._stageCounter / this._stageSamples;
      return this._startValue + (this._targetValue - this._startValue) * t;
    }
    // Exponential
    const range = this._startValue - this._targetValue;
    return this._base + range * Math.pow(this._coeff, this._stageCounter);
  }

  /** Reset to idle state. */
  reset(): void {
    this._state = 'idle';
    this._value = 0;
    this._stageCounter = 0;
    this._stageSamples = 0;
  }
}

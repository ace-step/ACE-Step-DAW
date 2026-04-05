/**
 * LFO (Low Frequency Oscillator) — zero-dependency, AudioWorklet-safe.
 *
 * 5 waveforms, tempo sync, phase offset, unipolar/bipolar modes.
 * Block-based processing, no allocations in process().
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

export type LFOWaveform = 'sine' | 'triangle' | 'saw' | 'square' | 'random';

export class LFO {
  private _phase = 0;
  private _freq: number;
  private _sampleRate: number;
  private _dt: number;
  private _waveform: LFOWaveform;
  private _phaseOffset = 0;
  private _unipolar = false;

  /** Random S&H state. */
  private _randomValue = 0;
  private _prevPhase = 0;

  constructor(
    waveform: LFOWaveform = 'sine',
    frequency = 1,
    sampleRate = 44100,
  ) {
    this._waveform = waveform;
    this._freq = frequency;
    this._sampleRate = sampleRate;
    this._dt = frequency / sampleRate;
  }

  get frequency(): number { return this._freq; }
  set frequency(f: number) {
    this._freq = f;
    this._dt = f / this._sampleRate;
  }

  get waveform(): LFOWaveform { return this._waveform; }
  set waveform(w: LFOWaveform) { this._waveform = w; }

  get phaseOffset(): number { return this._phaseOffset; }
  set phaseOffset(p: number) { this._phaseOffset = p; }

  get unipolar(): boolean { return this._unipolar; }
  set unipolar(u: boolean) { this._unipolar = u; }

  get sampleRate(): number { return this._sampleRate; }
  set sampleRate(sr: number) {
    this._sampleRate = sr;
    this._dt = this._freq / sr;
  }

  /**
   * Set frequency from BPM and note division.
   * @param bpm  Beats per minute
   * @param division  Note division (1 = whole, 4 = quarter, 8 = eighth, etc.)
   */
  syncToBpm(bpm: number, division: number): void {
    this.frequency = (bpm / 60) * (division / 4);
  }

  /**
   * Process a block of LFO values.
   * @param output  Output buffer (written)
   * @param from    Start index
   * @param to      End index
   */
  process(output: Float32Array, from: number, to: number): void {
    const dt = this._dt;
    const offset = this._phaseOffset;
    const uni = this._unipolar;
    let phase = this._phase;
    let prevPhase = this._prevPhase;

    for (let i = from; i < to; i++) {
      let p = (phase + offset) % 1;
      if (p < 0) p += 1; // normalize for negative phaseOffset
      let val: number;

      switch (this._waveform) {
        case 'sine':
          val = Math.sin(2 * Math.PI * p);
          break;

        case 'triangle':
          val = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
          break;

        case 'saw':
          val = 2 * p - 1;
          break;

        case 'square':
          val = p < 0.5 ? 1 : -1;
          break;

        case 'random':
          // Sample & hold: new random value at each cycle start
          if (phase < prevPhase) {
            this._randomValue = Math.random() * 2 - 1;
          }
          val = this._randomValue;
          break;
      }

      if (uni) {
        val = (val + 1) * 0.5;
      }

      output[i] = val;
      prevPhase = phase;
      phase += dt;
      phase -= Math.floor(phase);
    }

    this._phase = phase;
    this._prevPhase = prevPhase;
  }

  /** Pre-allocated single-sample buffer for tick(). */
  private static readonly _tickBuf = new Float32Array(1);

  /** Generate a single sample (allocation-free). */
  tick(): number {
    this.process(LFO._tickBuf, 0, 1);
    return LFO._tickBuf[0];
  }

  /** Reset phase. */
  reset(): void {
    this._phase = 0;
    this._prevPhase = 0;
    this._randomValue = 0;
  }
}

/**
 * Band-limited oscillators — zero-dependency, AudioWorklet-safe.
 *
 * Uses PolyBLEP anti-aliasing for alias-free saw, square, and triangle.
 * Pre-allocated state, block-based processing.
 *
 * Part of Phase 2: Core DSP Library (#1123).
 */

export type OscillatorWaveform = 'sine' | 'saw' | 'square' | 'triangle';

// ---------------------------------------------------------------------------
// PolyBLEP correction
// ---------------------------------------------------------------------------

/**
 * 2nd-order PolyBLEP residual for discontinuity correction.
 * @param t  Phase position relative to discontinuity [0, 1)
 * @param dt Phase increment per sample (freq / sampleRate)
 */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const n = t / dt;
    return n + n - n * n - 1;
  }
  if (t > 1 - dt) {
    const n = (t - 1) / dt;
    return n * n + n + n + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Oscillator
// ---------------------------------------------------------------------------

export class Oscillator {
  private _phase = 0;
  private _freq: number;
  private _sampleRate: number;
  private _waveform: OscillatorWaveform;
  private _dt: number;
  private _pulseWidth = 0.5;

  /** Previous saw value for triangle integration. */
  private _triState = 0;

  constructor(
    waveform: OscillatorWaveform = 'sine',
    frequency = 440,
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

  get waveform(): OscillatorWaveform { return this._waveform; }
  set waveform(w: OscillatorWaveform) { this._waveform = w; }

  get pulseWidth(): number { return this._pulseWidth; }
  set pulseWidth(pw: number) { this._pulseWidth = Math.max(0.01, Math.min(0.99, pw)); }

  get phase(): number { return this._phase; }
  set phase(p: number) { this._phase = p; }

  get sampleRate(): number { return this._sampleRate; }
  set sampleRate(sr: number) {
    this._sampleRate = sr;
    this._dt = this._freq / sr;
  }

  /**
   * Process a block of samples.
   * @param output  Output buffer (written, not mixed)
   * @param from    Start index
   * @param to      End index
   */
  process(output: Float32Array, from: number, to: number): void {
    const waveform = this._waveform;
    const dt = this._dt;
    let phase = this._phase;

    switch (waveform) {
      case 'sine':
        for (let i = from; i < to; i++) {
          output[i] = Math.sin(2 * Math.PI * phase);
          phase += dt;
          phase -= Math.floor(phase);
        }
        break;

      case 'saw':
        for (let i = from; i < to; i++) {
          let val = 2 * phase - 1;
          val -= polyBlep(phase, dt);
          output[i] = val;
          phase += dt;
          phase -= Math.floor(phase);
        }
        break;

      case 'square': {
        const pw = this._pulseWidth;
        for (let i = from; i < to; i++) {
          let val = phase < pw ? 1 : -1;
          val += polyBlep(phase, dt);
          val -= polyBlep((phase - pw + 1) % 1, dt);
          output[i] = val;
          phase += dt;
          phase -= Math.floor(phase);
        }
        break;
      }

      case 'triangle': {
        // Leaky integrator of square wave
        let triState = this._triState;
        const pw = 0.5;
        for (let i = from; i < to; i++) {
          let sq = phase < pw ? 1 : -1;
          sq += polyBlep(phase, dt);
          sq -= polyBlep((phase - pw + 1) % 1, dt);
          // Integrate and leak
          triState = dt * sq + (1 - dt) * triState;
          // Scale to [-1, 1] range (4x because integral of ±1 square = triangle with ½ amplitude)
          output[i] = triState * 4;
          phase += dt;
          phase -= Math.floor(phase);
        }
        this._triState = triState;
        break;
      }
    }

    this._phase = phase;
  }

  /** Pre-allocated single-sample buffer for tick(). */
  private static readonly _tickBuf = new Float32Array(1);

  /** Generate a single sample (allocation-free). */
  tick(): number {
    this.process(Oscillator._tickBuf, 0, 1);
    return Oscillator._tickBuf[0];
  }

  /** Reset phase and state. */
  reset(): void {
    this._phase = 0;
    this._triState = 0;
  }
}

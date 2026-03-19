/**
 * Sidechain compression envelope follower.
 *
 * Pure computation functions (testable without Web Audio) +
 * SidechainFollower class that wires source track → envelope → gain ducking.
 */

/**
 * Compute gain reduction in dB given the source signal level.
 *
 * @param inputDb   - RMS level of the sidechain source in dB
 * @param threshold - Compressor threshold in dB
 * @param ratio     - Compression ratio (e.g. 4 = 4:1)
 * @param knee      - Soft knee width in dB (0 = hard knee)
 * @returns Gain reduction in dB (always >= 0)
 */
export function computeGainReduction(
  inputDb: number,
  threshold: number,
  ratio: number,
  knee: number,
): number {
  if (ratio <= 1) return 0;

  const slope = 1 - 1 / ratio;

  if (knee <= 0) {
    const overshoot = inputDb - threshold;
    if (overshoot <= 0) return 0;
    return overshoot * slope;
  }

  // Soft knee
  const halfKnee = knee / 2;
  const overshoot = inputDb - threshold;

  if (overshoot <= -halfKnee) {
    return 0;
  } else if (overshoot >= halfKnee) {
    return overshoot * slope;
  } else {
    // Quadratic transition in the knee region
    const x = overshoot + halfKnee;
    return (slope * x * x) / (2 * knee);
  }
}

/**
 * One-pole smoothing for gain envelope (attack/release).
 *
 * @param currentGain - Current linear gain value
 * @param targetGain  - Target linear gain value
 * @param attackSec   - Attack time in seconds
 * @param releaseSec  - Release time in seconds
 * @param dt          - Time step in seconds (e.g. 1/60 for 60fps)
 * @returns Smoothed linear gain value
 */
export function smoothGain(
  currentGain: number,
  targetGain: number,
  attackSec: number,
  releaseSec: number,
  dt: number,
): number {
  const timeSec = targetGain < currentGain ? attackSec : releaseSec;
  const alpha = 1 - Math.exp(-dt / Math.max(timeSec, 0.0001));
  return currentGain + alpha * (targetGain - currentGain);
}

export interface SidechainParams {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

/**
 * SidechainFollower — connects a source track's audio to an envelope follower
 * and applies gain reduction to the target track via a GainNode.
 */
export class SidechainFollower {
  readonly gainNode: GainNode;
  private analyser: AnalyserNode;
  private analyserBuffer: Float32Array<ArrayBuffer>;
  private rafId = 0;
  private params: SidechainParams;
  private currentGainLinear = 1;
  private lastTime = 0;
  private disposed = false;
  /** Latest gain reduction in dB (for metering). */
  reduction = 0;

  constructor(
    ctx: AudioContext,
    sourceOutput: AudioNode,
    params: SidechainParams,
  ) {
    this.params = { ...params };
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserBuffer = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.gainNode = ctx.createGain();

    // Tap the source track's output (does not interrupt source routing)
    sourceOutput.connect(this.analyser);

    this.lastTime = performance.now() / 1000;
    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  updateParams(p: SidechainParams) {
    this.params = { ...p };
  }

  private tick() {
    if (this.disposed) return;

    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastTime, 0.1);
    this.lastTime = now;

    // Read RMS from source
    this.analyser.getFloatTimeDomainData(this.analyserBuffer);
    let sum = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const s = this.analyserBuffer[i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.analyserBuffer.length);
    const inputDb = 20 * Math.log10(Math.max(rms, 1e-8));

    // Compute target gain reduction
    const reductionDb = computeGainReduction(
      inputDb,
      this.params.threshold,
      this.params.ratio,
      this.params.knee,
    );
    this.reduction = reductionDb;
    const targetGain = Math.pow(10, -reductionDb / 20);

    // Smooth
    this.currentGainLinear = smoothGain(
      this.currentGainLinear,
      targetGain,
      this.params.attack,
      this.params.release,
      dt,
    );

    // Apply
    this.gainNode.gain.value = this.currentGainLinear;
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    try { this.analyser.disconnect(); } catch { /* ok */ }
    try { this.gainNode.disconnect(); } catch { /* ok */ }
  }
}

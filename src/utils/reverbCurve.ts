/**
 * reverbCurve.ts — Pure math for reverb decay envelope visualization.
 *
 * Models the impulse response shape: pre-delay gap → early reflections → exponential tail.
 */

/**
 * Compute decay amplitude (0–1) at time t seconds.
 * @param t         Time in seconds after audio input
 * @param decayTime RT60 decay time in seconds
 * @param damping   Damping amount 0–1 (0=no damping, 1=maximum)
 */
export function decayAtTime(t: number, decayTime: number, damping: number): number {
  if (t < 0) return 0;

  // RT60: amplitude falls to 10^(-60/20) ≈ 0.001 at t=decayTime
  // Effective decay rate depends on damping (higher damping → faster decay)
  const dampingFactor = 1 + damping * 2; // 1x to 3x faster with damping
  const tau = decayTime / (dampingFactor * Math.log(1000)); // time constant

  return Math.exp(-t / tau);
}

export interface ReverbEnvelopePoint {
  t: number;         // Time in seconds
  amplitude: number; // 0–1
  isEarlyReflection?: boolean;
}

/**
 * Generate reverb envelope points for visualization.
 * @param decayTime   RT60 decay time in seconds
 * @param preDelay    Pre-delay time in seconds
 * @param damping     Damping amount 0–1
 * @param erLevel     Early reflections level 0–1
 * @param steps       Number of points
 */
export function generateReverbEnvelope(
  decayTime: number,
  preDelay: number,
  damping: number,
  erLevel: number,
  steps: number = 120,
): ReverbEnvelopePoint[] {
  // Total display window: pre-delay + decay time (capped at 8s for display)
  const displayEnd = Math.min(preDelay + decayTime * 1.2, preDelay + 8);
  const points: ReverbEnvelopePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = (displayEnd * i) / steps;
    const tAfterPreDelay = t - preDelay;

    if (tAfterPreDelay < 0) {
      points.push({ t, amplitude: 0 });
    } else {
      points.push({ t, amplitude: decayAtTime(tAfterPreDelay, decayTime, damping) });
    }
  }

  return points;
}

/**
 * Generate early reflection spike positions (time offsets after pre-delay).
 * Returns times in seconds relative to pre-delay end.
 */
export function getEarlyReflectionTimes(reverbType: string, decayTime: number): number[] {
  // ER patterns vary by reverb type
  const patterns: Record<string, number[]> = {
    plate:   [0.008, 0.015, 0.024, 0.038, 0.055, 0.075],
    hall:    [0.010, 0.022, 0.035, 0.052, 0.080, 0.120],
    room:    [0.005, 0.010, 0.018, 0.028, 0.042],
    chamber: [0.006, 0.014, 0.025, 0.040, 0.060],
    spring:  [0.004, 0.009, 0.016, 0.025, 0.038, 0.055, 0.075],
  };

  const base = patterns[reverbType] ?? patterns.hall;
  // Scale ER spacing by decay time (larger rooms have later ERs)
  const scale = Math.sqrt(decayTime / 2.5);
  return base.map(t => t * scale);
}

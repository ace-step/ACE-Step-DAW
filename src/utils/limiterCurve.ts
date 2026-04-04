/**
 * limiterCurve.ts — Pure math for limiter transfer curve visualization.
 *
 * Shows brick-wall limiting behavior: signal above ceiling is clamped.
 * Different styles affect the knee shape.
 */

export type LimiterStyle = 'transparent' | 'aggressive' | 'warm';

/**
 * Compute limiter output dB for a given input dB.
 * @param inputDb  Input level in dB
 * @param ceiling  Output ceiling in dB (e.g. -0.3)
 * @param gain     Input gain in dB
 * @param style    Limiter character
 */
export function limiterTransfer(
  inputDb: number,
  ceiling: number,
  gain: number,
  style: LimiterStyle,
): number {
  const boosted = inputDb + gain;

  if (boosted <= ceiling - 6) {
    // Well below ceiling — linear pass-through
    return boosted;
  }

  // Cubic Hermite soft-knee: continuous value AND derivative at both
  // kneeStart (slope=1, value=kneeStart) and ceiling (slope=0, value=ceiling).
  // t = (boosted - kneeStart) / knee, t ∈ [0,1]
  // h(t) = kneeStart + knee * t * (1 + t * (t - 2))
  //       = kneeStart + knee * (3t² - 2t³)  ... wait, we need slope=1 at t=0.
  // Using Hermite basis: p(t) = kneeStart + knee * (t - t²)  ... no.
  // Correct Hermite: f(t) = (1-t)²(1+2t)·p0 + t²(3-2t)·p1 + t(1-t)²·m0 + t²(t-1)·m1
  // p0=kneeStart, p1=ceiling, m0=knee (slope=1 scaled by interval), m1=0
  // f(t) = (1-t)²(1+2t)·kneeStart + t²(3-2t)·ceiling + t(1-t)²·knee
  const softKnee = (b: number, knee: number): number => {
    const kneeStart = ceiling - knee;
    if (b <= kneeStart) return b;
    if (b >= ceiling) return ceiling;
    const t = (b - kneeStart) / knee;
    const t2 = t * t;
    const t3 = t2 * t;
    // Hermite interpolation: value=kneeStart→ceiling, slope=1→0
    return (1 - t2 * (3 - 2 * t)) * kneeStart + t2 * (3 - 2 * t) * ceiling + (t - 2 * t2 + t3) * knee;
  };

  switch (style) {
    case 'transparent':
      // Gentle 6dB soft knee
      return softKnee(boosted, 6);

    case 'aggressive':
      // Tight 3dB soft knee
      return softKnee(boosted, 3);

    case 'warm':
      // Wide 12dB soft knee for gradual onset
      return softKnee(boosted, 12);

    default:
      return Math.min(boosted, ceiling);
  }
}

/**
 * Generate transfer curve points for limiter visualization.
 */
export function generateLimiterCurve(
  ceiling: number,
  gain: number,
  style: LimiterStyle,
  minDb: number = -60,
  maxDb: number = 0,
  steps: number = 120,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const inputDb = minDb + (maxDb - minDb) * (i / steps);
    const outputDb = limiterTransfer(inputDb, ceiling, gain, style);
    points.push({ x: inputDb, y: outputDb });
  }
  return points;
}

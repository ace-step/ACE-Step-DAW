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

  switch (style) {
    case 'transparent': {
      // Gentle 6dB soft knee: continuous from pass-through to hard ceiling
      if (boosted >= ceiling) return ceiling;
      const knee = 6;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      // Quadratic knee: output = kneeStart + knee * t^2
      // At t=0: output = kneeStart (matches pass-through)
      // At t=1: output = kneeStart + knee = ceiling (matches ceiling)
      // Slope transitions from 0 at t=0 toward 2 at t=1 (gentle start)
      const t = (boosted - kneeStart) / knee;
      return kneeStart + knee * t * t;
    }

    case 'aggressive': {
      // Tight 3dB knee for punchier limiting
      if (boosted >= ceiling) return ceiling;
      const knee = 3;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      const t = (boosted - kneeStart) / knee;
      return kneeStart + knee * t * t;
    }

    case 'warm': {
      // Pass-through up to ceiling, then soft tanh saturation above
      if (boosted <= ceiling) return boosted;
      const overshoot = boosted - ceiling;
      const compressed = 12 * Math.tanh(overshoot / 12);
      return Math.min(ceiling, ceiling + compressed - overshoot);
    }

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

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

  switch (style) {
    case 'transparent': {
      // Very gentle knee into hard ceiling without amplifying below-ceiling signals
      if (boosted >= ceiling) return ceiling;
      const knee = 6;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      const t = (boosted - kneeStart) / knee;
      const reduction = (knee * 0.5) * t * t;
      return Math.min(boosted, ceiling - knee + knee * t - reduction);
    }

    case 'aggressive': {
      // Tighter knee, earlier engagement, still attenuation-only
      if (boosted >= ceiling) return ceiling;
      const knee = 3;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      const t = (boosted - kneeStart) / knee;
      const reduction = (knee * 0.5) * t * t;
      return Math.min(boosted, ceiling - knee + knee * t - reduction);
    }

    case 'warm': {
      // Soft tanh-style approach to ceiling
      if (boosted <= ceiling - 12) return boosted;
      const headroom = boosted - (ceiling - 12);
      const compressed = 12 * Math.tanh(headroom / 12);
      return (ceiling - 12) + compressed;
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

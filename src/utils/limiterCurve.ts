/**
 * limiterCurve.ts — Pure math for limiter transfer curve visualization.
 *
 * Models the limiter transfer function: linear below ceiling, hard limit above.
 */

export interface LimiterTransferPoint {
  inputDb: number;
  outputDb: number;
}

/**
 * Generate limiter transfer curve points.
 * @param ceiling  Output ceiling in dB (typically -0.3 to 0)
 * @param gain     Input gain in dB
 * @param style    Limiting style affects knee softness
 * @param minDb    Minimum dB for display range
 * @param maxDb    Maximum dB for display range
 * @param steps    Number of points
 */
export function generateLimiterCurve(
  ceiling: number,
  gain: number,
  style: 'transparent' | 'aggressive' | 'warm',
  minDb: number = -48,
  maxDb: number = 6,
  steps: number = 120,
): LimiterTransferPoint[] {
  const points: LimiterTransferPoint[] = [];
  // Knee width depends on style
  const kneeDb = style === 'transparent' ? 1 : style === 'warm' ? 4 : 0.5;

  for (let i = 0; i <= steps; i++) {
    const inputDb = minDb + ((maxDb - minDb) * i) / steps;
    const boosted = inputDb + gain;

    let outputDb: number;
    const threshold = ceiling;
    const diff = boosted - threshold;

    if (kneeDb > 0 && Math.abs(diff) < kneeDb) {
      // Soft knee region — quadratic interpolation
      const t = (diff + kneeDb) / (2 * kneeDb);
      const compression = t * t;
      outputDb = boosted - diff * compression;
    } else if (boosted > threshold) {
      // Above ceiling — hard limit
      outputDb = ceiling;
    } else {
      // Below threshold — unity
      outputDb = boosted;
    }

    points.push({ inputDb, outputDb: Math.min(outputDb, ceiling) });
  }

  return points;
}

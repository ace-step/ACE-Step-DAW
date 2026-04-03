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
 * @param steps    Number of intervals between minDb and maxDb; returns steps + 1 points including both endpoints
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

    if (boosted <= threshold) {
      // Below threshold — unity
      outputDb = boosted;
    } else if (kneeDb > 0 && diff < kneeDb) {
      // Soft knee region above threshold only — smoothly bend into the ceiling
      const t = diff / kneeDb;
      const compression = t * (2 - t);
      outputDb = boosted - diff * compression;
    } else {
      // Above knee — hard limit
      outputDb = ceiling;
    }

    points.push({ inputDb, outputDb: Math.min(Math.min(outputDb, boosted), ceiling) });
  }

  return points;
}

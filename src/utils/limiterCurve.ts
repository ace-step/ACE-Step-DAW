/**
 * limiterCurve.ts — Pure math for limiter transfer curve visualization.
 *
 * Shows brick-wall limiting behavior: signal above ceiling is clamped.
 * Different styles affect the knee shape.
 */

export type LimiterStyle = 'transparent' | 'aggressive' | 'warm';

export interface LimiterTransferPoint {
  inputDb: number;
  outputDb: number;
}

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

  // Standard soft-knee limiter (ratio = ∞), knee centered on ceiling.
  // Uses quadratic gain reduction: output = boosted - x²/(2*knee)
  // where x = boosted - (ceiling - knee/2).
  // Properties: C1-continuous (slope=1 at bottom, slope=0 at top),
  // monotonic, never amplifies (output ≤ boosted), never exceeds ceiling.
  const knee = style === 'aggressive' ? 3 : style === 'warm' ? 9 : 6;
  const halfKnee = knee / 2;

  if (boosted <= ceiling - halfKnee) return boosted;
  if (boosted >= ceiling + halfKnee) return ceiling;

  const x = boosted - ceiling + halfKnee; // 0 to knee
  return boosted - (x * x) / (2 * knee);
}

/**
 * Generate transfer curve points for limiter visualization.
 */
export function generateLimiterCurve(
  ceiling: number,
  gain: number,
  style: LimiterStyle,
  minDb: number = -48,
  maxDb: number = 6,
  steps: number = 120,
): LimiterTransferPoint[] {
  const points: LimiterTransferPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const inputDb = minDb + (maxDb - minDb) * (i / steps);
    const outputDb = limiterTransfer(inputDb, ceiling, gain, style);
    points.push({ inputDb, outputDb });
  }
  return points;
}

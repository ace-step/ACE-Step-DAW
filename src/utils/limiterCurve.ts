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

  // Standard soft-knee limiter (Zölzer formula, ratio → ∞).
  // Knee of width K is centered on the ceiling:
  //   kneeStart = ceiling - K/2,  kneeEnd = ceiling + K/2
  // In the knee region: output = input - (input - ceiling + K/2)² / (2K)
  // This is C1 continuous: slope=1 at kneeStart, slope=0 at kneeEnd.
  const softKnee = (b: number, knee: number): number => {
    const halfKnee = knee / 2;
    if (b <= ceiling - halfKnee) return b;
    if (b >= ceiling + halfKnee) return ceiling;
    const delta = b - ceiling + halfKnee;
    return b - (delta * delta) / (2 * knee);
  };

  switch (style) {
    case 'transparent':
      // Gentle 6dB soft knee centered on ceiling
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

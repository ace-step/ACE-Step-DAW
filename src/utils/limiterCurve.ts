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
      // Gentle soft-knee using quadratic interpolation, continuous at both ends
      if (boosted >= ceiling) return ceiling;
      const knee = 6;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      // Quadratic soft knee: f(x) = x - (x - kneeStart)^2 / (2 * knee)
      // At kneeStart: f = kneeStart (continuous with linear)
      // At ceiling: f = ceiling - knee/2 → we offset to reach ceiling
      const delta = boosted - kneeStart;
      return boosted - (delta * delta) / (2 * knee);
    }

    case 'aggressive': {
      // Tighter knee, same continuous quadratic approach
      if (boosted >= ceiling) return ceiling;
      const knee = 3;
      const kneeStart = ceiling - knee;
      if (boosted <= kneeStart) return boosted;
      const delta = boosted - kneeStart;
      return boosted - (delta * delta) / (2 * knee);
    }

    case 'warm': {
      // Soft tanh-style approach, normalized so f(ceiling) = ceiling
      if (boosted >= ceiling) return ceiling;
      const kneeWidth = 12;
      const kneeStart = ceiling - kneeWidth;
      if (boosted <= kneeStart) return boosted;
      const headroom = boosted - kneeStart;
      // Normalize tanh so that tanh(kneeWidth/kneeWidth) maps to ceiling
      const tanhNorm = Math.tanh(1); // ~0.7616
      const compressed = kneeWidth * Math.tanh(headroom / kneeWidth) / tanhNorm;
      return kneeStart + compressed;
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

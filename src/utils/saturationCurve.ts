/**
 * saturationCurve.ts — Pure math for saturation waveshaping transfer functions.
 *
 * Each saturation type has a characteristic curve:
 * - tape:       Gentle S-curve with asymmetric harmonic content
 * - tube:       Warm, asymmetric with soft even harmonics
 * - transistor: Harder clipping with odd harmonics
 * - soft:       Smooth tanh saturation
 * - hard:       Aggressive hard clip
 */

export type SaturationType = 'tape' | 'tube' | 'transistor' | 'soft' | 'hard';

/**
 * Compute waveshaper output for input x in [-1, 1].
 * @param x     Input amplitude (-1 to 1)
 * @param drive Drive amount (0–1)
 * @param type  Saturation character
 */
export function saturationTransfer(x: number, drive: number, type: SaturationType): number {
  const k = 1 + drive * 8;

  if (drive < 0.001) return Math.max(-1, Math.min(1, x));

  let y: number;
  switch (type) {
    case 'tape':
      // Tape: gentle asymmetric compression (positive side softer)
      y = Math.tanh(k * 0.7 * x);
      // Add subtle even-harmonic asymmetry
      y += 0.05 * drive * (1 - Math.cos(Math.PI * x));
      y = Math.max(-1, Math.min(1, y));
      break;

    case 'tube':
      // Tube: warm asymmetric (positive clips later, negative clips sooner)
      if (x >= 0) {
        y = (1 - Math.exp(-k * 0.6 * x)) / (1 - Math.exp(-k * 0.6) || 1);
      } else {
        y = -(1 - Math.exp(k * 0.8 * x)) / (1 - Math.exp(-k * 0.8) || 1);
      }
      break;

    case 'transistor':
      // Transistor: harder, more symmetric odd harmonics
      y = Math.tanh(k * x) / Math.tanh(k);
      // Push harder toward clipping
      y = y * (1 + 0.2 * drive * y * y);
      y = Math.max(-1, Math.min(1, y));
      break;

    case 'soft':
      // Soft: smooth tanh
      y = Math.tanh(k * x) / Math.tanh(k);
      break;

    case 'hard':
      // Hard clip with slight rounding
      y = Math.max(-1, Math.min(1, k * x * 0.5));
      break;

    default:
      y = x;
  }

  return Math.max(-1, Math.min(1, y));
}

/**
 * Generate transfer curve points for saturation visualization.
 */
export function generateSaturationCurve(
  drive: number,
  type: SaturationType,
  steps: number = 120,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = -1 + (2 * i) / steps;
    const y = saturationTransfer(x, drive, type);
    points.push({ x, y });
  }
  return points;
}

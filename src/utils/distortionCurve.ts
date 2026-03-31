/**
 * distortionCurve.ts — Pure math for distortion waveshaping transfer functions.
 *
 * Each distortion type has a characteristic curve shape:
 * - soft:     smooth tanh-based S-curve (gentle saturation)
 * - overdrive: asymmetric exponential (warm, harmonically rich)
 * - fuzz:     hard clip (flat top/bottom, aggressive)
 */

export type DistortionType = 'soft' | 'overdrive' | 'fuzz';

/**
 * Compute waveshaper output for input x in [-1, 1].
 * @param x     Input amplitude (-1 to 1)
 * @param drive Drive amount (0 = unity, 1 = maximum distortion)
 * @param type  Distortion character
 * @returns     Clipped output amplitude in [-1, 1]
 */
export function distortionTransfer(x: number, drive: number, type: DistortionType): number {
  // Drive multiplier: 0 at drive=0 (linear passthrough), 9 at drive=1
  const k = drive * 9;

  // At zero drive, output equals input (no processing)
  if (k < 0.001) return Math.max(-1, Math.min(1, x));

  let y: number;
  switch (type) {
    case 'soft':
      // Smooth tanh saturation — odd-symmetric, never clips hard
      y = Math.tanh(k * x) / Math.tanh(k);
      break;

    case 'overdrive':
      // Asymmetric exponential — positive half has gentler knee, negative harder
      if (x >= 0) {
        y = (1 - Math.exp(-k * x)) / (1 - Math.exp(-k));
      } else {
        // Slightly harder on negative half (asymmetric harmonic content)
        y = -(1 - Math.exp(k * 0.85 * x)) / (1 - Math.exp(-k * 0.85));
      }
      break;

    case 'fuzz':
      // Hard clip with soft transition at edges
      y = Math.max(-1, Math.min(1, k * x));
      // Smooth the hard edge slightly with tanh to avoid exact square waves
      y = Math.tanh(y * 3) / Math.tanh(3);
      break;

    default:
      y = x;
  }

  return Math.max(-1, Math.min(1, y));
}

/**
 * Generate an array of {x, y} points for the distortion transfer curve.
 * @param drive  Drive amount (0–1)
 * @param type   Distortion type
 * @param steps  Number of segments (default 120)
 */
export function generateDistortionCurve(
  drive: number,
  type: DistortionType,
  steps: number = 120,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = -1 + (2 * i) / steps;
    const y = distortionTransfer(x, drive, type);
    points.push({ x, y });
  }
  return points;
}

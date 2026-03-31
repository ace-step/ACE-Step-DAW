/**
 * compressorCurve.ts — Pure math for compressor transfer curve visualization.
 *
 * Calculates output dB from input dB given threshold, ratio, and knee width.
 * Based on the standard soft-knee compressor formula.
 */

/** Compute output dB for a given input dB */
export function compressorTransfer(
  inputDb: number,
  threshold: number,
  ratio: number,
  kneeDb: number,
): number {
  const halfKnee = kneeDb / 2;

  if (inputDb <= threshold - halfKnee) {
    // Below knee region — no compression
    return inputDb;
  }

  if (kneeDb > 0 && inputDb < threshold + halfKnee) {
    // Soft knee region — quadratic interpolation
    const x = inputDb - threshold + halfKnee;
    return inputDb + ((1 / ratio - 1) * x * x) / (2 * kneeDb);
  }

  // Above threshold — full compression
  return threshold + (inputDb - threshold) / ratio;
}

/** Generate an array of {x, y} points for the transfer curve */
export function generateTransferCurve(
  threshold: number,
  ratio: number,
  kneeDb: number,
  minDb: number = -60,
  maxDb: number = 0,
  steps: number = 120,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const inputDb = minDb + (maxDb - minDb) * (i / steps);
    const outputDb = compressorTransfer(inputDb, threshold, ratio, kneeDb);
    points.push({ x: inputDb, y: outputDb });
  }
  return points;
}

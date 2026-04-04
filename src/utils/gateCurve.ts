/**
 * gateCurve.ts — Pure math for gate/expander transfer curve visualization.
 *
 * Shows the gate behavior: below threshold, signal is attenuated by range dB.
 * The hysteresis creates a dead zone between open and close thresholds.
 */

/**
 * Compute gate output dB for a given input dB.
 * @param inputDb    Input level in dB
 * @param threshold  Gate open threshold in dB
 * @param range      Attenuation amount in dB (negative, e.g. -80)
 * @param hysteresis Hysteresis width in dB (close threshold = threshold - hysteresis)
 * @param mode       'gate' for hard cut, 'expander' for gentle expansion
 */
export function gateTransfer(
  inputDb: number,
  threshold: number,
  range: number,
  hysteresis: number,
  mode: 'gate' | 'expander',
): number {
  const closeThresh = threshold - hysteresis;

  if (mode === 'gate') {
    // Hard gate: above threshold = pass, below = range attenuation
    if (inputDb >= threshold) return inputDb;
    if (inputDb <= closeThresh) return inputDb + range;
    // Transition zone (hysteresis region): linear interpolation
    const t = (inputDb - closeThresh) / (threshold - closeThresh || 1);
    return inputDb + range * (1 - t);
  }

  // Expander mode: gradual expansion below threshold
  // Matches engine behavior: fixed 0.5 slope, capped by abs(range)
  if (inputDb >= threshold) return inputDb;
  const belowDb = threshold - inputDb;
  const reductionDb = Math.min(belowDb * 0.5, Math.abs(range));
  return inputDb - reductionDb;
}

/**
 * Generate transfer curve points for gate visualization.
 */
export function generateGateCurve(
  threshold: number,
  range: number,
  hysteresis: number,
  mode: 'gate' | 'expander',
  minDb: number = -80,
  maxDb: number = 0,
  steps: number = 120,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const inputDb = minDb + (maxDb - minDb) * (i / steps);
    const outputDb = gateTransfer(inputDb, threshold, range, hysteresis, mode);
    points.push({ x: inputDb, y: outputDb });
  }
  return points;
}

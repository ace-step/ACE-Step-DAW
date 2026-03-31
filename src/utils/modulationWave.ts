/**
 * modulationWave.ts — Pure math for LFO modulation visualization.
 *
 * Shared utilities for Chorus, Flanger, and Phaser visualizations.
 */

export type ModulationType = 'chorus' | 'flanger' | 'phaser';

/**
 * Compute sine LFO value at time t.
 * @param t      Time in seconds
 * @param freq   LFO frequency in Hz
 * @param depth  Modulation depth (0–1)
 */
export function getLfoValue(t: number, freq: number, depth: number): number {
  return depth * Math.sin(2 * Math.PI * freq * t);
}

export interface LfoRange {
  min: number; // ms
  max: number; // ms
}

/**
 * Compute the delay time range swept by the LFO.
 * @param depth    Modulation depth (0–1)
 * @param baseMs   Base delay time in ms
 * @param type     Effect type (affects modulation range)
 */
export function getLfoRange(depth: number, baseMs: number, type: ModulationType): LfoRange {
  const swing = depth * baseMs * 0.9; // modulation range
  return { min: Math.max(0, baseMs - swing), max: baseMs + swing };
}

export interface LfoPoint {
  t: number;     // Time in seconds
  value: number; // LFO output (-1 to 1, scaled by depth)
}

/**
 * Generate LFO waveform points for visualization.
 * @param freq            LFO frequency in Hz
 * @param depth           Modulation depth (0–1)
 * @param displayDuration Time window in seconds
 * @param steps           Number of points
 */
export function generateLfoWave(
  freq: number,
  depth: number,
  displayDuration: number,
  steps: number = 120,
): LfoPoint[] {
  const points: LfoPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (displayDuration * i) / steps;
    points.push({ t, value: getLfoValue(t, freq, depth) });
  }
  return points;
}

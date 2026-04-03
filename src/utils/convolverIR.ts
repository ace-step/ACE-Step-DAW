/**
 * convolverIR.ts — Pure math for convolver impulse response visualization.
 *
 * Generates a synthetic IR envelope for each factory IR type,
 * with early-reflection and tail regions marked.
 */

import type { FactoryIRType } from '../types/project';

export interface IREnvelopePoint {
  t: number;         // Time in seconds
  amplitude: number; // 0–1
}

/** IR profile: early reflection pattern + decay characteristics */
interface IRProfile {
  /** Early reflection end time (seconds) */
  erEnd: number;
  /** Total IR length (seconds) */
  length: number;
  /** ER density (number of early spikes) */
  erCount: number;
  /** Decay rate (higher = faster) */
  decayRate: number;
}

const IR_PROFILES: Record<FactoryIRType, IRProfile> = {
  smallRoom: { erEnd: 0.03, length: 0.4, erCount: 8, decayRate: 12 },
  largeHall: { erEnd: 0.08, length: 2.5, erCount: 12, decayRate: 2.5 },
  plate:     { erEnd: 0.01, length: 1.5, erCount: 4, decayRate: 3.5 },
  spring:    { erEnd: 0.02, length: 1.0, erCount: 6, decayRate: 4.0 },
};

/**
 * Generate synthetic IR envelope for visualization.
 * Returns points representing the IR waveform shape.
 *
 * @param irType    Factory IR preset type
 * @param preDelay  Pre-delay in milliseconds (converted to seconds internally)
 */
export function generateIREnvelope(
  irType: FactoryIRType,
  preDelay: number,
  /** Number of intervals; returns steps + 1 points including both endpoints */
  steps: number = 160,
): IREnvelopePoint[] {
  const profile = IR_PROFILES[irType];
  const preDelayS = preDelay / 1000; // ms → seconds
  const totalLength = preDelayS + profile.length;
  const points: IREnvelopePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = (totalLength * i) / steps;
    const tAfterPD = t - preDelayS;

    if (tAfterPD < 0) {
      points.push({ t, amplitude: 0 });
      continue;
    }

    // Exponential decay envelope
    const decay = Math.exp(-tAfterPD * profile.decayRate);
    // Add slight random-looking variation using deterministic sine waves
    const variation = 1 + 0.15 * Math.sin(tAfterPD * 47) * Math.sin(tAfterPD * 23);
    const amplitude = Math.max(0, decay * variation);

    points.push({ t, amplitude: Math.min(1, amplitude) });
  }

  return points;
}

/**
 * Get early reflection spike positions for the IR type.
 * Returns array of {time, amplitude} for ER spikes.
 */
export function getIRReflections(
  irType: FactoryIRType,
  preDelay: number,
): Array<{ t: number; amplitude: number }> {
  const profile = IR_PROFILES[irType];
  const preDelayS = preDelay / 1000;
  const spikes: Array<{ t: number; amplitude: number }> = [];

  for (let i = 0; i < profile.erCount; i++) {
    const fraction = (i + 1) / (profile.erCount + 1);
    const t = preDelayS + fraction * profile.erEnd;
    // Amplitude decreases with each reflection
    const amplitude = 0.95 * Math.pow(0.72, i);
    spikes.push({ t, amplitude });
  }

  return spikes;
}

/** Get the ER boundary time for drawing the region separator */
export function getERBoundary(irType: FactoryIRType, preDelay: number): number {
  const profile = IR_PROFILES[irType];
  return preDelay / 1000 + profile.erEnd;
}

/** Get total IR display length in seconds */
export function getIRLength(irType: FactoryIRType, preDelay: number): number {
  const profile = IR_PROFILES[irType];
  return preDelay / 1000 + profile.length;
}

import type { GainEnvelopePoint } from '../types/project';

/**
 * Interpolate gain value at a given time from a sorted envelope.
 * Returns 1.0 (unity gain) if envelope is empty.
 * Holds first/last value outside the envelope range.
 * Linearly interpolates between adjacent points.
 */
export function interpolateGainEnvelope(
  points: GainEnvelopePoint[],
  time: number,
): number {
  if (points.length === 0) return 1;

  const clamp = (v: number) => Math.max(0, Math.min(2, v));

  if (points.length === 1) return clamp(points[0].gain);

  // Before first point: hold
  if (time <= points[0].time) return clamp(points[0].gain);

  // After last point: hold
  if (time >= points[points.length - 1].time) return clamp(points[points.length - 1].gain);

  // Find segment
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return clamp(a.gain + t * (b.gain - a.gain));
    }
  }

  return 1;
}

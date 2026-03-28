/**
 * Ableton-style meter color constants.
 *
 * Green for most of the range, narrow yellow warning zone near the top,
 * red only at the clipping danger zone. This avoids the "rainbow" look
 * and matches professional DAW conventions.
 */

/** CSS gradient for horizontal meters (left-to-right). */
export const METER_GRADIENT_HORIZONTAL =
  'linear-gradient(to right, #4ade80 0%, #4ade80 75%, #facc15 88%, #ef4444 98%)';

/** CSS gradient for vertical meters (bottom-to-top). */
export const METER_GRADIENT_VERTICAL =
  'linear-gradient(to top, #4ade80 0%, #4ade80 75%, #facc15 88%, #ef4444 98%)';

/** Canvas gradient color stops (position 0-1, color) — bottom to top. */
export const METER_CANVAS_STOPS: [number, string][] = [
  [0, '#4ade80'],
  [0.75, '#4ade80'],
  [0.88, '#facc15'],
  [0.98, '#ef4444'],
  [1.0, '#ef4444'],
];

/** Meter dB range: the floor (silence) and ceiling. */
export const METER_DB_MIN = -60;
export const METER_DB_MAX = 0;

/** dB tick marks for the mixer vertical meter. */
export const METER_DB_TICKS = [0, -6, -12, -24, -48];

/**
 * Convert a linear amplitude (0..1+) to a 0..1 fill fraction
 * using a dB-logarithmic scale mapped from METER_DB_MIN to METER_DB_MAX.
 *
 * This gives professional metering behavior: most of the visual range
 * is dedicated to the -24dB to 0dB region where mixing decisions happen,
 * while very quiet signals occupy only a small portion at the bottom.
 */
export function levelToFill(linear: number): number {
  if (linear <= 0) return 0;
  const db = 20 * Math.log10(linear);
  return Math.max(0, Math.min(1, (db - METER_DB_MIN) / (METER_DB_MAX - METER_DB_MIN)));
}

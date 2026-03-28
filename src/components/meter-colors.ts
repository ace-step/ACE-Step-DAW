/**
 * Ableton-style meter color and scaling constants.
 *
 * Green for most of the range, narrow yellow warning zone near the top,
 * red only at the clipping danger zone. Non-linear fader curve gives more
 * visual resolution to the upper dB range (where mixing decisions happen).
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

/**
 * Fader law gamma exponent.
 * < 1.0 = more visual space for the upper (loud) range, matching Ableton.
 * 1.0 = linear dB (equal spacing).
 */
const FADER_GAMMA = 0.75;

/** Major dB tick marks (every 12dB, Ableton-style). */
export const METER_DB_TICKS = [0, -12, -24, -36, -48, -60];

/** Minor dB tick marks (midpoints between major ticks, shown as dimmer lines). */
export const METER_DB_TICKS_MINOR = [-6, -18, -30, -42, -54];

/**
 * Top/bottom padding percentage for the meter scale.
 * 0dB is not at the very top, and -60dB is not at the very bottom,
 * giving visual breathing room like Ableton.
 */
export const METER_PADDING_PCT = 4;

/**
 * Convert a dB value to a 0..1 fill fraction using the non-linear fader curve.
 * Used for placing dB tick marks and other dB-referenced positions.
 */
export function dbToFill(db: number): number {
  const dbNorm = Math.max(0, Math.min(1, (db - METER_DB_MIN) / (METER_DB_MAX - METER_DB_MIN)));
  return Math.pow(dbNorm, FADER_GAMMA);
}

/**
 * Convert a linear amplitude (0..1+) to a 0..1 fill fraction
 * using the non-linear fader curve.
 *
 * The gamma correction gives more visual space to the 0dB to -24dB range
 * (where mixing decisions happen) and compresses the very quiet range,
 * matching Ableton's fader taper.
 */
export function levelToFill(linear: number): number {
  if (linear <= 0) return 0;
  const db = 20 * Math.log10(linear);
  return dbToFill(db);
}

/**
 * Inverse of levelToFill: convert a 0..1 fill position back to linear amplitude.
 * Used by VerticalFader to convert mouse position to gain value.
 */
export function fillToLevel(fill: number): number {
  if (fill <= 0) return 0;
  // Reverse the gamma
  const dbNorm = Math.pow(fill, 1 / FADER_GAMMA);
  const db = METER_DB_MIN + dbNorm * (METER_DB_MAX - METER_DB_MIN);
  return Math.pow(10, db / 20);
}

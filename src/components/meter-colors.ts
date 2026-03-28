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

/**
 * 16 DAW-standard track colors inspired by Ableton Live's palette.
 * Used for automatic track color assignment.
 */
export const TRACK_COLOR_PALETTE: string[] = [
  '#FF6B6B', // Red
  '#FF9F43', // Orange
  '#FECA57', // Yellow
  '#BADC58', // Yellow-Green
  '#6AB04C', // Green
  '#22A6B3', // Teal
  '#7ED6DF', // Cyan
  '#4A90D9', // Blue
  '#686DE0', // Indigo
  '#BE2EDD', // Purple
  '#E056A0', // Magenta
  '#FF7979', // Salmon
  '#F8A5C2', // Pink
  '#C4A35A', // Gold
  '#95AAB5', // Slate
  '#A29BFE', // Lavender
];

/**
 * Returns the next unused color from the palette.
 * Cycles through the palette sequentially, skipping colors already in use.
 * If all colors are used, wraps around and picks based on count.
 */
export function getNextTrackColor(existingColors: string[]): string {
  const normalised = new Set(existingColors.map((c) => c.toUpperCase()));

  for (const color of TRACK_COLOR_PALETTE) {
    if (!normalised.has(color.toUpperCase())) {
      return color;
    }
  }

  // All 16 used — cycle based on count
  return TRACK_COLOR_PALETTE[existingColors.length % TRACK_COLOR_PALETTE.length];
}

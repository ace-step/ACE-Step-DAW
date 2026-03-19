export const TRACK_COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#71717a',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
];

export function getNextTrackColor(existingColors: string[]): string {
  const unused = TRACK_COLOR_PALETTE.find(
    (color) => !existingColors.includes(color),
  );
  return unused ?? TRACK_COLOR_PALETTE[0];
}

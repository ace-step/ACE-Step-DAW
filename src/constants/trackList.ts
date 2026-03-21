export const TRACK_LIST_COLLAPSED_WIDTH = 72;
export const TRACK_LIST_MIN_WIDTH = 120;
export const TRACK_LIST_MAX_WIDTH = 400;
export const TRACK_LIST_DEFAULT_WIDTH = 220;

export function clampTrackListWidth(width: number) {
  return Math.min(TRACK_LIST_MAX_WIDTH, Math.max(TRACK_LIST_MIN_WIDTH, Math.round(width)));
}

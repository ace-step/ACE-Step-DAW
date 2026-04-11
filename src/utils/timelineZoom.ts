export interface TimelineZoomRange {
  startTime: number;
  endTime: number;
}

export const TIMELINE_ZOOM_LEVELS = [
  // 10–500: fine steps of 10 for everyday zoom range
  2, 3, 4, 5, 6, 7, 8, 9,
  10,  20,  30,  40,  50,  60,  70,  80,  90,  100,
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
  210, 220, 230, 240, 250, 260, 270, 280, 290, 300,
  310, 320, 330, 340, 350, 360, 370, 380, 390, 400,
  410, 420, 430, 440, 450, 460, 470, 480, 490, 500,
  // 500–2000: coarser steps for deep zoom (1/32 & 1/64 subdivisions)
  550, 600, 650, 700, 750, 800, 900, 1000,
  1100, 1200, 1400, 1600, 1800, 2000,
] as const;
export const DEFAULT_TIMELINE_PIXELS_PER_SECOND = 50;
export const MIN_TIMELINE_PIXELS_PER_SECOND = TIMELINE_ZOOM_LEVELS[0];
export const MAX_TIMELINE_PIXELS_PER_SECOND = TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1];
export const PLAYHEAD_ZOOM_ANCHOR_THRESHOLD_PX = 72;

interface TimelineFitOptions {
  minPixelsPerSecond?: number;
  maxPixelsPerSecond?: number;
  paddingPx?: number;
}

export interface TimelineViewportState {
  pixelsPerSecond: number;
  scrollLeft: number;
  viewportWidth: number;
  totalDuration: number;
}

export interface TimelineZoomAnchor {
  time: number;
  viewportX: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTimelineContentWidth(
  totalDuration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
) {
  return Math.max(0, totalDuration * pixelsPerSecond, viewportWidth);
}

export function getTimelineVisualDuration(
  totalDuration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
) {
  if (pixelsPerSecond <= 0) return totalDuration;
  const viewDuration = viewportWidth / pixelsPerSecond;
  // When the project already fits within the viewport (at min zoom),
  // don't pad — content should exactly fill the viewport
  if (totalDuration > 0 && totalDuration * pixelsPerSecond <= viewportWidth) {
    return totalDuration;
  }
  return Math.max(totalDuration, viewDuration);
}

export function getTimelineMaxScrollLeft(
  totalDuration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
) {
  return Math.max(0, getTimelineContentWidth(totalDuration, pixelsPerSecond, viewportWidth) - viewportWidth);
}

export function clampTimelineScrollLeft(
  scrollLeft: number,
  totalDuration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
) {
  return clamp(scrollLeft, 0, getTimelineMaxScrollLeft(totalDuration, pixelsPerSecond, viewportWidth));
}

export function clampTimelinePixelsPerSecond(pixelsPerSecond: number, dynamicMin?: number) {
  const floor = dynamicMin !== undefined ? Math.max(MIN_TIMELINE_PIXELS_PER_SECOND, dynamicMin) : MIN_TIMELINE_PIXELS_PER_SECOND;
  return clamp(pixelsPerSecond, floor, MAX_TIMELINE_PIXELS_PER_SECOND);
}

/**
 * Compute the minimum pixels-per-second that fits the entire project
 * duration within the given viewport width. Returns MIN_TIMELINE_PIXELS_PER_SECOND
 * when no duration/viewport info is provided.
 */
export function getMinZoomForProject(projectDurationSeconds: number, viewportWidth: number): number {
  if (projectDurationSeconds <= 0 || viewportWidth <= 0) return MIN_TIMELINE_PIXELS_PER_SECOND;
  // Exact fit: project fills the entire viewport width
  return Math.max(MIN_TIMELINE_PIXELS_PER_SECOND, viewportWidth / projectDurationSeconds);
}

export function getNextTimelineZoomLevel(
  currentPixelsPerSecond: number,
  direction: 'in' | 'out',
  options?: { projectDuration?: number; viewportWidth?: number },
) {
  const currentIdx = TIMELINE_ZOOM_LEVELS.findIndex((level) => level >= currentPixelsPerSecond);
  const safeIdx = currentIdx === -1 ? TIMELINE_ZOOM_LEVELS.length - 1 : currentIdx;

  if (direction === 'in') {
    return safeIdx < TIMELINE_ZOOM_LEVELS.length - 1
      ? TIMELINE_ZOOM_LEVELS[safeIdx + 1]
      : currentPixelsPerSecond;
  }

  // Compute dynamic floor: don't zoom out further than fitting the project
  const minZoom = options?.projectDuration && options?.viewportWidth
    ? getMinZoomForProject(options.projectDuration, options.viewportWidth)
    : MIN_TIMELINE_PIXELS_PER_SECOND;

  const nextLevel = safeIdx > 0 ? TIMELINE_ZOOM_LEVELS[safeIdx - 1] : currentPixelsPerSecond;
  return Math.max(nextLevel, minZoom);
}

export function getTimelineZoomAnchor(options: {
  pixelsPerSecond: number;
  scrollLeft: number;
  viewportWidth: number;
  pointerViewportX?: number;
  playheadTime?: number | null;
}) {
  const { pixelsPerSecond, scrollLeft, viewportWidth, pointerViewportX, playheadTime } = options;

  if (typeof pointerViewportX === 'number') {
    if (typeof playheadTime === 'number') {
      const playheadViewportX = playheadTime * pixelsPerSecond - scrollLeft;
      if (Math.abs(playheadViewportX - pointerViewportX) <= PLAYHEAD_ZOOM_ANCHOR_THRESHOLD_PX) {
        return {
          time: playheadTime,
          viewportX: clamp(playheadViewportX, 0, viewportWidth),
        };
      }
    }

    return {
      time: Math.max(0, (scrollLeft + pointerViewportX) / pixelsPerSecond),
      viewportX: clamp(pointerViewportX, 0, viewportWidth),
    };
  }

  if (typeof playheadTime === 'number') {
    const playheadViewportX = playheadTime * pixelsPerSecond - scrollLeft;
    if (playheadViewportX >= 0 && playheadViewportX <= viewportWidth) {
      return {
        time: playheadTime,
        viewportX: playheadViewportX,
      };
    }
  }

  return {
    time: Math.max(0, (scrollLeft + viewportWidth / 2) / pixelsPerSecond),
    viewportX: viewportWidth / 2,
  };
}

export function getZoomedTimelineViewport(
  currentViewport: TimelineViewportState,
  nextPixelsPerSecond: number,
  anchor: TimelineZoomAnchor,
) {
  const scrollLeft = clampTimelineScrollLeft(
    anchor.time * nextPixelsPerSecond - anchor.viewportX,
    currentViewport.totalDuration,
    nextPixelsPerSecond,
    currentViewport.viewportWidth,
  );

  return {
    pixelsPerSecond: nextPixelsPerSecond,
    scrollLeft,
  };
}

/**
 * Compute the auto-scroll viewport anchor for the playhead.
 *
 * On the first frame of auto-scrolling (previousAnchor === null), uses the
 * playhead's *current* viewport position (capped at the 35 % target) so
 * scrolling starts immediately instead of waiting for the playhead to walk
 * to the centre of the viewport.
 *
 * Once an anchor is established it is returned unchanged — it stays stable
 * for the entire playback session.
 */
export function computeAutoScrollAnchor(
  playheadViewportX: number,
  previousAnchor: number | null,
  viewportWidth: number,
): number {
  // Stable: return existing anchor once set
  if (previousAnchor !== null) return previousAnchor;

  const targetX = Math.min(
    Math.max(120, viewportWidth * 0.35),
    Math.max(120, viewportWidth - 96),
  );
  return clamp(playheadViewportX, 0, targetX);
}

export function getTimelineFitViewport(
  range: TimelineZoomRange,
  viewportWidth: number,
  totalDuration: number,
  options: TimelineFitOptions = {},
) {
  const minPixelsPerSecond = options.minPixelsPerSecond ?? MIN_TIMELINE_PIXELS_PER_SECOND;
  const maxPixelsPerSecond = options.maxPixelsPerSecond ?? MAX_TIMELINE_PIXELS_PER_SECOND;
  const paddingPx = options.paddingPx ?? 40;

  const duration = Math.max(0.001, range.endTime - range.startTime);
  const usableWidth = Math.max(1, viewportWidth - paddingPx * 2);
  const pixelsPerSecond = clamp(usableWidth / duration, minPixelsPerSecond, maxPixelsPerSecond);
  const scrollLeft = clampTimelineScrollLeft(
    range.startTime * pixelsPerSecond - paddingPx,
    totalDuration,
    pixelsPerSecond,
    viewportWidth,
  );

  return {
    pixelsPerSecond,
    scrollLeft,
  };
}

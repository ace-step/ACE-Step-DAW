export interface TimelineZoomRange {
  startTime: number;
  endTime: number;
}

interface TimelineFitOptions {
  minPixelsPerSecond?: number;
  maxPixelsPerSecond?: number;
  paddingPx?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTimelineFitViewport(
  range: TimelineZoomRange,
  viewportWidth: number,
  options: TimelineFitOptions = {},
) {
  const minPixelsPerSecond = options.minPixelsPerSecond ?? 10;
  const maxPixelsPerSecond = options.maxPixelsPerSecond ?? 500;
  const paddingPx = options.paddingPx ?? 40;

  const duration = Math.max(0.001, range.endTime - range.startTime);
  const usableWidth = Math.max(1, viewportWidth - paddingPx * 2);
  const pixelsPerSecond = clamp(usableWidth / duration, minPixelsPerSecond, maxPixelsPerSecond);
  const scrollLeft = Math.max(0, range.startTime * pixelsPerSecond - paddingPx);

  return {
    pixelsPerSecond,
    scrollLeft,
  };
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  getNextTimelineZoomLevel,
  getTimelineFitViewport,
  getTimelineZoomAnchor,
  TIMELINE_ZOOM_LEVELS,
  getZoomedTimelineViewport,
} from '../timelineZoom';

describe('timelineZoom', () => {
  it('clamps fit-to-project scroll so the right edge never overshoots the content width', () => {
    const viewport = getTimelineFitViewport(
      { startTime: 12, endTime: 16 },
      1200,
      16,
      { paddingPx: 40 },
    );

    expect(viewport.pixelsPerSecond).toBe(280);
    expect(viewport.scrollLeft).toBe(3280);
  });

  it('prefers the playhead anchor when the pointer is close to it', () => {
    const anchor = getTimelineZoomAnchor({
      pixelsPerSecond: DEFAULT_TIMELINE_PIXELS_PER_SECOND,
      scrollLeft: 200,
      viewportWidth: 1000,
      pointerViewportX: 320,
      playheadTime: 10.4,
    });

    expect(anchor.time).toBe(10.4);
    expect(anchor.viewportX).toBeCloseTo(320, 5);
  });

  it('falls back to the viewport center for keyboard zoom when the playhead is offscreen', () => {
    const anchor = getTimelineZoomAnchor({
      pixelsPerSecond: DEFAULT_TIMELINE_PIXELS_PER_SECOND,
      scrollLeft: 900,
      viewportWidth: 800,
      playheadTime: 2,
    });

    expect(anchor.time).toBeCloseTo(26, 5);
    expect(anchor.viewportX).toBe(400);
  });

  it('clamps zoomed scroll positions against the content boundary', () => {
    const viewport = getZoomedTimelineViewport(
      {
        pixelsPerSecond: DEFAULT_TIMELINE_PIXELS_PER_SECOND,
        scrollLeft: 3200,
        viewportWidth: 1200,
        totalDuration: 16,
      },
      200,
      {
        time: 16,
        viewportX: 1100,
      },
    );

    expect(viewport).toEqual({
      pixelsPerSecond: 200,
      scrollLeft: 2000,
    });
  });

  it('steps through discrete zoom levels', () => {
    expect(getNextTimelineZoomLevel(50, 'in')).toBe(60);
    expect(getNextTimelineZoomLevel(50, 'out')).toBe(40);
    expect(getNextTimelineZoomLevel(100, 'in')).toBe(110);
    expect(getNextTimelineZoomLevel(100, 'out')).toBe(90);
    expect(getNextTimelineZoomLevel(500, 'in')).toBe(500);
  });

  it('exposes fifty zoom steps for footer controls', () => {
    expect(TIMELINE_ZOOM_LEVELS).toHaveLength(50);
  });
});

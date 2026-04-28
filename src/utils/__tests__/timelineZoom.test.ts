import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  getNextTimelineZoomLevel,
  getTimelineFitViewport,
  getTimelineZoomAnchor,
  TIMELINE_ZOOM_LEVELS,
  getZoomedTimelineViewport,
  computeAutoScrollAnchor,
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
    expect(getNextTimelineZoomLevel(500, 'in')).toBe(550);
    expect(getNextTimelineZoomLevel(2000, 'in')).toBe(2000);
  });

  it('exposes zoom steps covering the full range up to deep zoom', () => {
    expect(TIMELINE_ZOOM_LEVELS.length).toBeGreaterThanOrEqual(50);
    expect(TIMELINE_ZOOM_LEVELS[0]).toBe(2);
    expect(TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1]).toBe(2000);
  });

  it('allows beatPx ≥ 640 at 120 BPM for 1/64 subdivision visibility', () => {
    const maxPps = TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1];
    const beatPxAt120 = maxPps * (60 / 120);
    expect(beatPxAt120).toBeGreaterThanOrEqual(640);
  });
});

describe('computeAutoScrollAnchor', () => {
  const viewportWidth = 1200;

  it('uses playhead current viewport position when left of target (avoids walking-to-center)', () => {
    const anchor = computeAutoScrollAnchor(100, null, viewportWidth);
    expect(anchor).toBe(100);
  });

  it('caps anchor at target position when playhead is right of target', () => {
    const anchor = computeAutoScrollAnchor(800, null, viewportWidth);
    const targetX = Math.min(
      Math.max(120, viewportWidth * 0.35),
      Math.max(120, viewportWidth - 96),
    );
    expect(anchor).toBe(targetX);
  });

  it('returns existing anchor unchanged when already set (stable during playback)', () => {
    const anchor = computeAutoScrollAnchor(100, 200, viewportWidth);
    expect(anchor).toBe(200);
  });

  it('clamps anchor to 0 minimum when playhead is at negative viewport position', () => {
    const anchor = computeAutoScrollAnchor(-50, null, viewportWidth);
    expect(anchor).toBe(0);
  });

  it('uses small anchor at timeline start so scrolling begins immediately', () => {
    const anchor = computeAutoScrollAnchor(0, null, viewportWidth);
    expect(anchor).toBe(0);
  });
});

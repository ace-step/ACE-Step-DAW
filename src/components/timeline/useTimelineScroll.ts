import { useRef, useCallback, useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { toastInfo } from '../../hooks/useToast';
import {
  clampTimelineScrollLeft,
  clampTimelinePixelsPerSecond,
  computeAutoScrollAnchor,
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  getMinZoomForProject,
  getNextTimelineZoomLevel,
  getTimelineContentWidth,
  getTimelineFitViewport,
  getTimelineZoomAnchor,
  getZoomedTimelineViewport,
} from '../../utils/timelineZoom';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import type { Track } from '../../types/project';

const EMPTY_TRACKS: Track[] = [];

/**
 * Encapsulates timeline zoom, auto-scroll, resize-observer, and wheel handling.
 *
 * Returns:
 * - `mergedScrollRef` — callback ref to attach to the scroll container
 * - `viewportWidth` — the measured timeline viewport width (excluding track list)
 * - `totalWidth` — the computed content width
 */
export function useTimelineScroll(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const setTimelineViewportWidth = useUIStore((s) => s.setTimelineViewportWidth);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const timelineZoomRequest = useUIStore((s) => s.timelineZoomRequest);
  const autoScrollEnabled = useUIStore((s) => s.autoScrollEnabled);
  const setScrollX = useUIStore((s) => s.setScrollX);
  const currentTime = useTransportStore((s) => s.currentTime);
  const playStartTime = useTransportStore((s) => s.playStartTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const [viewportWidth, setViewportWidth] = useState(0);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const zoomTargetRef = useRef(pixelsPerSecond);
  const zoomAnchorRef = useRef<{ time: number; viewportX: number } | null>(null);
  const zoomFrameTimeRef = useRef<number | null>(null);
  const handledTimelineZoomRequestIdRef = useRef<number | null>(null);
  const autoScrollAnchorRef = useRef<number | null>(null);

  const totalWidth = hasProject
    ? getTimelineContentWidth(totalDuration, pixelsPerSecond, viewportWidth)
    : 0;

  // --- Zoom request effect (toolbar zoom buttons, keyboard shortcuts) ---
  useEffect(() => {
    if (!hasProject || !timelineZoomRequest || !scrollRef.current) return;
    if (handledTimelineZoomRequestIdRef.current === timelineZoomRequest.id) return;

    const container = scrollRef.current;
    const nextViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);
    const projectRange = { startTime: 0, endTime: totalDuration };
    handledTimelineZoomRequestIdRef.current = timelineZoomRequest.id;

    let targetRange = projectRange;
    let usedFallback = false;

    if (timelineZoomRequest.mode === 'selection') {
      const selectedClips = tracks
        .flatMap((track) => track.clips)
        .filter((clip) => selectedClipIds.has(clip.id));

      if (selectedClips.length > 0) {
        targetRange = {
          startTime: Math.min(...selectedClips.map((clip) => clip.startTime)),
          endTime: Math.max(...selectedClips.map((clip) => clip.startTime + clip.duration)),
        };
      } else if (selectWindow) {
        targetRange = {
          startTime: selectWindow.startTime,
          endTime: selectWindow.endTime,
        };
      } else {
        usedFallback = true;
      }
    }

    if (timelineZoomRequest.mode === 'stepIn'
      || timelineZoomRequest.mode === 'stepOut'
      || timelineZoomRequest.mode === 'reset') {
      const nextPixelsPerSecond = timelineZoomRequest.mode === 'reset'
        ? DEFAULT_TIMELINE_PIXELS_PER_SECOND
        : getNextTimelineZoomLevel(
            pixelsPerSecond,
            timelineZoomRequest.mode === 'stepIn' ? 'in' : 'out',
            { projectDuration: totalDuration, viewportWidth: nextViewportWidth },
          );

      if (nextPixelsPerSecond === pixelsPerSecond) return;

      const playheadAnchorTime = isPlaying ? currentTime : playStartTime;
      const anchor = getTimelineZoomAnchor({
        pixelsPerSecond,
        scrollLeft: container.scrollLeft,
        viewportWidth: nextViewportWidth,
        playheadTime: playheadAnchorTime,
      });
      const nextViewport = getZoomedTimelineViewport({
        pixelsPerSecond,
        scrollLeft: container.scrollLeft,
        viewportWidth: nextViewportWidth,
        totalDuration,
      }, nextPixelsPerSecond, anchor);

      setPixelsPerSecond(nextViewport.pixelsPerSecond);
      setScrollX(nextViewport.scrollLeft);
      container.scrollLeft = nextViewport.scrollLeft;
      return;
    }

    const nextViewport = getTimelineFitViewport(targetRange, nextViewportWidth, totalDuration, {
      paddingPx: timelineZoomRequest.mode === 'project' ? 0 : 40,
    });
    setPixelsPerSecond(nextViewport.pixelsPerSecond);
    setScrollX(nextViewport.scrollLeft);
    container.scrollLeft = nextViewport.scrollLeft;

    if (usedFallback) {
      toastInfo('Nothing is selected, so the timeline zoomed to the full project.');
    }
  }, [
    currentTime,
    hasProject,
    isPlaying,
    pixelsPerSecond,
    playStartTime,
    selectWindow,
    selectedClipIds,
    setPixelsPerSecond,
    setScrollX,
    totalDuration,
    trackListWidth,
    tracks,
    timelineZoomRequest,
    scrollRef,
  ]);

  // Reset auto-scroll anchor when playback stops or auto-scroll is disabled
  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled) {
      autoScrollAnchorRef.current = null;
    }
  }, [isPlaying, autoScrollEnabled]);

  // --- Auto-scroll during playback ---
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !hasProject || !isPlaying || !autoScrollEnabled) return;

    const timelineViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);

    // Compute the viewport-x anchor for the playhead. On the first frame
    // this captures where the playhead currently sits so the view scrolls
    // immediately instead of waiting for the playhead to walk to 35 %.
    const playheadViewportX = currentTime * pixelsPerSecond - container.scrollLeft;
    autoScrollAnchorRef.current = computeAutoScrollAnchor(
      playheadViewportX,
      autoScrollAnchorRef.current,
      timelineViewportWidth,
    );

    const nextScrollLeft = clampTimelineScrollLeft(
      currentTime * pixelsPerSecond - autoScrollAnchorRef.current,
      totalDuration,
      pixelsPerSecond,
      timelineViewportWidth,
    );

    if (Math.abs(container.scrollLeft - nextScrollLeft) < 1) return;
    container.scrollLeft = nextScrollLeft;
    setScrollX(nextScrollLeft);
  }, [autoScrollEnabled, currentTime, hasProject, isPlaying, pixelsPerSecond, setScrollX, totalDuration, trackListWidth, scrollRef]);

  // --- Wheel zoom (trackpad pinch / Cmd+scroll) ---
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const container = scrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const target = e.target as HTMLElement | null;
        const isTrackColumnTarget = !!target?.closest?.('[data-track-column-region="true"]');
        const timelineViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);
        const cursorOffsetX = isTrackColumnTarget
          ? Math.min(120, timelineViewportWidth - 1)
          : Math.max(0, Math.min(timelineViewportWidth - 1, e.clientX - rect.left - trackListWidth));
        const playheadAnchorTime = isPlaying ? currentTime : playStartTime;
        const anchor = getTimelineZoomAnchor({
          pixelsPerSecond,
          scrollLeft: container.scrollLeft,
          viewportWidth: timelineViewportWidth,
          pointerViewportX: cursorOffsetX,
          playheadTime: playheadAnchorTime,
        });

        const normalizedDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * 18
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? e.deltaY * (container.clientHeight || window.innerHeight || 1)
            : e.deltaY;
        const sensitivity = e.ctrlKey && !e.metaKey ? 0.0065 : 0.0042;
        const zoomFactor = Math.exp(-normalizedDelta * sensitivity);
        const currentBase = zoomAnimationFrameRef.current === null
          ? pixelsPerSecond
          : zoomTargetRef.current;
        const dynamicMin = totalDuration > 0 ? getMinZoomForProject(totalDuration, timelineViewportWidth) : undefined;
        zoomTargetRef.current = clampTimelinePixelsPerSecond(currentBase * zoomFactor, dynamicMin);
        zoomAnchorRef.current = anchor;

        if (zoomAnimationFrameRef.current !== null) {
          return;
        }

        const animateZoom = (timestamp: number) => {
          const liveContainer = scrollRef.current;
          const liveAnchor = zoomAnchorRef.current;
          if (!liveContainer || !liveAnchor) {
            zoomAnimationFrameRef.current = null;
            zoomFrameTimeRef.current = null;
            return;
          }

          const dt = zoomFrameTimeRef.current === null ? 16 : Math.max(8, timestamp - zoomFrameTimeRef.current);
          zoomFrameTimeRef.current = timestamp;
          const currentPixels = useUIStore.getState().pixelsPerSecond;
          const alpha = 1 - Math.exp(-dt / 42);
          const nextPixelsPerSecond = Math.abs(zoomTargetRef.current - currentPixels) < 0.02
            ? zoomTargetRef.current
            : currentPixels + (zoomTargetRef.current - currentPixels) * alpha;

          const nextViewport = getZoomedTimelineViewport({
            pixelsPerSecond: currentPixels,
            scrollLeft: liveContainer.scrollLeft,
            viewportWidth: Math.max(1, (liveContainer.clientWidth - trackListWidth) || window.innerWidth || 1),
            totalDuration,
          }, nextPixelsPerSecond, liveAnchor);

          setPixelsPerSecond(nextViewport.pixelsPerSecond);
          setScrollX(nextViewport.scrollLeft);
          liveContainer.scrollLeft = nextViewport.scrollLeft;

          if (Math.abs(zoomTargetRef.current - nextPixelsPerSecond) < 0.02) {
            zoomAnimationFrameRef.current = null;
            zoomFrameTimeRef.current = null;
            return;
          }

          zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
        };

        zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
      }
    },
    [currentTime, isPlaying, pixelsPerSecond, playStartTime, setPixelsPerSecond, setScrollX, totalDuration, trackListWidth, scrollRef],
  );

  // Cancel zoom animation on unmount
  useEffect(() => () => {
    if (zoomAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomAnimationFrameRef.current);
    }
  }, []);

  // --- Viewport width measurement via ResizeObserver ---
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateViewportWidth = () => {
      const nextWidth = Math.max(0, (container.clientWidth - trackListWidth) || window.innerWidth || 0);
      setViewportWidth(nextWidth);
      setTimelineViewportWidth(nextWidth);
    };
    updateViewportWidth();

    const ro = new ResizeObserver(updateViewportWidth);
    ro.observe(container);
    return () => ro.disconnect();
  }, [setTimelineViewportWidth, trackListWidth, scrollRef]);

  // Non-passive wheel listener so preventDefault() works for trackpad pinch-zoom
  const wheelRef = useNonPassiveWheel(handleWheel);

  // Merge scrollRef (used throughout) with wheelRef (callback ref from hook)
  const mergedScrollRef = useCallback((el: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    wheelRef(el);
  }, [wheelRef, scrollRef]);

  return { mergedScrollRef, viewportWidth, totalWidth };
}

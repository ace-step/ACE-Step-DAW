import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import type { Track } from '../../types/project';
import { snapToGrid } from '../../utils/time';
import { convertTimelineWindowMode, moveTimelineWindow, type TimelineWindowRange } from './timelineWindowUtils';

const DRAG_THRESHOLD_PX = 4;
const EMPTY_TRACKS: Track[] = [];

interface DragRect { left: number; width: number; top: number; height: number }

function getIntersectedTrackIds(container: HTMLElement, minY: number, maxY: number): string[] {
  const lanes = container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]');
  const cRect = container.getBoundingClientRect();
  const ids: string[] = [];
  for (const lane of lanes) {
    const r = lane.getBoundingClientRect();
    const laneTop = r.top - cRect.top + container.scrollTop;
    const laneBot = laneTop + r.height;
    if (laneBot > minY && laneTop < maxY) {
      ids.push(lane.dataset.trackId!);
    }
  }
  return ids;
}

function getTrackRowIndex(container: HTMLElement, trackId: string): number | null {
  const lanes = Array.from(container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]'));
  const rowIndex = lanes.findIndex((lane) => lane.dataset.trackId === trackId);
  return rowIndex === -1 ? null : rowIndex;
}

function getTrackVerticalRange(
  container: HTMLElement, trackIds: string[],
): { top: number; height: number } | null {
  if (trackIds.length === 0) return null;
  const cRect = container.getBoundingClientRect();
  let minTop = Infinity;
  let maxBot = -Infinity;
  const idSet = new Set(trackIds);
  const lanes = container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]');
  for (const lane of lanes) {
    if (!idSet.has(lane.dataset.trackId!)) continue;
    const r = lane.getBoundingClientRect();
    const laneTop = r.top - cRect.top + container.scrollTop;
    const laneBot = laneTop + r.height;
    if (laneTop < minTop) minTop = laneTop;
    if (laneBot > maxBot) maxBot = laneBot;
  }
  if (minTop === Infinity) return null;
  return { top: minTop, height: maxBot - minTop };
}

// Re-export for use by Timeline.tsx render logic
export { getTrackVerticalRange };

/**
 * Encapsulates timeline mouse-drag selection (select window / context window),
 * window move, and window switch logic.
 */
export function useTimelineDragSelection(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  trackAreaRef: React.RefObject<HTMLDivElement | null>,
) {
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const seek = useTransportStore((s) => s.seek);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setTimelineFocused = useUIStore((s) => s.setTimelineFocused);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setContextWindow = useUIStore((s) => s.setContextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const selectClips = useUIStore((s) => s.selectClips);
  const deselectAllTracks = useUIStore((s) => s.deselectAllTracks);
  const selectTrack = useUIStore((s) => s.selectTrack);

  const [ctxDrag, setCtxDrag] = useState<DragRect | null>(null);
  const [selDrag, setSelDrag] = useState<DragRect | null>(null);

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-window-overlay-control="true"]')) return;
      if (target.closest?.('[data-clip-block]')) return;
      if (target.closest?.('[data-track-column-region="true"]')) return;
      if (target.closest?.('.fixed')) return;
      if (target.closest?.('[data-sequencer-grid]')) return;
      if (target.closest?.('[data-timeline-scrubber="true"]')) return;
      if (target.closest?.('[data-testid="arrangement-markers"]')) return;

      const isCtx = e.altKey;
      const isSel = !isCtx;

      e.preventDefault();
      e.stopPropagation();

      const container = scrollRef.current;
      const trackArea = trackAreaRef.current;
      if (!container || !trackArea) return;

      const scrollLeft = container.scrollLeft;
      const cRect = container.getBoundingClientRect();
      const timelineRectLeft = cRect.left + trackListWidth;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startViewX = startClientX - timelineRectLeft;
      const startViewY = startClientY - cRect.top + container.scrollTop;
      const primaryTrackId = getIntersectedTrackIds(container, startViewY, startViewY + 1)[0];

      let hasDragged = false;
      const setDrag = isCtx ? setCtxDrag : setSelDrag;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        hasDragged = true;

        const curViewX = ev.clientX - timelineRectLeft;
        const curViewY = ev.clientY - cRect.top + container.scrollTop;

        const left = Math.min(startViewX, curViewX) + scrollLeft;
        const width = Math.abs(curViewX - startViewX);

        const minY = Math.min(startViewY, curViewY);
        const maxY = Math.max(startViewY, curViewY);

        const vRange = getTrackVerticalRange(
          container, getIntersectedTrackIds(container, minY, maxY),
        );
        const trackAreaTop = trackArea.getBoundingClientRect().top - cRect.top + container.scrollTop;
        const top = vRange ? vRange.top - trackAreaTop : minY - trackAreaTop;
        const height = vRange ? vRange.height : maxY - minY;
        setDrag({ left, width, top, height });
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!hasDragged) {
          setDrag(null);
          // Click without drag -> seek playhead + select the clicked track row
          const time = (startViewX + scrollLeft) / pixelsPerSecond;
          seek(time);
          setTimelineFocused(true);
          // Find and select the track row at the click Y position
          const clickedIds = getIntersectedTrackIds(container, startViewY, startViewY + 1);
          if (clickedIds.length > 0) {
            selectTrack(clickedIds[0], ev.metaKey || ev.ctrlKey);
          } else {
            deselectAllTracks();
          }
          return;
        }

        const endViewX = ev.clientX - timelineRectLeft;
        const endViewY = ev.clientY - cRect.top + container.scrollTop;

        const leftPx = Math.min(startViewX, endViewX) + scrollLeft;
        const rightPx = Math.max(startViewX, endViewX) + scrollLeft;
        const minY = Math.min(startViewY, endViewY);
        const maxY = Math.max(startViewY, endViewY);

        const rawStart = leftPx / pixelsPerSecond;
        const rawEnd = rightPx / pixelsPerSecond;
        const startTime = Math.max(0, snapToGrid(rawStart, bpm, 1));
        const endTime = snapToGrid(rawEnd, bpm, 1);
        const trackIds = getIntersectedTrackIds(container, minY, maxY);

        if (endTime > startTime && trackIds.length > 0) {
          if (isCtx) {
            setContextWindow({ startTime, endTime, trackIds });
          } else {
            const nextSelectWindow: TimelineWindowRange = {
              startTime,
              endTime,
              trackIds,
            };
            if (primaryTrackId !== undefined) {
              nextSelectWindow.primaryTrackId = primaryTrackId;
              const targetRowIndex = getTrackRowIndex(container, primaryTrackId);
              if (targetRowIndex !== null) {
                nextSelectWindow.targetRowIndex = targetRowIndex;
              }
            }
            setSelectWindow(nextSelectWindow);
            seek(startTime);

            // Auto-select all clips overlapping the select window
            const overlappingClipIds: string[] = [];
            const trackIdSet = new Set(trackIds);
            for (const track of tracks) {
              if (!trackIdSet.has(track.id)) continue;
              for (const clip of track.clips) {
                const clipEnd = clip.startTime + clip.duration;
                if (clipEnd > startTime && clip.startTime < endTime) {
                  overlappingClipIds.push(clip.id);
                }
              }
            }
            if (overlappingClipIds.length > 0) {
              selectClips(overlappingClipIds);
            }
          }
        }
        setDrag(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bpm, pixelsPerSecond, setContextWindow, setSelectWindow, deselectAllTracks, selectTrack, selectClips, seek, setTimelineFocused, trackListWidth, tracks, scrollRef, trackAreaRef],
  );

  const startWindowMove = useCallback(
    (
      kind: 'select' | 'context',
      windowRange: TimelineWindowRange,
      e: React.MouseEvent<HTMLDivElement>,
    ) => {
      if (e.button !== 0) return;

      const container = scrollRef.current;
      if (!container || !hasProject) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const timelineRectLeft = rect.left + trackListWidth;
      const setWindow = kind === 'context' ? setContextWindow : setSelectWindow;
      const pointerTimeAtStart = (e.clientX - timelineRectLeft + container.scrollLeft) / pixelsPerSecond;
      const pointerOffsetTime = pointerTimeAtStart - windowRange.startTime;

      // Track vertical state for cross-track movement
      const startClientY = e.clientY;
      const initialVRange = getTrackVerticalRange(container, windowRange.trackIds);
      const initialWindowHeight = initialVRange ? initialVRange.height : 0;

      let currentWindow = windowRange;

      const applyMove = (clientX: number, clientY: number) => {
        const pointerTime = (clientX - timelineRectLeft + container.scrollLeft) / pixelsPerSecond;
        const desiredStartTime = snapToGrid(pointerTime - pointerOffsetTime, bpm, 1);

        // Calculate vertical delta and find new track set
        const deltaY = clientY - startClientY;
        if (initialVRange) {
          const newTop = initialVRange.top + deltaY;
          const newBottom = newTop + initialWindowHeight;
          const newTrackIds = getIntersectedTrackIds(container, newTop, newBottom);
          if (newTrackIds.length > 0) {
            currentWindow = {
              ...currentWindow,
              trackIds: newTrackIds,
              primaryTrackId: newTrackIds[0],
            };
          }
        }

        const moved = moveTimelineWindow(currentWindow, desiredStartTime, totalDuration);
        currentWindow = moved;
        setWindow(moved);
      };

      const onMouseMove = (ev: MouseEvent) => {
        applyMove(ev.clientX, ev.clientY);
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        applyMove(ev.clientX, ev.clientY);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bpm, hasProject, pixelsPerSecond, setContextWindow, setSelectWindow, totalDuration, trackListWidth, scrollRef],
  );

  const switchTimelineWindow = useCallback(
    (kind: 'select' | 'context') => {
      const nextWindows = convertTimelineWindowMode(kind, { selectWindow, contextWindow });
      setSelectWindow(nextWindows.selectWindow);
      setContextWindow(nextWindows.contextWindow);
    },
    [contextWindow, selectWindow, setContextWindow, setSelectWindow],
  );

  return {
    ctxDrag,
    selDrag,
    handleMouseDownCapture,
    startWindowMove,
    switchTimelineWindow,
  };
}

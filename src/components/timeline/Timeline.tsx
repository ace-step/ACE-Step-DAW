import { useRef, useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { snapToGrid } from '../../utils/time';
import { MultiTrackGenerateModal } from '../generation/MultiTrackGenerateModal';

export const TRACK_INSPECTOR_HEIGHT = 220; // px — must match TrackInspector height

const DRAG_THRESHOLD_PX = 4;

interface DragRect { left: number; width: number; top: number; height: number }

function getIntersectedTrackIds(container: HTMLElement, minY: number, maxY: number): string[] {
  const lanes = container.querySelectorAll<HTMLElement>('[data-track-id]');
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

function getTrackVerticalRange(
  container: HTMLElement, trackIds: string[],
): { top: number; height: number } | null {
  if (trackIds.length === 0) return null;
  const cRect = container.getBoundingClientRect();
  let minTop = Infinity;
  let maxBot = -Infinity;
  const idSet = new Set(trackIds);
  const lanes = container.querySelectorAll<HTMLElement>('[data-track-id]');
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

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setContextWindow = useUIStore((s) => s.setContextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const expandedTrackId = useUIStore((s) => s.expandedTrackId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const [ctxDrag, setCtxDrag] = useState<DragRect | null>(null);
  const [selDrag, setSelDrag] = useState<DragRect | null>(null);

  const sortedTracks = project
    ? [...project.tracks].sort((a, b) => a.order - b.order)
    : [];

  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
        const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= pixelsPerSecond);
        if (e.deltaY < 0 && currentIdx < ZOOM_LEVELS.length - 1) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx + 1]);
        } else if (e.deltaY > 0 && currentIdx > 0) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx - 1]);
        }
      }
    },
    [pixelsPerSecond, setPixelsPerSecond],
  );

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-clip-block]')) return;
      if (target.closest?.('.fixed')) return;

      const isCtx = e.metaKey || e.ctrlKey;

      e.preventDefault();
      e.stopPropagation();

      const container = scrollRef.current;
      const trackArea = trackAreaRef.current;
      if (!container || !trackArea) return;

      const bpm = project?.bpm ?? 120;
      const scrollLeft = container.scrollLeft;
      const cRect = container.getBoundingClientRect();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startViewX = startClientX - cRect.left;
      const startViewY = startClientY - cRect.top + container.scrollTop;

      let hasDragged = false;
      const setDrag = isCtx ? setCtxDrag : setSelDrag;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        hasDragged = true;

        const curViewX = ev.clientX - cRect.left;
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
          return;
        }

        const endViewX = ev.clientX - cRect.left;
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
            setSelectWindow({ startTime, endTime, trackIds });
          }
        }
        setDrag(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pixelsPerSecond, project, setContextWindow, setSelectWindow],
  );


  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Create a new project to get started
      </div>
    );
  }

  const ctxLeft = contextWindow ? contextWindow.startTime * pixelsPerSecond : null;
  const ctxWidth = contextWindow
    ? (contextWindow.endTime - contextWindow.startTime) * pixelsPerSecond
    : null;
  const ctxVRange = contextWindow && scrollRef.current && trackAreaRef.current
    ? (() => {
        const vr = getTrackVerticalRange(scrollRef.current!, contextWindow.trackIds);
        if (!vr) return null;
        const cRect = scrollRef.current!.getBoundingClientRect();
        const taTop = trackAreaRef.current!.getBoundingClientRect().top - cRect.top + scrollRef.current!.scrollTop;
        return { top: vr.top - taTop, height: vr.height };
      })()
    : null;

  const selLeft = selectWindow ? selectWindow.startTime * pixelsPerSecond : null;
  const selWidth = selectWindow
    ? (selectWindow.endTime - selectWindow.startTime) * pixelsPerSecond
    : null;
  const selVRange = selectWindow && scrollRef.current && trackAreaRef.current
    ? (() => {
        const vr = getTrackVerticalRange(scrollRef.current!, selectWindow.trackIds);
        if (!vr) return null;
        const cRect = scrollRef.current!.getBoundingClientRect();
        const taTop = trackAreaRef.current!.getBoundingClientRect().top - cRect.top + scrollRef.current!.scrollTop;
        return { top: vr.top - taTop, height: vr.height };
      })()
    : null;

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-daw-bg"
        onWheel={handleWheel}
        onMouseDownCapture={handleMouseDownCapture}
        style={{ cursor: 'default' }}
      >
        <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
          <TimeRuler />

          <div ref={trackAreaRef} className="relative">
            <GridOverlay />
            <Playhead />

            {/* Committed context window overlay — scoped to selected track lanes */}
            {ctxLeft !== null && ctxWidth !== null && ctxVRange && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: ctxLeft,
                  width: ctxWidth,
                  top: ctxVRange.top,
                  height: ctxVRange.height,
                  background: 'rgba(59, 130, 246, 0.10)',
                  borderLeft: '2px solid rgba(96, 165, 250, 0.7)',
                  borderRight: '2px solid rgba(96, 165, 250, 0.7)',
                  borderTop: '2px solid rgba(96, 165, 250, 0.4)',
                  borderBottom: '2px solid rgba(96, 165, 250, 0.4)',
                }}
              >
                <span
                  className="absolute top-0.5 left-1 text-[9px] font-mono text-blue-300 select-none"
                  style={{ background: 'rgba(30,30,50,0.7)', padding: '0 3px', borderRadius: 3 }}
                >
                  context window
                </span>
              </div>
            )}

            {/* Committed select window overlay — scoped to selected track lanes */}
            {selLeft !== null && selWidth !== null && selVRange && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: selLeft,
                  width: selWidth,
                  top: selVRange.top,
                  height: selVRange.height,
                  background: 'rgba(251, 146, 60, 0.10)',
                  borderLeft: '2px solid rgba(251, 146, 60, 0.7)',
                  borderRight: '2px solid rgba(251, 146, 60, 0.7)',
                  borderTop: '2px solid rgba(251, 146, 60, 0.4)',
                  borderBottom: '2px solid rgba(251, 146, 60, 0.4)',
                }}
              >
                <span
                  className="absolute top-0.5 right-1 text-[9px] font-mono text-orange-300 select-none"
                  style={{ background: 'rgba(30,30,50,0.7)', padding: '0 3px', borderRadius: 3 }}
                >
                  select window
                </span>
              </div>
            )}

            {/* Live context drag overlay (blue) — vertically scoped */}
            {ctxDrag && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: ctxDrag.left,
                  width: ctxDrag.width,
                  top: ctxDrag.top,
                  height: ctxDrag.height,
                  background: 'rgba(59, 130, 246, 0.15)',
                  borderLeft: '1px solid rgba(96, 165, 250, 0.5)',
                  borderRight: '1px solid rgba(96, 165, 250, 0.5)',
                  borderTop: '1px solid rgba(96, 165, 250, 0.3)',
                  borderBottom: '1px solid rgba(96, 165, 250, 0.3)',
                }}
              />
            )}

            {/* Live select drag overlay (orange) — vertically scoped */}
            {selDrag && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: selDrag.left,
                  width: selDrag.width,
                  top: selDrag.top,
                  height: selDrag.height,
                  background: 'rgba(251, 146, 60, 0.15)',
                  borderLeft: '1px solid rgba(251, 146, 60, 0.5)',
                  borderRight: '1px solid rgba(251, 146, 60, 0.5)',
                  borderTop: '1px solid rgba(251, 146, 60, 0.3)',
                  borderBottom: '1px solid rgba(251, 146, 60, 0.3)',
                }}
              />
            )}

            {sortedTracks.map((track) => (
              <div key={track.id}>
                <TrackLane track={track} />
                {expandedTrackId === track.id && (
                  <div
                    className="border-b border-daw-border bg-zinc-950/60"
                    style={{ height: TRACK_INSPECTOR_HEIGHT }}
                  />
                )}
              </div>
            ))}

            {sortedTracks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
                Add a track to begin
              </div>
            )}
          </div>
        </div>
      </div>

      {selectWindow && (
        <MultiTrackGenerateModal
          selectWindow={selectWindow}
          contextWindow={contextWindow}
          onClose={() => {
            setSelectWindow(null);
          }}
        />
      )}
    </>
  );
}

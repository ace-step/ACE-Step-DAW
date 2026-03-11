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

  // Cmd+drag live selection state (blue = context)
  const [ctxDrag, setCtxDrag] = useState<{ left: number; width: number } | null>(null);
  // Non-Cmd drag live selection state (orange = select)
  const [selDrag, setSelDrag] = useState<{ left: number; width: number } | null>(null);
  // Show multi-track modal
  const [showMultiTrackModal, setShowMultiTrackModal] = useState(false);

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

  // Drag handler (capture phase so it fires before children):
  //   Cmd+drag  = context window (blue)
  //   plain drag = select window (orange) — works across all track lanes
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      // Skip if the click landed on a clip element (clips handle their own move/resize)
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-clip-block]')) return;

      const isCtx = e.metaKey || e.ctrlKey;

      e.preventDefault();

      const container = scrollRef.current;
      if (!container) return;

      const bpm = project?.bpm ?? 120;
      const scrollLeft = container.scrollLeft;
      const rect = container.getBoundingClientRect();
      const startClientX = e.clientX;
      const startViewX = startClientX - rect.left;

      let hasDragged = false;
      const setDrag = isCtx ? setCtxDrag : setSelDrag;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        hasDragged = true;

        const curViewX = ev.clientX - rect.left;
        const left = Math.min(startViewX, curViewX) + scrollLeft;
        const width = Math.abs(curViewX - startViewX);
        setDrag({ left, width });
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!hasDragged) {
          setDrag(null);
          return;
        }

        const endViewX = ev.clientX - rect.left;
        const leftPx = Math.min(startViewX, endViewX) + scrollLeft;
        const rightPx = Math.max(startViewX, endViewX) + scrollLeft;

        const rawStart = leftPx / pixelsPerSecond;
        const rawEnd = rightPx / pixelsPerSecond;
        const startTime = Math.max(0, snapToGrid(rawStart, bpm, 1));
        const endTime = snapToGrid(rawEnd, bpm, 1);

        if (endTime > startTime) {
          if (isCtx) {
            setContextWindow({ startTime, endTime });
          } else {
            setSelectWindow({ startTime, endTime });
            setShowMultiTrackModal(true);
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

  // Context window pixels (for the persistent overlay once committed)
  const ctxLeft = contextWindow ? contextWindow.startTime * pixelsPerSecond : null;
  const ctxWidth = contextWindow
    ? (contextWindow.endTime - contextWindow.startTime) * pixelsPerSecond
    : null;

  // Select window pixels (for the persistent overlay once committed)
  const selLeft = selectWindow ? selectWindow.startTime * pixelsPerSecond : null;
  const selWidth = selectWindow
    ? (selectWindow.endTime - selectWindow.startTime) * pixelsPerSecond
    : null;

  // Live drag overlay pixels (relative to scroll container viewport)
  const dragLeft = ctxDrag ? ctxDrag.left : null;
  const dragWidth = ctxDrag ? ctxDrag.width : null;
  const selDragLeft = selDrag ? selDrag.left : null;
  const selDragWidth = selDrag ? selDrag.width : null;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto bg-daw-bg"
      onWheel={handleWheel}
      onMouseDownCapture={handleMouseDown}
      style={{ cursor: 'default' }}
    >
      <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
        <TimeRuler />

        <div className="relative">
          <GridOverlay />
          <Playhead />

          {/* Committed context window overlay — spans all track lanes */}
          {ctxLeft !== null && ctxWidth !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: ctxLeft,
                width: ctxWidth,
                background: 'rgba(59, 130, 246, 0.10)',
                borderLeft: '2px solid rgba(96, 165, 250, 0.7)',
                borderRight: '2px solid rgba(96, 165, 250, 0.7)',
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

          {/* Committed select window overlay — spans all track lanes (orange) */}
          {selLeft !== null && selWidth !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: selLeft,
                width: selWidth,
                background: 'rgba(251, 146, 60, 0.10)',
                borderLeft: '2px solid rgba(251, 146, 60, 0.7)',
                borderRight: '2px solid rgba(251, 146, 60, 0.7)',
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

          {/* Live context drag overlay (blue) */}
          {dragLeft !== null && dragWidth !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: dragLeft,
                width: dragWidth,
                background: 'rgba(59, 130, 246, 0.15)',
                borderLeft: '1px solid rgba(96, 165, 250, 0.5)',
                borderRight: '1px solid rgba(96, 165, 250, 0.5)',
              }}
            />
          )}

          {/* Live select drag overlay (orange) */}
          {selDragLeft !== null && selDragWidth !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: selDragLeft,
                width: selDragWidth,
                background: 'rgba(251, 146, 60, 0.15)',
                borderLeft: '1px solid rgba(251, 146, 60, 0.5)',
                borderRight: '1px solid rgba(251, 146, 60, 0.5)',
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

      {/* Multi-track generation modal — opens after select window drag */}
      {showMultiTrackModal && selectWindow && (
        <MultiTrackGenerateModal
          selectWindow={selectWindow}
          contextWindow={contextWindow}
          onClose={() => {
            setShowMultiTrackModal(false);
            setSelectWindow(null);
          }}
        />
      )}
    </div>
  );
}

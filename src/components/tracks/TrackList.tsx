import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TrackHeader } from './TrackHeader';
import { TrackListDisplayToggle } from './TrackListDisplayToggle';
import {
  ARRANGEMENT_MARKERS_HEIGHT,
  TEMPO_LANE_HEIGHT,
  TIME_SIGNATURE_LANE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
} from '../timeline/timelineLayout';

export function TrackList() {
  const project = useProjectStore((s) => s.project);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const getVisibleTracks = useProjectStore((s) => s.getVisibleTracks);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const trackListDisplayMode = useUIStore((s) => s.trackListDisplayMode);
  const setTrackListWidth = useUIStore((s) => s.setTrackListWidth);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const scrollY = useUIStore((s) => s.scrollY);
  const trackListScrollRef = useRef<HTMLDivElement>(null);
  const isCollapsed = trackListDisplayMode === 'collapsed';

  // Sync vertical scroll with timeline
  useEffect(() => {
    if (trackListScrollRef.current) {
      trackListScrollRef.current.scrollTop = scrollY;
    }
  }, [scrollY]);

  const draggedIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');

  const handleDragStart = useCallback((id: string) => {
    draggedIdRef.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedIdRef.current || draggedIdRef.current === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverId(id);
    setDragOverPosition(e.clientY < midY ? 'before' : 'after');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = draggedIdRef.current;
    if (!draggedId || draggedId === targetId) {
      setDragOverId(null);
      draggedIdRef.current = null;
      return;
    }
    reorderTrack(draggedId, targetId, dragOverPosition);
    setDragOverId(null);
    draggedIdRef.current = null;
  }, [reorderTrack, dragOverPosition]);

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDragOverId(null);
  }, []);

  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startW: trackListWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const delta = ev.clientX - resizeDragRef.current.startX;
      setTrackListWidth(resizeDragRef.current.startW + delta);
    };
    const onMouseUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [trackListWidth, setTrackListWidth]);

  if (!project) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const visibleTracks = useMemo(() => getVisibleTracks(), [getVisibleTracks, project]);
  const showsArrangementMarkers = (project.markers?.length ?? 0) > 0;

  return (
    <div
      id="arrangement-track-list"
      className="flex flex-col bg-[#2a2a2a] border-r border-[#1a1a1a] relative shrink-0"
      style={{ width: trackListWidth }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverId(null);
        }
      }}
    >
      {/* Header spacer aligned with TimeRuler */}
      <div
        className={`shrink-0 border-b border-[#3a3a3a] bg-[#333] flex items-center ${isCollapsed ? 'px-1.5 justify-center' : 'px-2 justify-between'}`}
        style={{ height: TIMELINE_RULER_HEIGHT }}
      >
        {!isCollapsed && <span className="text-[10px] text-zinc-400 uppercase tracking-[0.24em] font-medium">Tracks</span>}
        <TrackListDisplayToggle />
      </div>

      {showsArrangementMarkers && (
        <div
          className="shrink-0 border-b border-[#333] bg-[#242424]"
          style={{ height: ARRANGEMENT_MARKERS_HEIGHT }}
          data-testid="tracklist-marker-spacer"
        />
      )}

      {showTempoLane && (
        <div
          className="shrink-0 border-b border-white/10 bg-[rgba(245,158,11,0.03)]"
          style={{ height: TEMPO_LANE_HEIGHT + TIME_SIGNATURE_LANE_HEIGHT }}
          data-testid="tracklist-tempo-spacer"
        />
      )}

      <div ref={trackListScrollRef} className="flex-1 overflow-y-hidden overflow-x-hidden">
        {visibleTracks.map((track) => (
          <TrackHeader
            key={track.id}
            track={track}
            isCollapsed={isCollapsed}
            isChild={!!track.parentTrackId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isDragOver={dragOverId === track.id}
            dragOverPosition={dragOverId === track.id ? dragOverPosition : null}
          />
        ))}

        {/* Empty placeholder rows matching timeline — click to add track */}
        <EmptyTrackHeaderRows isCollapsed={isCollapsed} />
      </div>

      {/* Right-edge resize handle */}
      {!isCollapsed && (
        <div
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
          onMouseDown={onResizeMouseDown}
        />
      )}
    </div>
  );
}

const PLACEHOLDER_ROW_HEIGHT = 64;
const PLACEHOLDER_ROW_COUNT = 20;

function EmptyTrackHeaderRows({ isCollapsed }: { isCollapsed: boolean }) {
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  return (
    <>
      {Array.from({ length: PLACEHOLDER_ROW_COUNT }, (_, i) => {
        const virtualId = `__empty-${i}`;
        const isSelected = selectedTrackIds.has(virtualId);
        return (
          <div
            key={`empty-header-${i}`}
            className="relative flex items-center justify-center border-b cursor-pointer group"
            style={{
              height: PLACEHOLDER_ROW_HEIGHT,
              borderColor: 'var(--color-daw-arrangement-separator)',
            }}
            onClick={() => setShowInstrumentPicker(true)}
            data-testid={`empty-header-row-${i}`}
          >
            {isSelected && (
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
            )}
            <span className={`text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${isCollapsed ? 'text-sm' : 'text-lg'}`}>+</span>
          </div>
        );
      })}
    </>
  );
}

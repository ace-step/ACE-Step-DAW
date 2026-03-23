import { useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TrackHeader } from './TrackHeader';
import { TrackListDisplayToggle } from './TrackListDisplayToggle';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import {
  ARRANGEMENT_MARKERS_HEIGHT,
  TEMPO_LANE_HEIGHT,
  TIME_SIGNATURE_LANE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
} from '../timeline/timelineLayout';
import {
  buildArrangementTrackSlots,
  DEFAULT_ARRANGEMENT_PLACEHOLDER_ROW_COUNT,
  getArrangementEmptyTrackId,
} from '../arrangement/trackSlotLayout';
import { DEFAULT_ARRANGEMENT_ROW_HEIGHT } from '../arrangement/rowLayout';

export function TrackList() {
  const project = useProjectStore((s) => s.project);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const moveTrackToOrder = useProjectStore((s) => s.moveTrackToOrder);
  const getVisibleTracks = useProjectStore((s) => s.getVisibleTracks);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const trackListDisplayMode = useUIStore((s) => s.trackListDisplayMode);
  const setTrackListWidth = useUIStore((s) => s.setTrackListWidth);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const scrollY = useUIStore((s) => s.scrollY);
  const trackListViewportRef = useRef<HTMLDivElement>(null);
  const isCollapsed = trackListDisplayMode === 'collapsed';

  useLayoutEffect(() => {
    const content = document.getElementById('arrangement-track-list-content');
    if (content) {
      content.style.transform = `translateY(-${scrollY}px)`;
    }
  }, [scrollY]);

  const handleTrackListWheel = useCallback((e: WheelEvent) => {
    const timelineScroll = document.getElementById('arrangement-timeline-scroll');
    if (!timelineScroll) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const timelineRect = timelineScroll.getBoundingClientRect();
      const proxyClientX = Math.max(
        timelineRect.left + 1,
        Math.min(timelineRect.right - 1, timelineRect.left + 120),
      );

      timelineScroll.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        deltaMode: e.deltaMode,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        clientX: proxyClientX,
        clientY: e.clientY,
      }));
      return;
    }

    e.preventDefault();
    const normalizedDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? e.deltaY * 18
      : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? e.deltaY * (timelineScroll.clientHeight || window.innerHeight || 1)
        : e.deltaY;
    timelineScroll.scrollTop += normalizedDelta;
  }, []);

  const wheelRef = useNonPassiveWheel(handleTrackListWheel);
  const mergedViewportRef = useCallback((el: HTMLDivElement | null) => {
    trackListViewportRef.current = el;
    wheelRef(el);
  }, [wheelRef]);

  const draggedIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverEmptySlotIndex, setDragOverEmptySlotIndex] = useState<number | null>(null);
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
    setDragOverEmptySlotIndex(null);
    setDragOverPosition(e.clientY < midY ? 'before' : 'after');
  }, []);

  const handleEmptyRowDragOver = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    if (!draggedIdRef.current || !project) return;
    const draggedTrack = project.tracks.find((track) => track.id === draggedIdRef.current);
    if (draggedTrack?.isGroup) return;
    setDragOverId(null);
    setDragOverEmptySlotIndex(slotIndex);
  }, [project]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = draggedIdRef.current;
    if (!draggedId || draggedId === targetId) {
      setDragOverId(null);
      setDragOverEmptySlotIndex(null);
      draggedIdRef.current = null;
      return;
    }
    reorderTrack(draggedId, targetId, dragOverPosition);
    setDragOverId(null);
    setDragOverEmptySlotIndex(null);
    draggedIdRef.current = null;
  }, [reorderTrack, dragOverPosition]);

  const handleEmptyRowDrop = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    const draggedId = draggedIdRef.current;
    if (!draggedId || !project) {
      setDragOverId(null);
      setDragOverEmptySlotIndex(null);
      draggedIdRef.current = null;
      return;
    }
    const draggedTrack = project.tracks.find((track) => track.id === draggedId);
    if (draggedTrack?.isGroup) {
      setDragOverId(null);
      setDragOverEmptySlotIndex(null);
      draggedIdRef.current = null;
      return;
    }
    moveTrackToOrder(draggedId, slotIndex + 1);
    setDragOverId(null);
    setDragOverEmptySlotIndex(null);
    draggedIdRef.current = null;
  }, [moveTrackToOrder, project]);

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

  const visibleTracks = useMemo(() => getVisibleTracks(), [getVisibleTracks, project]);
  const rows = useMemo(() => buildArrangementTrackSlots(visibleTracks, PLACEHOLDER_ROW_COUNT), [visibleTracks]);
  const blockedEmptySlotOrders = useMemo(() => {
    const collapsedGroupIds = new Set(
      project.tracks
        .filter((track) => track.isGroup && track.collapsed)
        .map((track) => track.id),
    );

    return new Set(
      project.tracks
        .filter((track) => track.parentTrackId && collapsedGroupIds.has(track.parentTrackId))
        .map((track) => track.order),
    );
  }, [project]);
  const showsArrangementMarkers = useUIStore((s) => s.showArrangementMarkers);

  return (
    <div
      id="arrangement-track-list"
      className="flex flex-col bg-[#2a2a2a] border-r border-[#1a1a1a] relative shrink-0"
      style={{ width: trackListWidth }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverId(null);
          setDragOverEmptySlotIndex(null);
        }
      }}
    >
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

      <div
        ref={mergedViewportRef}
        id="arrangement-track-list-viewport"
        className="flex-1 overflow-hidden"
      >
        <div
          id="arrangement-track-list-content"
          style={{ transform: `translateY(-${scrollY}px)`, willChange: 'transform' }}
        >
          {rows.map((row) => (row.kind === 'track' ? (
            <TrackHeader
              key={row.track.id}
              track={row.track}
              isCollapsed={isCollapsed}
              isChild={!!row.track.parentTrackId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragOver={dragOverId === row.track.id}
              dragOverPosition={dragOverId === row.track.id ? dragOverPosition : null}
            />
          ) : (
            <EmptyTrackHeaderRow
              key={getArrangementEmptyTrackId(row.slotIndex)}
              slotIndex={row.slotIndex}
              isCollapsed={isCollapsed}
              isDropDisabled={blockedEmptySlotOrders.has(row.slotIndex + 1)}
              isDragOver={dragOverEmptySlotIndex === row.slotIndex}
              onDragOver={handleEmptyRowDragOver}
              onDrop={handleEmptyRowDrop}
            />
          )))}
        </div>
      </div>

      {!isCollapsed && (
        <div
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
          onMouseDown={onResizeMouseDown}
        />
      )}
    </div>
  );
}

const PLACEHOLDER_ROW_HEIGHT = DEFAULT_ARRANGEMENT_ROW_HEIGHT;
const PLACEHOLDER_ROW_COUNT = DEFAULT_ARRANGEMENT_PLACEHOLDER_ROW_COUNT;

function EmptyTrackHeaderRow({
  slotIndex,
  isCollapsed,
  isDropDisabled,
  isDragOver,
  onDragOver,
  onDrop,
}: {
  slotIndex: number;
  isCollapsed: boolean;
  isDropDisabled: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent, slotIndex: number) => void;
  onDrop: (e: React.DragEvent, slotIndex: number) => void;
}) {
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const virtualId = getArrangementEmptyTrackId(slotIndex);
  const isSelected = selectedTrackIds.has(virtualId);

  return (
    <div
      className="relative flex items-center justify-center border-b cursor-pointer group"
      style={{
        height: PLACEHOLDER_ROW_HEIGHT,
        borderColor: 'var(--color-daw-arrangement-separator)',
        backgroundColor: isDragOver ? 'rgba(94, 89, 255, 0.12)' : undefined,
        boxShadow: isDragOver ? 'inset 0 0 0 1px rgba(94, 89, 255, 0.45)' : undefined,
      }}
      onClick={() => setShowInstrumentPicker(true)}
      onDragOver={isDropDisabled ? undefined : (e) => onDragOver(e, slotIndex)}
      onDrop={isDropDisabled ? undefined : (e) => onDrop(e, slotIndex)}
      aria-label={`Empty track slot ${slotIndex + 1}`}
      data-drop-disabled={isDropDisabled ? 'true' : 'false'}
      data-testid={`empty-header-row-${slotIndex}`}
    >
      {isSelected && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}
      <span className={`text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${isCollapsed ? 'text-sm' : 'text-lg'}`}>+</span>
    </div>
  );
}

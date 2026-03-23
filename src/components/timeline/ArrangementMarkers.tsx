import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { snapToGrid } from '../../utils/time';
import { SectionSelector, getSectionColor } from './SectionSelector';

const EDGE_HANDLE_PX = 12;
const DRAG_THRESHOLD_PX = 4;

type MarkerDragMode = 'move' | 'resize-right';

interface DragState {
  markerId: string;
  mode: MarkerDragMode;
  startX: number;
  originalTime: number;
  /** For resize-right: ID of the next marker whose time we move */
  nextMarkerId: string | null;
  /** For resize-right: original time of the next marker */
  nextMarkerOriginalTime: number;
  /** Has the mouse moved beyond the drag threshold? */
  hasDragged: boolean;
}

export function ArrangementMarkers() {
  const project = useProjectStore((s) => s.project);
  const addMarker = useProjectStore((s) => s.addMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const updateMarker = useProjectStore((s) => s.updateMarker);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const { seek } = useTransport();

  const markers = project?.markers ?? [];
  const totalDuration = project?.totalDuration ?? 0;

  const sections = useMemo(
    () => computeSections(markers, totalDuration),
    [markers, totalDuration],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRect, setEditingRect] = useState<DOMRect | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghostLeft, setGhostLeft] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const bpm = project?.bpm ?? 120;
  const timeSignature = project?.timeSignature ?? 4;
  const tempoMap = project?.tempoMap;

  const handleClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!project) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const time = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
      addMarker(time, 'New Section');
      // Open selector for the new marker on next render
      setTimeout(() => {
        const newMarkers = useProjectStore.getState().project?.markers;
        if (!newMarkers) return;
        const newMarker = newMarkers.find((m) => m.time === time && m.name === 'New Section');
        if (newMarker) {
          setEditingId(newMarker.id);
          // Get the anchor rect for the selector from the rendered element
          const el = document.querySelector(`[data-marker-id="${newMarker.id}"]`);
          if (el) setEditingRect(el.getBoundingClientRect());
        }
      }, 0);
    },
    [project, pixelsPerSecond, addMarker, bpm, timeSignature, tempoMap],
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent, markerId: string) => {
      e.preventDefault();
      removeMarker(markerId);
    },
    [removeMarker],
  );

  const startEditing = useCallback((id: string, target: HTMLElement) => {
    setEditingId(id);
    setEditingRect(target.getBoundingClientRect());
  }, []);

  const commitEdit = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (trimmed) {
        const color = getSectionColor(trimmed, '');
        updateMarker(id, color ? { name: trimmed, color } : { name: trimmed });
      }
      setEditingId(null);
      setEditingRect(null);
    },
    [updateMarker],
  );

  // --- Drag: move (body) and resize-right (right edge) ---
  const handleMarkerMouseDown = useCallback(
    (
      e: React.MouseEvent,
      markerId: string,
      markerTime: number,
      sectionWidth: number,
      nextMarkerId: string | null,
      nextMarkerTime: number,
    ) => {
      if (e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relX = e.clientX - rect.left;

      let mode: MarkerDragMode;
      if (relX >= sectionWidth - EDGE_HANDLE_PX && sectionWidth > EDGE_HANDLE_PX * 2) {
        mode = 'resize-right';
      } else {
        mode = 'move';
      }

      // resize-right on last section (no next marker) is a no-op
      if (mode === 'resize-right' && !nextMarkerId) return;

      e.preventDefault();
      e.stopPropagation();
      setDragState({
        markerId,
        mode,
        startX: e.clientX,
        originalTime: markerTime,
        nextMarkerId,
        nextMarkerOriginalTime: nextMarkerTime,
        hasDragged: false,
      });
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;

      // Check drag threshold
      if (!dragState.hasDragged && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
      if (!dragState.hasDragged) {
        setDragState((s) => (s ? { ...s, hasDragged: true } : null));
      }

      const deltaTime = deltaX / pixelsPerSecond;

      if (dragState.mode === 'move') {
        const rawTime = Math.max(0, dragState.originalTime + deltaTime);
        const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
        setGhostLeft(snappedTime * pixelsPerSecond);
      } else {
        // resize-right: move the next marker
        const rawTime = Math.max(0, dragState.nextMarkerOriginalTime + deltaTime);
        // Clamp: next marker cannot go before current marker + minimum
        const minTime = dragState.originalTime + (60 / bpm); // at least 1 beat
        const clampedTime = Math.max(minTime, rawTime);
        const snappedTime = e.altKey ? clampedTime : snapToGrid(clampedTime, bpm, timeSignature, tempoMap);
        setGhostLeft(snappedTime * pixelsPerSecond);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState.hasDragged) {
        // It was just a click, not a drag
        setDragState(null);
        setGhostLeft(null);
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (dragState.mode === 'move') {
        const rawTime = Math.max(0, dragState.originalTime + deltaTime);
        const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
        updateMarker(dragState.markerId, { time: snappedTime });
      } else if (dragState.nextMarkerId) {
        const rawTime = Math.max(0, dragState.nextMarkerOriginalTime + deltaTime);
        const minTime = dragState.originalTime + (60 / bpm);
        const clampedTime = Math.max(minTime, rawTime);
        const snappedTime = e.altKey ? clampedTime : snapToGrid(clampedTime, bpm, timeSignature, tempoMap);
        updateMarker(dragState.nextMarkerId, { time: snappedTime });
      }

      setDragState(null);
      setGhostLeft(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragState(null);
        setGhostLeft(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState, pixelsPerSecond, bpm, timeSignature, tempoMap, updateMarker]);

  if (!project) return null;

  const totalWidth = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ width: totalWidth, height: ARRANGEMENT_MARKERS_HEIGHT }}
      onDoubleClick={handleDoubleClick}
      data-testid="arrangement-markers"
    >
      {sections.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[11px] text-white/50 pointer-events-none"
          data-testid="arrangement-markers-empty"
        >
          Double-click to add section markers
        </div>
      )}
      {/* Ghost preview during drag */}
      {dragState?.hasDragged && ghostLeft !== null && (
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={
            dragState.mode === 'resize-right'
              ? { left: ghostLeft, width: 2, backgroundColor: '#fff', opacity: 0.6 }
              : { left: ghostLeft, width: 2, backgroundColor: '#fff', opacity: 0.6 }
          }
          data-testid="arrangement-marker-ghost"
        />
      )}
      {sections.map(({ marker, startTime, endTime }, sectionIndex) => {
        const left = startTime * pixelsPerSecond;
        const widthPx = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;
        const isDragging = dragState?.markerId === marker.id && dragState.hasDragged;

        // Find next marker for resize-right
        const nextSection = sections[sectionIndex + 1];
        const nextMarkerId = nextSection?.marker.id ?? null;
        const nextMarkerTime = nextSection?.marker.time ?? totalDuration;

        // Determine cursor based on position (via CSS for right edge)
        const isLastSection = sectionIndex === sections.length - 1;

        return (
          <div
            key={marker.id}
            className="absolute top-0 h-full flex items-center overflow-hidden group"
            style={{
              left,
              width: Math.max(widthPx, 2),
              backgroundColor: `${color}33`,
              borderLeft: `2px solid ${color}`,
              opacity: isDragging ? 0.5 : 1,
              cursor: 'grab',
            }}
            data-marker-id={marker.id}
            onClick={() => {
              if (!dragState?.hasDragged) handleClick(startTime);
            }}
            onContextMenu={(e) => handleRightClick(e, marker.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing(marker.id, e.currentTarget as HTMLElement);
            }}
            onMouseDown={(e) =>
              handleMarkerMouseDown(e, marker.id, marker.time, widthPx, nextMarkerId, nextMarkerTime)
            }
          >
            {/* Right-edge resize handle */}
            {!isLastSection && (
              <div
                className="absolute right-0 top-0 h-full z-10"
                style={{ width: EDGE_HANDLE_PX, cursor: 'col-resize' }}
                data-testid={`marker-resize-handle-${marker.id}`}
              />
            )}
            {isEditing && editingRect ? (
              <SectionSelector
                defaultValue={marker.name}
                anchorRect={editingRect}
                onCommit={(name) => commitEdit(marker.id, name)}
                onCancel={() => {
                  setEditingId(null);
                  setEditingRect(null);
                }}
              />
            ) : null}
            <span
              className="text-[10px] font-semibold px-1.5 truncate pointer-events-none"
              style={{ color }}
            >
              {marker.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

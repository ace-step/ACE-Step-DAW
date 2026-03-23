import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { snapToGrid } from '../../utils/time';
import { SectionSelector, getSectionColor } from './SectionSelector';

const DRAG_THRESHOLD_PX = 4;

type MarkerDragMode = 'move' | 'resize-right';

interface DragInfo {
  markerId: string;
  mode: MarkerDragMode;
  startX: number;
  originalTime: number;
  nextMarkerId: string | null;
  nextMarkerOriginalTime: number;
}

/** Snap to single beat (division=1) for finer granularity */
function snapToBeat(time: number, bpm: number, tempoMap?: unknown[]): number {
  return snapToGrid(time, bpm, 1, tempoMap as never);
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
  const [ghostLeft, setGhostLeft] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs for drag state to avoid closure staleness issues
  const dragRef = useRef<DragInfo | null>(null);
  const hasDraggedRef = useRef(false);

  const bpm = project?.bpm ?? 120;
  const timeSignature = project?.timeSignature ?? 4;
  const tempoMap = project?.tempoMap;

  // Keep refs in sync for use in native event listeners
  const ppsRef = useRef(pixelsPerSecond);
  ppsRef.current = pixelsPerSecond;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const tempoMapRef = useRef(tempoMap);
  tempoMapRef.current = tempoMap;
  const updateMarkerRef = useRef(updateMarker);
  updateMarkerRef.current = updateMarker;

  const handleClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  // --- Double-click: create a fixed-length section (start + end markers) ---
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!project) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const startTime = e.altKey ? rawTime : snapToBeat(rawTime, bpm, tempoMap as never);

      // Default section = 4 bars
      const barDuration = (60 / bpm) * timeSignature;
      const endTime = Math.min(startTime + barDuration * 4, totalDuration);

      // Only create if there's room for at least 1 bar
      if (endTime - startTime < barDuration) return;

      addMarker(startTime, 'New Section');
      addMarker(endTime, 'New Section');

      // Open selector for the start marker on next render
      setTimeout(() => {
        const newMarkers = useProjectStore.getState().project?.markers;
        if (!newMarkers) return;
        const newMarker = newMarkers.find((m) => m.time === startTime);
        if (newMarker) {
          setEditingId(newMarker.id);
          const el = document.querySelector(`[data-marker-id="${newMarker.id}"]`);
          if (el) setEditingRect(el.getBoundingClientRect());
        }
      }, 0);
    },
    [project, pixelsPerSecond, addMarker, bpm, timeSignature, tempoMap, totalDuration],
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

  // --- Unified drag start ---
  const startDrag = useCallback(
    (e: React.MouseEvent, info: DragInfo) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = info;
      hasDraggedRef.current = false;
      setIsDragging(true);
    },
    [],
  );

  // --- Global drag listeners ---
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaX = e.clientX - drag.startX;
      if (!hasDraggedRef.current && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
      hasDraggedRef.current = true;

      const pps = ppsRef.current;
      const b = bpmRef.current;
      const tm = tempoMapRef.current;
      const deltaTime = deltaX / pps;

      if (drag.mode === 'move') {
        const rawTime = Math.max(0, drag.originalTime + deltaTime);
        const snapped = e.altKey ? rawTime : snapToBeat(rawTime, b, tm as never);
        setGhostLeft(snapped * pps);
      } else {
        const rawTime = Math.max(0, drag.nextMarkerOriginalTime + deltaTime);
        const minTime = drag.originalTime + (60 / b); // at least 1 beat
        const clamped = Math.max(minTime, rawTime);
        const snapped = e.altKey ? clamped : snapToBeat(clamped, b, tm as never);
        setGhostLeft(snapped * pps);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        setIsDragging(false);
        setGhostLeft(null);
        return;
      }

      if (hasDraggedRef.current) {
        const pps = ppsRef.current;
        const b = bpmRef.current;
        const tm = tempoMapRef.current;
        const deltaX = e.clientX - drag.startX;
        const deltaTime = deltaX / pps;

        if (drag.mode === 'move') {
          const rawTime = Math.max(0, drag.originalTime + deltaTime);
          const snapped = e.altKey ? rawTime : snapToBeat(rawTime, b, tm as never);
          updateMarkerRef.current(drag.markerId, { time: snapped });
        } else if (drag.nextMarkerId) {
          const rawTime = Math.max(0, drag.nextMarkerOriginalTime + deltaTime);
          const minTime = drag.originalTime + (60 / b);
          const clamped = Math.max(minTime, rawTime);
          const snapped = e.altKey ? clamped : snapToBeat(clamped, b, tm as never);
          updateMarkerRef.current(drag.nextMarkerId, { time: snapped });
        }
      }

      dragRef.current = null;
      hasDraggedRef.current = false;
      setIsDragging(false);
      setGhostLeft(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = null;
        hasDraggedRef.current = false;
        setIsDragging(false);
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
  }, [isDragging]);

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
      {ghostLeft !== null && (
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: ghostLeft, width: 2, backgroundColor: '#fff', opacity: 0.7 }}
          data-testid="arrangement-marker-ghost"
        />
      )}

      {/* Render resize handles as a SEPARATE layer above all sections
          so they are never covered by adjacent section divs */}
      {sections.map(({ marker, startTime, endTime }, sectionIndex) => {
        const isLastSection = sectionIndex === sections.length - 1;
        if (isLastSection) return null;

        const nextSection = sections[sectionIndex + 1];
        const nextMarkerId = nextSection?.marker.id ?? null;
        const nextMarkerTime = nextSection?.marker.time ?? totalDuration;
        const borderX = endTime * pixelsPerSecond;

        return (
          <div
            key={`resize-${marker.id}`}
            className="absolute top-0 h-full"
            style={{
              left: borderX - 12,
              width: 24,
              cursor: 'col-resize',
              zIndex: 30,
            }}
            data-testid={`marker-resize-handle-${marker.id}`}
            onMouseDown={(e) =>
              startDrag(e, {
                markerId: marker.id,
                mode: 'resize-right',
                startX: e.clientX,
                originalTime: marker.time,
                nextMarkerId,
                nextMarkerOriginalTime: nextMarkerTime,
              })
            }
          />
        );
      })}

      {/* Section blocks */}
      {sections.map(({ marker, startTime, endTime }, sectionIndex) => {
        const left = startTime * pixelsPerSecond;
        const widthPx = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;
        const sectionIsDragging = isDragging && dragRef.current?.markerId === marker.id && hasDraggedRef.current;

        const nextSection = sections[sectionIndex + 1];
        const nextMarkerId = nextSection?.marker.id ?? null;
        const nextMarkerTime = nextSection?.marker.time ?? totalDuration;

        return (
          <div
            key={marker.id}
            className="absolute top-0 h-full flex items-center"
            style={{
              left,
              width: Math.max(widthPx, 2),
              backgroundColor: `${color}33`,
              borderLeft: `2px solid ${color}`,
              opacity: sectionIsDragging ? 0.5 : 1,
              cursor: 'grab',
              zIndex: 10,
            }}
            data-marker-id={marker.id}
            onClick={() => {
              if (!hasDraggedRef.current) handleClick(startTime);
            }}
            onContextMenu={(e) => handleRightClick(e, marker.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing(marker.id, e.currentTarget as HTMLElement);
            }}
            onMouseDown={(e) =>
              startDrag(e, {
                markerId: marker.id,
                mode: 'move',
                startX: e.clientX,
                originalTime: marker.time,
                nextMarkerId,
                nextMarkerOriginalTime: nextMarkerTime,
              })
            }
          >
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { snapToGrid } from '../../utils/time';
import { SectionSelector, getSectionColor } from './SectionSelector';

/** Total interactive width of the resize handle at section borders */
const RESIZE_HANDLE_TOTAL_PX = 24;
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
  const dragModeRef = useRef<MarkerDragMode>('move');

  const bpm = project?.bpm ?? 120;
  const timeSignature = project?.timeSignature ?? 4;
  const tempoMap = project?.tempoMap;

  // Keep refs in sync for use in listeners
  const ppsRef = useRef(pixelsPerSecond);
  ppsRef.current = pixelsPerSecond;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const tsRef = useRef(timeSignature);
  tsRef.current = timeSignature;
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!project) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const time = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);

      // Create a section with default length of 4 bars
      const barDuration = (60 / bpm) * timeSignature;
      const defaultLength = barDuration * 4;
      const endTime = Math.min(time + defaultLength, totalDuration);

      addMarker(time, 'New Section');

      // Add an end marker if there's room and no existing marker nearby
      const existingMarkers = useProjectStore.getState().project?.markers ?? [];
      const hasMarkerNearEnd = existingMarkers.some(
        (m) => Math.abs(m.time - endTime) < barDuration * 0.5,
      );
      if (endTime > time + barDuration && !hasMarkerNearEnd) {
        addMarker(endTime, 'New Section');
      }

      // Open selector for the new marker on next render
      setTimeout(() => {
        const newMarkers = useProjectStore.getState().project?.markers;
        if (!newMarkers) return;
        const newMarker = newMarkers.find((m) => m.time === time && m.name === 'New Section');
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

  // --- Unified drag start (called from body and resize handle) ---
  const startDrag = useCallback(
    (e: React.MouseEvent, info: DragInfo) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = info;
      hasDraggedRef.current = false;
      dragModeRef.current = info.mode;
      setIsDragging(true);
    },
    [],
  );

  // --- Global drag listeners (attached once, read from refs) ---
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
      const ts = tsRef.current;
      const tm = tempoMapRef.current;
      const deltaTime = deltaX / pps;

      if (drag.mode === 'move') {
        const rawTime = Math.max(0, drag.originalTime + deltaTime);
        const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, b, ts, tm);
        setGhostLeft(snappedTime * pps);
      } else {
        const rawTime = Math.max(0, drag.nextMarkerOriginalTime + deltaTime);
        const minTime = drag.originalTime + (60 / b);
        const clampedTime = Math.max(minTime, rawTime);
        const snappedTime = e.altKey ? clampedTime : snapToGrid(clampedTime, b, ts, tm);
        setGhostLeft(snappedTime * pps);
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
        const ts = tsRef.current;
        const tm = tempoMapRef.current;
        const deltaX = e.clientX - drag.startX;
        const deltaTime = deltaX / pps;

        if (drag.mode === 'move') {
          const rawTime = Math.max(0, drag.originalTime + deltaTime);
          const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, b, ts, tm);
          updateMarkerRef.current(drag.markerId, { time: snappedTime });
        } else if (drag.nextMarkerId) {
          const rawTime = Math.max(0, drag.nextMarkerOriginalTime + deltaTime);
          const minTime = drag.originalTime + (60 / b);
          const clampedTime = Math.max(minTime, rawTime);
          const snappedTime = e.altKey ? clampedTime : snapToGrid(clampedTime, b, ts, tm);
          updateMarkerRef.current(drag.nextMarkerId, { time: snappedTime });
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
      {isDragging && hasDraggedRef.current && ghostLeft !== null && (
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: ghostLeft, width: 2, backgroundColor: '#fff', opacity: 0.6 }}
          data-testid="arrangement-marker-ghost"
        />
      )}
      {sections.map(({ marker, startTime, endTime }, sectionIndex) => {
        const left = startTime * pixelsPerSecond;
        const widthPx = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;
        const sectionIsDragging = isDragging && dragRef.current?.markerId === marker.id && hasDraggedRef.current;

        const nextSection = sections[sectionIndex + 1];
        const nextMarkerId = nextSection?.marker.id ?? null;
        const nextMarkerTime = nextSection?.marker.time ?? totalDuration;
        const isLastSection = sectionIndex === sections.length - 1;

        return (
          <div
            key={marker.id}
            className="absolute top-0 h-full flex items-center group"
            style={{
              left,
              width: Math.max(widthPx, 2),
              backgroundColor: `${color}33`,
              borderLeft: `2px solid ${color}`,
              opacity: sectionIsDragging ? 0.5 : 1,
              cursor: 'grab',
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
            {/* Right-edge resize handle — wide interactive zone centered on the border */}
            {!isLastSection && (
              <div
                className="absolute top-0 h-full z-20"
                style={{
                  right: -(RESIZE_HANDLE_TOTAL_PX / 2),
                  width: RESIZE_HANDLE_TOTAL_PX,
                  cursor: 'col-resize',
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

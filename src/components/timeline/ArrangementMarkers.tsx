import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { snapToGrid } from '../../utils/time';
import { SectionSelector, getSectionColor } from './SectionSelector';
import { CURSOR_BRACKET_RIGHT } from '../../utils/bracketCursor';

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

/** Info for drag-to-create a new section on empty area */
interface CreateDragInfo {
  anchorTime: number;
  anchorX: number;
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

  // Drag-to-create preview state
  const [createPreview, setCreatePreview] = useState<{ left: number; width: number } | null>(null);
  const createDragRef = useRef<CreateDragInfo | null>(null);
  const isCreatingRef = useRef(false);

  // Existing section drag refs
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
  const addMarkerRef = useRef(addMarker);
  addMarkerRef.current = addMarker;

  const handleClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent, markerId: string, boundaryMarkerId?: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      removeMarker(markerId);
      if (boundaryMarkerId) {
        removeMarker(boundaryMarkerId);
      }
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

  // --- Existing section drag (move / resize-right) ---
  const startSectionDrag = useCallback(
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
        const minTime = drag.originalTime + (60 / b);
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

  // --- Drag-to-create: mousedown on empty area starts drawing a section ---
  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !project) return;
      // Don't start create-drag if clicking on an existing section or resize handle
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-marker-id]') || target.closest?.('[data-testid^="marker-resize-handle"]')) return;

      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const anchorTime = e.altKey ? rawTime : snapToBeat(rawTime, bpm, tempoMap as never);

      createDragRef.current = { anchorTime, anchorX: e.clientX };
      isCreatingRef.current = false;
      const anchorPx = anchorTime * pixelsPerSecond;
      setCreatePreview({ left: anchorPx, width: 0 });
    },
    [project, pixelsPerSecond, bpm, tempoMap],
  );

  useEffect(() => {
    if (!createDragRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const info = createDragRef.current;
      if (!info) return;

      const deltaX = e.clientX - info.anchorX;
      if (!isCreatingRef.current && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
      isCreatingRef.current = true;

      const pps = ppsRef.current;
      const b = bpmRef.current;
      const tm = tempoMapRef.current;

      const rawTime = Math.max(0, (info.anchorTime * pps + deltaX) / pps);
      const currentTime = e.altKey ? rawTime : snapToBeat(rawTime, b, tm as never);
      const anchorPx = info.anchorTime * pps;
      const currentPx = currentTime * pps;

      const left = Math.min(anchorPx, currentPx);
      const right = Math.max(anchorPx, currentPx);
      setCreatePreview({ left, width: Math.max(right - left, 2) });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const info = createDragRef.current;
      createDragRef.current = null;

      if (!info || !isCreatingRef.current) {
        setCreatePreview(null);
        isCreatingRef.current = false;
        return;
      }

      const pps = ppsRef.current;
      const b = bpmRef.current;
      const tm = tempoMapRef.current;

      const rawTime = Math.max(0, (info.anchorTime * pps + (e.clientX - info.anchorX)) / pps);
      const endTime = e.altKey ? rawTime : snapToBeat(rawTime, b, tm as never);

      const t1 = Math.min(info.anchorTime, endTime);
      const t2 = Math.max(info.anchorTime, endTime);

      // Only create if the section has meaningful width (at least 1 beat)
      const beatDuration = 60 / b;
      if (t2 - t1 >= beatDuration * 0.5) {
        addMarkerRef.current(t1, 'New Section');
        // End marker is just a boundary — no visible section name
        addMarkerRef.current(t2, '');

        // Open selector for the start marker
        setTimeout(() => {
          const newMarkers = useProjectStore.getState().project?.markers;
          if (!newMarkers) return;
          const newMarker = newMarkers.find((m) => m.time === t1);
          if (newMarker) {
            setEditingId(newMarker.id);
            const el = document.querySelector(`[data-marker-id="${newMarker.id}"]`);
            if (el) setEditingRect(el.getBoundingClientRect());
          }
        }, 0);
      }

      setCreatePreview(null);
      isCreatingRef.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        createDragRef.current = null;
        isCreatingRef.current = false;
        setCreatePreview(null);
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
  }, [createPreview !== null]); // re-attach when create-drag starts/ends

  if (!project) return null;

  const totalWidth = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;

  return (
    <div
      ref={containerRef}
      className="relative select-none border-b border-[#333]"
      style={{ width: totalWidth, height: ARRANGEMENT_MARKERS_HEIGHT, cursor: 'crosshair' }}
      onMouseDown={handleContainerMouseDown}
      data-testid="arrangement-markers"
    >
      {sections.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[11px] text-white/50 pointer-events-none"
          data-testid="arrangement-markers-empty"
        >
          Drag to create section
        </div>
      )}

      {/* Create-drag preview */}
      {createPreview && createPreview.width > 0 && (
        <div
          className="absolute top-0 h-full pointer-events-none rounded-sm"
          style={{
            left: createPreview.left,
            width: createPreview.width,
            backgroundColor: 'rgba(99, 102, 241, 0.3)',
            border: '1px solid rgba(99, 102, 241, 0.6)',
            zIndex: 40,
          }}
          data-testid="arrangement-create-preview"
        />
      )}

      {/* Ghost line during existing section drag */}
      {ghostLeft !== null && (
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: ghostLeft, width: 2, backgroundColor: '#fff', opacity: 0.7 }}
          data-testid="arrangement-marker-ghost"
        />
      )}

      {/* Resize handles — separate layer above sections */}
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
              cursor: CURSOR_BRACKET_RIGHT,
              zIndex: 30,
            }}
            data-testid={`marker-resize-handle-${marker.id}`}
            onMouseDown={(e) =>
              startSectionDrag(e, {
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

      {/* Section blocks — skip boundary-only markers (empty name) */}
      {sections.map(({ marker, startTime, endTime }, sectionIndex) => {
        if (!marker.name) return null;

        const left = startTime * pixelsPerSecond;
        const widthPx = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;
        const sectionIsDragging = isDragging && dragRef.current?.markerId === marker.id && hasDraggedRef.current;

        const nextSection = sections[sectionIndex + 1];
        const nextMarkerId = nextSection?.marker.id ?? null;
        const nextMarkerTime = nextSection?.marker.time ?? totalDuration;
        const boundaryMarkerId = nextSection?.marker.name ? null : (nextSection?.marker.id ?? null);

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
            onContextMenu={(e) => handleRightClick(e, marker.id, boundaryMarkerId)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing(marker.id, e.currentTarget as HTMLElement);
            }}
            onMouseDown={(e) =>
              startSectionDrag(e, {
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

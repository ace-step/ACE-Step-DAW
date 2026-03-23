import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { snapToGrid } from '../../utils/time';

/** Preset colors for common arrangement sections. */
const SECTION_COLORS: Record<string, string> = {
  intro: '#6366f1',   // indigo
  verse: '#22c55e',   // green
  chorus: '#f59e0b',  // amber
  bridge: '#8b5cf6',  // violet
  outro: '#ef4444',   // red
  hook: '#ec4899',    // pink
  'pre-chorus': '#14b8a6', // teal
  solo: '#f97316',    // orange
  breakdown: '#64748b', // slate
};

function getSectionColor(name: string, fallback: string): string {
  const key = name.toLowerCase().trim();
  return SECTION_COLORS[key] ?? fallback;
}

interface DragState {
  markerId: string;
  startX: number;
  originalTime: number;
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
  const inputRef = useRef<HTMLInputElement>(null);
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
      // Snap to bar by default; hold Alt for free placement
      const time = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
      addMarker(time, 'New Section');
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

  const startEditing = useCallback((id: string) => {
    setEditingId(id);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (trimmed) {
        const color = getSectionColor(trimmed, '');
        updateMarker(id, color ? { name: trimmed, color } : { name: trimmed });
      }
      setEditingId(null);
    },
    [updateMarker],
  );

  // --- Drag to reposition ---
  const handleMarkerMouseDown = useCallback(
    (e: React.MouseEvent, markerId: string, markerTime: number) => {
      // Only initiate drag on left-click, on the left edge (border area, first 8px)
      if (e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      // Only start drag within the 8px left-edge handle zone
      if (offsetX > 8) return;
      e.preventDefault();
      e.stopPropagation();
      setDragState({ markerId, startX: e.clientX, originalTime: markerTime });
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const rawTime = Math.max(0, dragState.originalTime + deltaTime);
      const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
      setGhostLeft(snappedTime * pixelsPerSecond);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const rawTime = Math.max(0, dragState.originalTime + deltaTime);
      const snappedTime = e.altKey ? rawTime : snapToGrid(rawTime, bpm, timeSignature, tempoMap);
      updateMarker(dragState.markerId, { time: snappedTime });
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
      {dragState && ghostLeft !== null && (
        <div
          className="absolute top-0 h-full w-[2px] opacity-60 pointer-events-none"
          style={{ left: ghostLeft, backgroundColor: '#fff' }}
          data-testid="arrangement-marker-ghost"
        />
      )}
      {sections.map(({ marker, startTime, endTime }) => {
        const left = startTime * pixelsPerSecond;
        const width = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;
        const isDragging = dragState?.markerId === marker.id;

        return (
          <div
            key={marker.id}
            className="absolute top-0 h-full flex items-center overflow-hidden"
            style={{
              left,
              width: Math.max(width, 2),
              backgroundColor: `${color}33`,
              borderLeft: `2px solid ${color}`,
              opacity: isDragging ? 0.5 : 1,
              cursor: 'pointer',
            }}
            data-marker-id={marker.id}
            onClick={() => !isDragging && handleClick(startTime)}
            onContextMenu={(e) => handleRightClick(e, marker.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing(marker.id);
            }}
            onMouseDown={(e) => handleMarkerMouseDown(e, marker.id, marker.time)}
          >
            {/* Left-edge drag handle */}
            <div
              className="absolute left-0 top-0 h-full w-[6px] z-10"
              style={{ cursor: 'col-resize' }}
              data-testid={`marker-drag-handle-${marker.id}`}
            />
            {isEditing ? (
              <input
                ref={inputRef}
                className="bg-transparent text-white text-[10px] font-semibold px-1 w-full outline-none border-b border-white/40"
                defaultValue={marker.name}
                onBlur={(e) => commitEdit(marker.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(marker.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <span
                className="text-[10px] font-semibold px-1.5 truncate"
                style={{ color }}
              >
                {marker.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

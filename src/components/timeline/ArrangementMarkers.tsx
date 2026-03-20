import { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { computeSections } from '../../utils/arrangementSections';
import { ARRANGEMENT_MARKERS_HEIGHT } from './timelineLayout';

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

export function ArrangementMarkers() {
  const project = useProjectStore((s) => s.project);
  const addMarker = useProjectStore((s) => s.addMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const updateMarker = useProjectStore((s) => s.updateMarker);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const { seek } = useTransport();

  const markers = project?.markers ?? [];
  const totalDuration = project?.totalDuration ?? 0;

  const sections = useMemo(
    () => computeSections(markers, totalDuration),
    [markers, totalDuration],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const time = Math.max(0, x / pixelsPerSecond);
      addMarker(time, 'New Section');
    },
    [project, pixelsPerSecond, addMarker],
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

  if (!project || sections.length === 0) return null;

  const totalWidth = totalDuration * pixelsPerSecond;

  return (
    <div
      className="relative select-none"
      style={{ width: totalWidth, height: ARRANGEMENT_MARKERS_HEIGHT }}
      onDoubleClick={handleDoubleClick}
      data-testid="arrangement-markers"
    >
      {sections.map(({ marker, startTime, endTime }) => {
        const left = startTime * pixelsPerSecond;
        const width = (endTime - startTime) * pixelsPerSecond;
        const color = getSectionColor(marker.name, marker.color);
        const isEditing = editingId === marker.id;

        return (
          <div
            key={marker.id}
            className="absolute top-0 h-full flex items-center overflow-hidden cursor-pointer"
            style={{
              left,
              width: Math.max(width, 2),
              backgroundColor: `${color}33`,
              borderLeft: `2px solid ${color}`,
            }}
            data-marker-id={marker.id}
            onClick={() => handleClick(startTime)}
            onContextMenu={(e) => handleRightClick(e, marker.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing(marker.id);
            }}
          >
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

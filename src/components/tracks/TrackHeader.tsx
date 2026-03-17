import { useCallback, useRef, useState } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { TRACK_CATALOG, TRACK_TYPE_CATALOG } from '../../constants/tracks';
import { TrackEditModal } from './TrackEditModal';

const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;

interface TrackHeaderProps {
  track: Track;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  isDragOver: boolean;
  dragOverPosition: 'before' | 'after' | null;
}

export function TrackHeader({
  track,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  dragOverPosition,
}: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const info = TRACK_CATALOG[track.trackName];
  const typeInfo = TRACK_TYPE_CATALOG[track.trackType ?? 'stems'];

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(track.displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(track.displayName);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [track.displayName]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== track.displayName) {
      renameTrack(track.id, trimmed);
    }
    setIsEditing(false);
  }, [editValue, track.displayName, track.id, renameTrack]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue(track.displayName);
  }, [track.displayName]);

  const laneHeight = track.laneHeight ?? 64;
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  const onHeightResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startY: e.clientY, startH: laneHeight };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientY - resizeRef.current.startY;
      const newH = Math.min(MAX_LANE_HEIGHT, Math.max(MIN_LANE_HEIGHT, resizeRef.current.startH + delta));
      updateTrack(track.id, { laneHeight: newH });
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [laneHeight, track.id, updateTrack]);

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    e.stopPropagation();
    setEditModalOpen(true);
  }, []);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <>
    <div
      className={`relative flex flex-col justify-center gap-1 px-2 border-b border-daw-border group select-none ${
        isDragOver ? 'bg-daw-surface-2' : ''
      }`}
      style={{
        height: track.laneHeight ?? 64,
        borderLeft: `3px solid ${track.color}`,
        borderTop: isDragOver && dragOverPosition === 'before' ? '2px solid #6366f1' : undefined,
        borderBottom: isDragOver && dragOverPosition === 'after' ? '2px solid #6366f1' : undefined,
      }}
      draggable
      onDragStart={() => onDragStart(track.id)}
      onDragOver={(e) => onDragOver(e, track.id)}
      onDrop={(e) => onDrop(e, track.id)}
      onDragEnd={(e) => e.currentTarget.style.opacity = '1'}
      onDoubleClick={handleHeaderDoubleClick}
      onContextMenu={handleHeaderContextMenu}
    >
      {/* Top row: drag handle + type badge + emoji + name */}
      <div className="flex items-center gap-1 min-w-0">
        <div
          className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing text-sm leading-none select-none"
          title="Drag to reorder"
        >
          ⠿
        </div>
        <span
          className="flex-shrink-0 text-[8px] font-bold px-1 py-px rounded leading-tight"
          style={{ backgroundColor: typeInfo.color + '25', color: typeInfo.color }}
          title={typeInfo.label}
        >
          {typeInfo.abbr}
        </span>
        <span className="text-sm flex-shrink-0" title={info.displayName}>{info.emoji}</span>
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelEditing();
            }}
            className="text-xs font-medium text-zinc-200 bg-zinc-700 rounded px-1 py-0.5 min-w-0 outline-none border border-indigo-500/60"
            autoFocus
          />
        ) : (
          <span
            className="text-xs font-medium text-zinc-200 truncate cursor-text"
            title={`${track.displayName} (double-click to rename)`}
            onDoubleClick={startEditing}
          >
            {track.displayName}
          </span>
        )}
      </div>

      {/* Bottom row: volume + buttons */}
      <div className="flex items-center gap-1.5 w-full">
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(track.volume * 100)}
          onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
          className="flex-1 h-1 min-w-0"
          title={`Volume: ${Math.round(track.volume * 100)}%`}
        />
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={`w-6 h-5 text-[10px] font-bold rounded transition-colors ${
              track.muted
                ? 'bg-amber-600 text-white'
                : 'bg-daw-surface-2 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Mute"
          >
            M
          </button>
          <button
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            className={`w-6 h-5 text-[10px] font-bold rounded transition-colors ${
              track.soloed
                ? 'bg-emerald-600 text-white'
                : 'bg-daw-surface-2 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Solo"
          >
            S
          </button>
          <button
            onClick={() => setEditModalOpen(true)}
            className="w-6 h-5 text-[10px] font-bold rounded transition-colors bg-daw-surface-2 text-zinc-600 hover:text-zinc-300"
            title="Edit track"
          >
            ⚙
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="w-6 h-5 text-[10px] font-bold rounded bg-daw-surface-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            title="Remove track"
          >
            ×
          </button>
        </div>
      </div>

      {/* Bottom-edge height resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-indigo-500/40 transition-colors z-10"
        onMouseDown={onHeightResizeDown}
      />
    </div>

    {/* Context menu */}
    {ctxMenu && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
        <div
          className="fixed z-50 bg-daw-surface border border-daw-border rounded shadow-xl py-1 min-w-[160px]"
          style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 100) }}
        >
          <button
            onClick={() => { setCtxMenu(null); setEditModalOpen(true); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
          >
            Edit Track...
          </button>
          <div className="my-1 border-t border-daw-border" />
          <button
            onClick={() => { setCtxMenu(null); removeTrack(track.id); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Delete Track
          </button>
        </div>
      </>
    )}

    {/* Edit modal */}
    {editModalOpen && (
      <TrackEditModal track={track} onClose={() => setEditModalOpen(false)} />
    )}
    </>
  );
}

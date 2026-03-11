import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TRACK_CATALOG } from '../../constants/tracks';

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
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const expandedTrackId = useUIStore((s) => s.expandedTrackId);
  const setExpandedTrackId = useUIStore((s) => s.setExpandedTrackId);
  const info = TRACK_CATALOG[track.trackName];

  const isExpanded = expandedTrackId === track.id;
  const toggleExpand = () => setExpandedTrackId(isExpanded ? null : track.id);

  return (
    <div
      className={`relative flex flex-col justify-center gap-1 h-16 px-2 border-b border-daw-border group select-none ${
        isDragOver ? 'bg-daw-surface-2' : ''
      }`}
      style={{
        borderLeft: `3px solid ${track.color}`,
        borderTop: isDragOver && dragOverPosition === 'before' ? '2px solid #6366f1' : undefined,
        borderBottom: isDragOver && dragOverPosition === 'after' ? '2px solid #6366f1' : undefined,
      }}
      draggable
      onDragStart={() => onDragStart(track.id)}
      onDragOver={(e) => onDragOver(e, track.id)}
      onDrop={(e) => onDrop(e, track.id)}
      onDragEnd={(e) => e.currentTarget.style.opacity = '1'}
    >
      {/* Top row: drag handle + emoji + name */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing text-sm leading-none select-none"
          title="Drag to reorder"
        >
          ⠿
        </div>
        <span className="text-base flex-shrink-0" title={info.displayName}>{info.emoji}</span>
        <span className="text-xs font-medium text-zinc-200 truncate" title={track.displayName}>
          {track.displayName}
        </span>
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
            onClick={toggleExpand}
            className={`w-6 h-5 text-[10px] font-bold rounded transition-colors ${
              isExpanded
                ? 'bg-zinc-600 text-white'
                : 'bg-daw-surface-2 text-zinc-600 hover:text-zinc-300'
            }`}
            title="Inspector"
          >
            {isExpanded ? '▲' : '▼'}
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
    </div>
  );
}

import { useCallback, useRef, useState } from 'react';
import type { Track, InputMonitoringMode } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TRACK_CATALOG } from '../../constants/tracks';
import { TrackEditModal } from './TrackEditModal';
import { useRecording } from '../../hooks/useRecording';
import { freezeTrackToAudio, flattenTrackToAudio } from '../../services/freezeTrack';

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
  const duplicateTrack = useProjectStore((s) => s.duplicateTrack);
  const setInputMonitoring = useProjectStore((s) => s.setInputMonitoring);
  const unfreezeTrack = useProjectStore((s) => s.unfreezeTrack);

  // Check if any track is soloed — if so, non-soloed tracks are "implied muted"
  const anySoloed = useProjectStore((s) => s.project?.tracks.some((t) => t.soloed) ?? false);
  const isImpliedMute = anySoloed && !track.soloed;
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);
  const { armedTrackIds, toggleArmTrack } = useRecording();
  const info = TRACK_CATALOG[track.trackName];

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFreezing, setIsFreezing] = useState(false);

  const handleFreeze = useCallback(async () => {
    if (track.frozen) {
      unfreezeTrack(track.id);
    } else {
      setIsFreezing(true);
      try {
        await freezeTrackToAudio(track.id);
      } finally {
        setIsFreezing(false);
      }
    }
  }, [track.frozen, track.id, unfreezeTrack]);

  const handleFlatten = useCallback(async () => {
    setIsFreezing(true);
    try {
      await flattenTrackToAudio(track.id);
    } finally {
      setIsFreezing(false);
    }
  }, [track.id]);
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
  const isCompact = laneHeight < 52;
  const isArmed = armedTrackIds.includes(track.id) || !!track.armed;
  const monitorMode: InputMonitoringMode = track.inputMonitoring ?? 'off';
  const cycleMonitor = useCallback(() => {
    const next: Record<InputMonitoringMode, InputMonitoringMode> = { off: 'auto', auto: 'on', on: 'off' };
    setInputMonitoring(track.id, next[monitorMode]);
  }, [track.id, monitorMode, setInputMonitoring]);

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
      className={`relative flex items-center gap-1.5 px-1 border-b border-[#3a3a3a] group select-none ${
        isDragOver ? 'bg-[#383838]' : 'bg-[#2d2d2d]'
      }`}
      style={{
        height: laneHeight,
        borderTop: isDragOver && dragOverPosition === 'before' ? '2px solid var(--color-daw-accent)' : undefined,
        borderBottom: isDragOver && dragOverPosition === 'after' ? '2px solid var(--color-daw-accent)' : undefined,
        opacity: isImpliedMute ? 0.45 : undefined,
        transition: 'opacity 150ms ease',
      }}
      draggable
      onDragStart={() => onDragStart(track.id)}
      onDragOver={(e) => onDragOver(e, track.id)}
      onDrop={(e) => onDrop(e, track.id)}
      onDragEnd={(e) => e.currentTarget.style.opacity = '1'}
      onDoubleClick={handleHeaderDoubleClick}
      onContextMenu={handleHeaderContextMenu}
    >
      {/* Color strip (left edge) — click to change track color */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px] rounded-r-sm cursor-pointer hover:w-[7px] transition-all duration-100"
        style={{ backgroundColor: track.color }}
        title="Click to change track color"
        onClick={(e) => {
          e.stopPropagation();
          const input = document.createElement('input');
          input.type = 'color';
          input.value = track.color;
          input.style.position = 'fixed';
          input.style.opacity = '0';
          input.style.pointerEvents = 'none';
          document.body.appendChild(input);
          input.addEventListener('input', (ev) => {
            updateTrack(track.id, { color: (ev.target as HTMLInputElement).value });
          });
          input.addEventListener('change', () => { document.body.removeChild(input); });
          input.click();
        }}
      />

      {/* Drag handle */}
      <div
        className="flex-shrink-0 ml-1.5 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing text-[10px] leading-none select-none"
        title="Drag to reorder"
      >
        ⠿
      </div>

      {/* Instrument icon */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm"
        style={{ backgroundColor: track.color + '20' }}
        title={info.displayName}
      >
        {info.emoji}
      </div>

      {/* Name + controls column */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
        {/* Name */}
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
            className="text-[11px] font-medium text-zinc-100 bg-[#1a1a1a] rounded px-1 py-px min-w-0 outline-none border border-daw-accent/60"
            autoFocus
          />
        ) : (
          <span
            className="text-[11px] font-medium text-zinc-200 block truncate cursor-text leading-tight"
            title={track.displayName}
            onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
          >
            {track.frozen && <span className="text-cyan-400 mr-0.5" title="Frozen">*</span>}
            {track.displayName}
          </span>
        )}

        {/* Volume slider + M/S buttons (only in non-compact mode) */}
        {!isCompact && (
          <div className="flex items-center gap-1 w-full">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(track.volume * 100)}
              onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
              className="flex-1 h-1 min-w-0"
              title={`Volume: ${Math.round(track.volume * 100)}%`}
            />
          </div>
        )}
      </div>

      {/* M/S/Delete buttons */}
      <div className="flex items-center gap-px flex-shrink-0">
        {/* Mute - speaker icon */}
        <button
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            track.muted
              ? 'bg-amber-600/90 text-white'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#444]'
          }`}
          title="Mute (M)"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {track.muted ? (
              <>
                <path d="M1 4.5h2l3-3v9l-3-3H1z" fill="currentColor" stroke="none" />
                <path d="M9 4l3 4M12 4L9 8" />
              </>
            ) : (
              <>
                <path d="M1 4.5h2l3-3v9l-3-3H1z" fill="currentColor" stroke="none" />
                <path d="M9 3.5c1 .8 1 4.2 0 5" />
              </>
            )}
          </svg>
        </button>
        {/* Solo - headphone icon */}
        <button
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            track.soloed
              ? 'bg-emerald-600/90 text-white'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#444]'
          }`}
          title="Solo (S)"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 5.5a4 4 0 018 0" />
            <path d="M2 5.5v2a1 1 0 001 1h1v-3H2zM10 5.5v2a1 1 0 01-1 1H8v-3h2z" fill={track.soloed ? 'currentColor' : 'none'} />
          </svg>
        </button>
        <button
          onClick={(e) => toggleArmTrack(track.id, !(e.metaKey || e.ctrlKey))}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            isArmed
              ? 'bg-red-600/90 text-white'
              : 'text-red-400 hover:text-red-300 hover:bg-[#444]'
          }`}
          title="Record arm"
          aria-label={`Record arm ${track.displayName}`}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="6" cy="6" r="3.25" fill={isArmed ? 'currentColor' : 'none'} />
          </svg>
        </button>
        {/* Input monitoring — cycles off → auto → on */}
        <button
          onClick={cycleMonitor}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            monitorMode === 'on'
              ? 'bg-cyan-600/90 text-white'
              : monitorMode === 'auto'
                ? 'bg-cyan-600/50 text-cyan-200'
                : 'text-zinc-500 hover:text-cyan-400 hover:bg-[#444]'
          }`}
          title={`Input monitoring: ${monitorMode} (click to cycle off→auto→on)`}
          aria-label={`Input monitoring ${track.displayName}: ${monitorMode}`}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M2 7V6a4 4 0 018 0v1" />
            <rect x="1" y="7" width="2.5" height="3" rx="0.5" fill={monitorMode !== 'off' ? 'currentColor' : 'none'} />
            <rect x="8.5" y="7" width="2.5" height="3" rx="0.5" fill={monitorMode !== 'off' ? 'currentColor' : 'none'} />
          </svg>
        </button>
        {/* Freeze toggle */}
        <button
          onClick={handleFreeze}
          disabled={isFreezing}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            track.frozen
              ? 'bg-cyan-600/90 text-white'
              : isFreezing
                ? 'text-cyan-400 animate-pulse'
                : 'text-zinc-500 hover:text-cyan-400 hover:bg-[#444]'
          }`}
          title={track.frozen ? 'Unfreeze Track' : 'Freeze Track'}
          aria-label={`${track.frozen ? 'Unfreeze' : 'Freeze'} ${track.displayName}`}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M6 1v10M1 6h10M3 3l6 6M9 3L3 9" />
          </svg>
        </button>
        {/* Automation toggle */}
        <button
          onClick={() => {
            const project = useProjectStore.getState().project;
            if (!project) return;
            const hasLane = (project.automationLanes ?? []).some((l) => l.trackId === track.id);
            if (!hasLane) {
              // Create a default volume automation lane with 2 points
              useProjectStore.getState().addAutomationPoint(
                track.id,
                { type: 'mixer', param: 'volume' },
                { time: 0, value: track.volume },
              );
              useProjectStore.getState().addAutomationPoint(
                track.id,
                { type: 'mixer', param: 'volume' },
                { time: project.totalDuration, value: track.volume },
              );
            } else {
              // Clear all automation for this track
              for (const lane of (project.automationLanes ?? []).filter((l) => l.trackId === track.id)) {
                useProjectStore.getState().clearAutomationLane(track.id, lane.parameter);
              }
            }
          }}
          className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold transition-colors ${
            (useProjectStore.getState().project?.automationLanes ?? []).some((l) => l.trackId === track.id)
              ? 'bg-amber-600/80 text-white'
              : 'text-zinc-500 hover:text-amber-400 hover:bg-[#444]'
          }`}
          title="Toggle automation lane (A)"
          aria-label={`Toggle automation ${track.displayName}`}
        >
          A
        </button>
        {/* Delete - hidden by default, visible on hover */}
        <button
          onClick={() => removeTrack(track.id)}
          className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          title="Remove track"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l6 6M7 1L1 7" />
          </svg>
        </button>
      </div>

      {/* Bottom-edge height resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
        onMouseDown={onHeightResizeDown}
      />
    </div>

    {/* Context menu */}
    {ctxMenu && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
        <div
          className="fixed z-50 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 100) }}
        >
          <button
            onClick={() => {
              setCtxMenu(null);
              if (track.trackType === 'pianoRoll') {
                const clip = track.clips.find((candidate) => candidate.midiData);
                setOpenPianoRoll(track.id, clip?.id ?? null);
              }
            }}
            disabled={track.trackType !== 'pianoRoll'}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:hover:bg-transparent disabled:hover:text-zinc-600"
          >
            Open Piano Roll...
          </button>
          <button
            onClick={() => { setCtxMenu(null); setOpenEffectChainTrackId(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Open Effect Chain...
          </button>
          <button
            onClick={() => { setCtxMenu(null); startEditing(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Rename Track
          </button>
          <button
            onClick={() => { setCtxMenu(null); setEditModalOpen(true); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Track Settings...
          </button>
          <button
            onClick={() => { setCtxMenu(null); duplicateTrack(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Duplicate Track
          </button>
          <div className="my-1 border-t border-[#555]" />
          <button
            onClick={() => { setCtxMenu(null); void handleFreeze(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            {track.frozen ? 'Unfreeze Track' : 'Freeze Track'}
          </button>
          <button
            onClick={() => { setCtxMenu(null); void handleFlatten(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Flatten Track
          </button>
          <div className="my-1 border-t border-[#555]" />
          <button
            onClick={() => { setCtxMenu(null); removeTrack(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-600 hover:text-white transition-colors"
          >
            Delete Track
          </button>
        </div>
      </>
    )}

    {editModalOpen && (
      <TrackEditModal track={track} onClose={() => setEditModalOpen(false)} />
    )}
    </>
  );
}

import { useCallback, useRef, useState } from 'react';
import type { Track, InputMonitoringMode } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TRACK_CATALOG } from '../../constants/tracks';
import { TrackEditModal } from './TrackEditModal';
import { TrackHeaderMeter } from './TrackHeaderMeter';
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
  const saveTrackPreset = useProjectStore((s) => s.saveTrackPreset);
  const setTrackHeightPreset = useProjectStore((s) => s.setTrackHeightPreset);
  const setAllTracksHeightPreset = useProjectStore((s) => s.setAllTracksHeightPreset);
  const setInputMonitoring = useProjectStore((s) => s.setInputMonitoring);
  const exportTrackMidi = useProjectStore((s) => s.exportTrackMidi);
  const unfreezeTrack = useProjectStore((s) => s.unfreezeTrack);
  const project = useProjectStore((s) => s.project);

  // Check if any track is soloed — if so, non-soloed tracks are "implied muted"
  const anySoloed = project?.tracks.some((t) => t.soloed) ?? false;
  const isImpliedMute = anySoloed && !track.soloed;
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);
  const openBounceInPlaceDialog = useUIStore((s) => s.openBounceInPlaceDialog);
  const setExpandedTrackId = useUIStore((s) => s.setExpandedTrackId);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const { armedTrackIds, toggleArmTrack } = useRecording();
  const info = TRACK_CATALOG[track.trackName];

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [heightSubmenu, setHeightSubmenu] = useState(false);
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
  const hasAutomationLane = (project?.automationLanes ?? []).some((lane) => lane.trackId === track.id);
  const showSecondaryActions = monitorMode !== 'off' || track.frozen || isFreezing || hasAutomationLane;
  const primaryButtonClass = 'w-6 h-6 flex items-center justify-center rounded-md transition-colors';
  const secondaryButtonClass = 'w-5 h-5 flex items-center justify-center rounded-md transition-colors';

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

  const handleSavePreset = useCallback(() => {
    const presetName = window.prompt('Preset name', `${track.displayName} Preset`);
    if (!presetName) return;
    const trimmedName = presetName.trim();
    if (!trimmedName) return;
    saveTrackPreset(track.id, trimmedName);
  }, [saveTrackPreset, track.displayName, track.id]);

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      data-keyboard-context="timeline"
      data-track-id={track.id}
      className={`relative flex items-center gap-2 px-2 border-b border-[#3a3a3a] group select-none ${
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
      onFocus={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('timeline', track.id);
      }}
      onMouseDown={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('timeline', track.id);
      }}
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
        className="flex-shrink-0 ml-1 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing text-[10px] leading-none select-none"
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
      <div className="flex-1 min-w-[48px] flex flex-col gap-1 py-1">
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

        {/* Level meter with peak hold + clip indicator */}
        <TrackHeaderMeter trackId={track.id} />
      </div>

      {/* Primary and secondary track actions */}
      <div className="flex items-center gap-1 flex-shrink-0 self-stretch py-1">
        <div
          data-primary-actions
          className="flex items-center gap-0.5 rounded-lg border border-[#494949] bg-[#242424]/95 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <button
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={`${primaryButtonClass} ${
              track.muted
                ? 'bg-amber-600/90 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#444]'
            }`}
            title="Mute (M)"
            aria-label={`Mute ${track.displayName}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
          <button
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            className={`${primaryButtonClass} ${
              track.soloed
                ? 'bg-emerald-600/90 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#444]'
            }`}
            title="Solo (S)"
            aria-label={`Solo ${track.displayName}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5.5a4 4 0 018 0" />
              <path d="M2 5.5v2a1 1 0 001 1h1v-3H2zM10 5.5v2a1 1 0 01-1 1H8v-3h2z" fill={track.soloed ? 'currentColor' : 'none'} />
            </svg>
          </button>
          <button
            onClick={(e) => toggleArmTrack(track.id, !(e.metaKey || e.ctrlKey))}
            className={`${primaryButtonClass} ${
              isArmed
                ? 'bg-red-600/90 text-white'
                : 'text-red-400 hover:text-red-300 hover:bg-[#444]'
            }`}
            title="Record arm"
            aria-label={`Record arm ${track.displayName}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="6" cy="6" r="3.25" fill={isArmed ? 'currentColor' : 'none'} />
            </svg>
          </button>
        </div>

        <div
          data-secondary-actions
          className={`flex items-center gap-0.5 rounded-lg border border-[#404040] bg-[#1f1f1f]/90 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all ${
            showSecondaryActions
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 pointer-events-none translate-x-1 max-w-0 overflow-hidden group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:max-w-none group-hover:overflow-visible'
          }`}
        >
          <button
            onClick={cycleMonitor}
            className={`${secondaryButtonClass} ${
              monitorMode === 'on'
                ? 'bg-cyan-600/90 text-white'
                : monitorMode === 'auto'
                  ? 'bg-cyan-600/50 text-cyan-200'
                  : 'text-zinc-500 hover:text-cyan-300 hover:bg-[#444]'
            }`}
            title={`Input monitoring: ${monitorMode} (click to cycle off→auto→on)`}
            aria-label={`Input monitoring ${track.displayName}: ${monitorMode}`}
          >
            <svg data-icon="microphone" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <rect x="4" y="1" width="4" height="6" rx="2" fill={monitorMode !== 'off' ? 'currentColor' : 'none'} />
              <path d="M3 7a3 3 0 006 0" />
              <path d="M6 10v1.5M4.5 11.5h3" />
            </svg>
          </button>
          <button
            onClick={handleFreeze}
            disabled={isFreezing}
            className={`${secondaryButtonClass} ${
              track.frozen
                ? 'bg-cyan-600/90 text-white'
                : isFreezing
                  ? 'text-cyan-400 animate-pulse'
                  : 'text-zinc-500 hover:text-cyan-300 hover:bg-[#444]'
            }`}
            title={track.frozen ? 'Unfreeze Track' : 'Freeze Track'}
            aria-label={`${track.frozen ? 'Unfreeze' : 'Freeze'} ${track.displayName}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1.5v9" />
              <path d="M2.5 3.25l7 5.5" />
              <path d="M2.5 8.75l7-5.5" />
              <path d="M1.75 6h8.5" />
              <path d="M4.65 1.9L6 3.25l1.35-1.35" />
              <path d="M4.65 10.1L6 8.75l1.35 1.35" />
            </svg>
          </button>
          <button
            onClick={() => {
              const currentProject = useProjectStore.getState().project;
              if (!currentProject) return;
              const laneExists = (currentProject.automationLanes ?? []).some((lane) => lane.trackId === track.id);
              if (!laneExists) {
                useProjectStore.getState().ensureAutomationLane(
                  track.id,
                  { type: 'mixer', param: 'volume' },
                  track.volume,
                );
              } else {
                for (const lane of (currentProject.automationLanes ?? []).filter((candidate) => candidate.trackId === track.id)) {
                  useProjectStore.getState().clearAutomationLane(track.id, lane.parameter);
                }
              }
            }}
            className={`${secondaryButtonClass} ${
              hasAutomationLane
                ? 'bg-amber-600/80 text-white'
                : 'text-zinc-500 hover:text-amber-300 hover:bg-[#444]'
            }`}
            title="Toggle automation lane (A)"
            aria-label={`Toggle automation ${track.displayName}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 8.5L4 6l2 2 4.5-4.5" />
              <circle cx="4" cy="6" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="6" cy="8" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
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
            onClick={() => { setCtxMenu(null); handleSavePreset(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Save as Track Preset...
          </button>
          {/* Track Height submenu */}
          <div
            className="relative"
            onMouseEnter={() => setHeightSubmenu(true)}
            onMouseLeave={() => setHeightSubmenu(false)}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors flex items-center justify-between"
            >
              Track Height
              <span className="text-zinc-500 text-[9px] ml-2">&#8250;</span>
            </button>
            {heightSubmenu && (
              <div className="absolute left-full top-0 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[130px] z-50">
                {(['small', 'medium', 'large', 'auto'] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => { setCtxMenu(null); setHeightSubmenu(false); setTrackHeightPreset(track.id, preset); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors capitalize"
                  >
                    {preset}
                  </button>
                ))}
                <div className="my-1 border-t border-[#555]" />
                {(['small', 'medium', 'large', 'auto'] as const).map((preset) => (
                  <button
                    key={`all-${preset}`}
                    onClick={() => { setCtxMenu(null); setHeightSubmenu(false); setAllTracksHeightPreset(preset); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-daw-accent hover:text-white transition-colors capitalize"
                  >
                    All Tracks {preset}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => { setCtxMenu(null); openBounceInPlaceDialog(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Bounce in Place...
          </button>
          <button
            onClick={() => { setCtxMenu(null); duplicateTrack(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Duplicate Track
          </button>
          <div className="my-1 border-t border-[#555]" />
          <button
            onClick={() => { setCtxMenu(null); openBounceInPlaceDialog(track.id); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Bounce in Place...
          </button>
          {track.clips.some((c) => c.midiData?.notes.length) && (
            <button
              onClick={() => { setCtxMenu(null); exportTrackMidi(track.id); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
            >
              Export MIDI
            </button>
          )}
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

import { useCallback, useRef, useState } from 'react';
import type { Track, InputMonitoringMode } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TRACK_CATALOG } from '../../constants/tracks';
import { TrackEditModal } from './TrackEditModal';
import { TrackHeaderMeter } from './TrackHeaderMeter';
import { useRecording } from '../../hooks/useRecording';
import { freezeTrackToAudio, flattenTrackToAudio } from '../../services/freezeTrack';
import {
  ARRANGEMENT_GROUP_ROW_BG,
  ARRANGEMENT_HEADER_ROW_BG,
  ARRANGEMENT_ROW_SEPARATOR_COLOR,
} from '../arrangement/rowSurface';
import {
  getArrangementLaneHeightForRenderedRowHeight,
  getArrangementRowHeight,
} from '../arrangement/rowLayout';
import { getButtonClasses } from '../ui/Button';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator, ContextMenuSubmenu } from '../ui/ContextMenu';

const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;

interface TrackHeaderProps {
  track: Track;
  isCollapsed?: boolean;
  isChild?: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  isDragOver: boolean;
  dragOverPosition: 'before' | 'after' | null;
}

export function TrackHeader({
  track,
  isCollapsed = false,
  isChild,
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
  const toggleTrackEffectsBypass = useProjectStore((s) => s.toggleTrackEffectsBypass);
  const exportTrackMidi = useProjectStore((s) => s.exportTrackMidi);
  const unfreezeTrack = useProjectStore((s) => s.unfreezeTrack);
  const toggleGroupCollapse = useProjectStore((s) => s.toggleGroupCollapse);
  const setGroupMuted = useProjectStore((s) => s.setGroupMuted);
  const setGroupSoloed = useProjectStore((s) => s.setGroupSoloed);
  const removeGroupTrack = useProjectStore((s) => s.removeGroupTrack);
  const moveTrackToGroup = useProjectStore((s) => s.moveTrackToGroup);
  const project = useProjectStore((s) => s.project);

  // Check if any track is soloed — if so, non-soloed tracks are "implied muted"
  const anySoloed = project?.tracks.some((t) => t.soloed) ?? false;
  const isImpliedMute = anySoloed && !track.soloed;
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);
  const openBounceInPlaceDialog = useUIStore((s) => s.openBounceInPlaceDialog);
  const requestDeleteTracks = useUIStore((s) => s.requestDeleteTracks);
  const setExpandedTrackId = useUIStore((s) => s.setExpandedTrackId);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const selectTracks = useUIStore((s) => s.selectTracks);
  const isTrackSelected = useUIStore((s) => s.selectedTrackIds.has(track.id));
  const { armedTrackIds, toggleArmTrack } = useRecording();
  const info = TRACK_CATALOG[track.trackName] ?? TRACK_CATALOG.custom;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [heightSubmenu, setHeightSubmenu] = useState(false);
  const [groupSubmenu, setGroupSubmenu] = useState(false);
  const [moreSubmenu, setMoreSubmenu] = useState(false);
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

  const laneHeight = track.laneHeight ?? 80;
  const rowHeight = getArrangementRowHeight(track);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const isCompact = laneHeight < 52;
  const isArmed = armedTrackIds.includes(track.id) || !!track.armed;
  const monitorMode: InputMonitoringMode = track.inputMonitoring ?? 'off';
  const hasAutomationLane = (project?.automationLanes ?? []).some((lane) => lane.trackId === track.id);
  const effectsBypassed = track.effectsBypassed ?? false;
  const showSecondaryActions = monitorMode !== 'off' || track.frozen || isFreezing || hasAutomationLane || effectsBypassed;
  const headerBackgroundColor = track.isGroup ? ARRANGEMENT_GROUP_ROW_BG : ARRANGEMENT_HEADER_ROW_BG;
  const isTwoRow = laneHeight >= 60;
  const primaryButtonClass = getButtonClasses({ size: 'sm', variant: 'ghost', icon: true, className: 'min-w-[20px] min-h-[20px]' });
  const secondaryButtonClass = getButtonClasses({ size: 'sm', variant: 'ghost', icon: true, className: 'w-5 h-5' });
  const collapsedLabel = track.displayName
    .split(/\s+/)
    .map((segment) => segment.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase() || track.displayName.slice(0, 2).toUpperCase();

  const cycleMonitor = useCallback(() => {
    const next: Record<InputMonitoringMode, InputMonitoringMode> = { off: 'auto', auto: 'on', on: 'off' };
    setInputMonitoring(track.id, next[monitorMode]);
  }, [track.id, monitorMode, setInputMonitoring]);

  const onHeightResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const minRenderedRowHeight = getArrangementRowHeight({ ...track, laneHeight: MIN_LANE_HEIGHT });
    const maxRenderedRowHeight = getArrangementRowHeight({ ...track, laneHeight: MAX_LANE_HEIGHT });

    resizeRef.current = { startY: e.clientY, startH: rowHeight };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientY - resizeRef.current.startY;
      const nextRenderedRowHeight = Math.min(
        maxRenderedRowHeight,
        Math.max(minRenderedRowHeight, resizeRef.current.startH + delta),
      );
      const nextLaneHeight = Math.min(
        MAX_LANE_HEIGHT,
        Math.max(
          MIN_LANE_HEIGHT,
          getArrangementLaneHeightForRenderedRowHeight(track, nextRenderedRowHeight),
        ),
      );
      updateTrack(track.id, { laneHeight: nextLaneHeight });
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [rowHeight, track, updateTrack]);

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
      data-group={track.isGroup ? 'true' : undefined}
      data-child={isChild ? 'true' : undefined}
      aria-label={track.isGroup ? `Group track: ${track.displayName}${track.collapsed ? ' (collapsed)' : ''}` : `Track: ${track.displayName}`}
      className={`relative flex items-center gap-2 border-b group select-none animate-[fadeIn_150ms_ease-out] ${
        isDragOver ? 'bg-daw-hover-subtle' : ''
      }`}
      style={{
        backgroundColor: isDragOver ? undefined : headerBackgroundColor,
        borderColor: ARRANGEMENT_ROW_SEPARATOR_COLOR,
        height: rowHeight,
        paddingLeft: isCollapsed ? 0 : isChild ? 24 : 8,
        paddingRight: isCollapsed ? 0 : 8,
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
      onMouseDown={(e) => {
        setExpandedTrackId(track.id);
        setKeyboardContext('timeline', track.id);
        if (e.shiftKey && project) {
          // Shift+click: range select
          const selectedIds = useUIStore.getState().selectedTrackIds;
          const tracks = project.tracks;
          const clickedIdx = tracks.findIndex((t) => t.id === track.id);
          // Find anchor: first selected track or expanded track
          let anchorIdx = clickedIdx;
          for (const id of selectedIds) {
            const idx = tracks.findIndex((t) => t.id === id);
            if (idx !== -1) { anchorIdx = idx; break; }
          }
          const start = Math.min(anchorIdx, clickedIdx);
          const end = Math.max(anchorIdx, clickedIdx);
          selectTracks(tracks.slice(start, end + 1).map((t) => t.id));
        } else {
          selectTrack(track.id, e.metaKey || e.ctrlKey);
        }
      }}
    >
      {/* Selected track overlay */}
      {isTrackSelected && !isDragOver && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-inherit" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}

      {/* Color strip (left edge) — click to change track color */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[6px] rounded-r-sm cursor-pointer hover:w-2 hover:shadow-[0_0_6px_var(--track-color)] transition-all duration-100"
        style={{ backgroundColor: track.color, '--track-color': track.color } as React.CSSProperties}
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

      {isCollapsed ? (
        <div className="flex h-full w-full flex-col items-center justify-between py-2">
          {track.isGroup ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(track.id); }}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
              title={track.collapsed ? 'Expand group' : 'Collapse group'}
              aria-label={track.collapsed ? `Expand group ${track.displayName}` : `Collapse group ${track.displayName}`}
              aria-expanded={!track.collapsed}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: track.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}
              >
                <path d="M2 3.5L5 6.5L8 3.5" />
              </svg>
            </button>
          ) : (
            <div className="text-zinc-600 text-[10px] leading-none select-none" title="Drag to reorder">⠿</div>
          )}

          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            style={{ backgroundColor: track.color + '20' }}
            title={track.isGroup ? 'Group' : info.displayName}
          >
            {track.isGroup ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h4l2 2h6v7H2V4z" fill={track.color + '40'} />
              </svg>
            ) : info.emoji}
          </div>

          <span
            data-testid="track-header-collapsed-label"
            className="text-[9px] font-semibold tracking-[0.22em] text-zinc-400 text-center"
            title={track.displayName}
          >
            {collapsedLabel}
          </span>

          <div className="w-full px-2">
            <TrackHeaderMeter trackId={track.id} />
          </div>
        </div>
      ) : (
        <>
      {/* Group collapse toggle or drag handle */}
      {track.isGroup ? (
        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(track.id); }}
          className="flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-daw-hover transition-colors"
          title={track.collapsed ? 'Expand group' : 'Collapse group'}
          aria-label={track.collapsed ? `Expand group ${track.displayName}` : `Collapse group ${track.displayName}`}
          aria-expanded={!track.collapsed}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: track.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}
          >
            <path d="M2 3.5L5 6.5L8 3.5" />
          </svg>
        </button>
      ) : (
        <div
          className="flex-shrink-0 ml-1 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing text-[10px] leading-none select-none"
          title="Drag to reorder"
        >
          ⠿
        </div>
      )}

      {/* Instrument icon or folder icon */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm"
        style={{ backgroundColor: track.color + '20' }}
        title={track.isGroup ? 'Group' : info.displayName}
      >
        {track.isGroup ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h4l2 2h6v7H2V4z" fill={track.color + '40'} />
          </svg>
        ) : info.emoji}
      </div>

      {/* Track name element (shared between layouts) */}
      {isTwoRow ? (
        /* Two-row layout for non-compact tracks (laneHeight >= 60) */
        <div className="flex-1 min-w-[48px] flex flex-col gap-1 py-1">
          {/* Row 1: drag handle + instrument icon + name + M/S/Arm */}
          <div data-testid="track-header-row1" className="flex items-center gap-1 w-full">
            <div className="flex-1 min-w-[48px]">
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
                  className="text-[11px] font-medium text-zinc-100 bg-daw-border-strong rounded px-1 py-px min-w-0 outline-none border border-daw-accent/60"
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
            </div>
            <div
              data-primary-actions
              className="flex items-center gap-0.5 rounded-lg border border-[#494949] bg-[#242424]/95 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            >
              <button
                onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
                className={`${primaryButtonClass} ${
                  track.muted
                    ? 'bg-amber-600/90 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-daw-hover'
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
                onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
                className={`${primaryButtonClass} ${
                  track.soloed
                    ? 'bg-emerald-600/90 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-daw-hover'
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
                    : 'text-red-400 hover:text-red-300 hover:bg-daw-hover'
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
                      : 'text-zinc-400 hover:text-cyan-300 hover:bg-daw-hover'
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
                      : 'text-zinc-400 hover:text-cyan-300 hover:bg-daw-hover'
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
              {!track.isGroup && (
                <button
                  onClick={() => toggleTrackEffectsBypass(track.id)}
                  className={`${secondaryButtonClass} ${
                    effectsBypassed
                      ? 'bg-orange-600/90 text-white'
                      : 'text-zinc-400 hover:text-orange-300 hover:bg-daw-hover'
                  }`}
                  title={`Bypass all track effects (P)${effectsBypassed ? ' — active' : ''}`}
                  aria-label={`${effectsBypassed ? 'Disable' : 'Enable'} FX bypass for ${track.displayName}`}
                  aria-keyshortcuts="P"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1.5v4" />
                    <path d="M3.2 2.6a4.5 4.5 0 105.6 0" />
                  </svg>
                </button>
              )}
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
                    : 'text-zinc-400 hover:text-amber-300 hover:bg-daw-hover'
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

          {/* Row 2: volume slider + level meter */}
          <div data-testid="track-header-row2" className="flex items-center gap-1 w-full">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(track.volume * 100)}
              onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
              className="flex-1 h-1 min-w-0"
              title={`Volume: ${Math.round(track.volume * 100)}%`}
            />
            <TrackHeaderMeter trackId={track.id} />
          </div>
        </div>
      ) : (
        /* Single-row compact layout (laneHeight < 60) */
        <>
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
                className="text-[11px] font-medium text-zinc-100 bg-daw-border-strong rounded px-1 py-px min-w-0 outline-none border border-daw-accent/60"
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
                onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
                className={`${primaryButtonClass} ${
                  track.muted
                    ? 'bg-amber-600/90 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-daw-hover'
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
                onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
                className={`${primaryButtonClass} ${
                  track.soloed
                    ? 'bg-emerald-600/90 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-daw-hover'
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
                    : 'text-red-400 hover:text-red-300 hover:bg-daw-hover'
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
                      : 'text-zinc-400 hover:text-cyan-300 hover:bg-daw-hover'
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
                      : 'text-zinc-400 hover:text-cyan-300 hover:bg-daw-hover'
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
              {!track.isGroup && (
                <button
                  onClick={() => toggleTrackEffectsBypass(track.id)}
                  className={`${secondaryButtonClass} ${
                    effectsBypassed
                      ? 'bg-orange-600/90 text-white'
                      : 'text-zinc-400 hover:text-orange-300 hover:bg-daw-hover'
                  }`}
                  title={`Bypass all track effects (P)${effectsBypassed ? ' — active' : ''}`}
                  aria-label={`${effectsBypassed ? 'Disable' : 'Enable'} FX bypass for ${track.displayName}`}
                  aria-keyshortcuts="P"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1.5v4" />
                    <path d="M3.2 2.6a4.5 4.5 0 105.6 0" />
                  </svg>
                </button>
              )}
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
                    : 'text-zinc-400 hover:text-amber-300 hover:bg-daw-hover'
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
        </>
      )}
        </>
      )}

      {/* Bottom-edge height resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
        onMouseDown={onHeightResizeDown}
      />
    </div>

    {/* Context menu */}
    {ctxMenu && (
      <ContextMenuWrapper x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
        <ContextMenuItem
          label="Open Piano Roll..."
          onClick={() => {
            setCtxMenu(null);
            if (track.trackType === 'pianoRoll') {
              const clip = track.clips.find((candidate) => candidate.midiData);
              setOpenPianoRoll(track.id, clip?.id ?? null);
            }
          }}
          disabled={track.trackType !== 'pianoRoll'}
        />
        <ContextMenuItem label="Open Effect Chain..." onClick={() => { setCtxMenu(null); setOpenEffectChainTrackId(track.id); }} />
        <ContextMenuItem label="Rename Track" onClick={() => { setCtxMenu(null); startEditing(); }} />
        <ContextMenuItem label="Track Settings..." onClick={() => { setCtxMenu(null); setEditModalOpen(true); }} />
        {/* Track Height submenu */}
        <div
          className="relative"
          onMouseEnter={() => setHeightSubmenu(true)}
          onMouseLeave={() => setHeightSubmenu(false)}
        >
          <ContextMenuItem
            label={<span className="flex items-center justify-between w-full">Track Height<span style={{ fontSize: 9, color: '#666', marginLeft: 8 }}>&#8250;</span></span>}
            onClick={() => {/* submenu trigger */}}
          />
          {heightSubmenu && (
            <div className="absolute left-full top-0">
              <ContextMenuSubmenu>
                {(['small', 'medium', 'large', 'auto'] as const).map((preset) => (
                  <ContextMenuItem
                    key={preset}
                    label={<span className="capitalize">{preset}</span>}
                    onClick={() => { setCtxMenu(null); setHeightSubmenu(false); setTrackHeightPreset(track.id, preset); }}
                  />
                ))}
                <ContextMenuSeparator />
                {(['small', 'large'] as const).map((preset) => (
                  <ContextMenuItem
                    key={`all-${preset}`}
                    label={<span className="capitalize">All Tracks {preset}</span>}
                    onClick={() => { setCtxMenu(null); setHeightSubmenu(false); setAllTracksHeightPreset(preset); }}
                    color="#a1a1aa"
                  />
                ))}
              </ContextMenuSubmenu>
            </div>
          )}
        </div>
        <ContextMenuItem label="Bounce in Place..." onClick={() => { setCtxMenu(null); openBounceInPlaceDialog(track.id); }} />
        <ContextMenuItem label="Duplicate Track" onClick={() => { setCtxMenu(null); duplicateTrack(track.id); }} />
        {/* Move to Group submenu — only for non-group tracks */}
        {!track.isGroup && (() => {
          const groups = project?.tracks.filter((t) => t.isGroup) ?? [];
          return groups.length > 0 ? (
            <div
              className="relative"
              onMouseEnter={() => setGroupSubmenu(true)}
              onMouseLeave={() => setGroupSubmenu(false)}
            >
              <ContextMenuItem
                label={<span className="flex items-center justify-between w-full">Move to Group<span style={{ fontSize: 9, color: '#666', marginLeft: 8 }}>&#8250;</span></span>}
                onClick={() => {/* submenu trigger */}}
              />
              {groupSubmenu && (
                <div className="absolute left-full top-0">
                  <ContextMenuSubmenu>
                    {groups.map((g) => (
                      <ContextMenuItem
                        key={g.id}
                        label={g.displayName}
                        onClick={() => { setCtxMenu(null); setGroupSubmenu(false); moveTrackToGroup(track.id, g.id); }}
                        color={track.parentTrackId === g.id ? '#4A5FFF' : undefined}
                      />
                    ))}
                    {track.parentTrackId && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          label="Remove from Group"
                          onClick={() => { setCtxMenu(null); setGroupSubmenu(false); moveTrackToGroup(track.id, null); }}
                          color="#a1a1aa"
                        />
                      </>
                    )}
                  </ContextMenuSubmenu>
                </div>
              )}
            </div>
          ) : null;
        })()}
        <ContextMenuSeparator />
        {/* More... submenu — infrequent actions */}
        <div
          className="relative"
          onMouseEnter={() => setMoreSubmenu(true)}
          onMouseLeave={() => setMoreSubmenu(false)}
        >
          <ContextMenuItem
            label={<span className="flex items-center justify-between w-full">More...<span style={{ fontSize: 9, color: '#666', marginLeft: 8 }}>&#8250;</span></span>}
            onClick={() => {/* submenu trigger */}}
          />
          {moreSubmenu && (
            <div className="absolute left-full top-0">
              <ContextMenuSubmenu>
                <ContextMenuItem label="Save as Track Preset..." onClick={() => { setCtxMenu(null); setMoreSubmenu(false); handleSavePreset(); }} />
                {track.clips.some((c) => c.midiData?.notes.length) && (
                  <ContextMenuItem label="Export MIDI" onClick={() => { setCtxMenu(null); setMoreSubmenu(false); exportTrackMidi(track.id); }} />
                )}
                <ContextMenuItem label="Flatten Track" onClick={() => { setCtxMenu(null); setMoreSubmenu(false); void handleFlatten(); }} />
              </ContextMenuSubmenu>
            </div>
          )}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          label={track.isGroup ? 'Delete Group (keeps children)' : 'Delete Track'}
          onClick={() => { setCtxMenu(null); track.isGroup ? removeGroupTrack(track.id) : requestDeleteTracks([track.id]); }}
          danger
          shortcut="⌘⌫"
        />
      </ContextMenuWrapper>
    )}

    {editModalOpen && (
      <TrackEditModal track={track} onClose={() => setEditModalOpen(false)} />
    )}
    </>
  );
}

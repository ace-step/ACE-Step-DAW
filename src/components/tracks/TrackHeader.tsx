import React, { useCallback, useRef, useState } from 'react';
import type { Track, InputMonitoringMode } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TRACK_CATALOG } from '../../constants/tracks';
import { TrackEditModal } from './TrackEditModal';
import { TrackHeaderMeter } from './TrackHeaderMeter';
import { FaderMeter } from './FaderMeter';
import { useRecording } from '../../hooks/useRecording';
import { freezeTrackToAudio, flattenTrackToAudio } from '../../services/freezeTrack';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';
import {
  ARRANGEMENT_GROUP_ROW_BG,
  ARRANGEMENT_HEADER_ROW_BG,
  ARRANGEMENT_ROW_SEPARATOR_COLOR,
} from '../arrangement/rowSurface';
import {
  getArrangementLaneHeightForRenderedRowHeight,
  getArrangementRowHeight,
} from '../arrangement/rowLayout';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator, ContextMenuSubmenu } from '../ui/ContextMenu';
import { toastError } from '../../hooks/useToast';

const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;

/** Track type abbreviation badge — compact label showing track type (e.g. STM, MIX, PNO). */
function TrackTypeIcon({ trackType, size = 10 }: { trackType: keyof typeof TRACK_TYPE_CATALOG; size?: number }) {
  const typeInfo = TRACK_TYPE_CATALOG[trackType];
  if (!typeInfo) return null;
  const abbr = typeInfo.abbr;
  return (
    <span
      className="text-zinc-500 font-mono leading-none select-none"
      style={{ fontSize: size - 2 }}
      title={typeInfo.label}
    >
      {abbr}
    </span>
  );
}

/** 6-dot grip icon for drag handles — appears on hover. */
function DragGripIcon({ className }: { className?: string }) {
  return (
    <svg
      width="6"
      height="10"
      viewBox="0 0 6 10"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="1.5" cy="1.5" r="1" />
      <circle cx="4.5" cy="1.5" r="1" />
      <circle cx="1.5" cy="5" r="1" />
      <circle cx="4.5" cy="5" r="1" />
      <circle cx="1.5" cy="8.5" r="1" />
      <circle cx="4.5" cy="8.5" r="1" />
    </svg>
  );
}

/** Snowflake-style icon shown next to frozen track names. */
function FrozenIcon() {
  return (
    <svg
      className="inline-block text-cyan-400 mr-0.5 align-text-bottom"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Frozen"
    >
      <title>Frozen</title>
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

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

export const TrackHeader = React.memo(function TrackHeader({
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

  // Narrow selectors: avoid subscribing to entire project object
  const anySoloed = useProjectStore((s) => s.project?.tracks.some((t) => t.soloed) ?? false);
  const isImpliedMute = anySoloed && !track.soloed;
  const hasAutomationLane = useProjectStore((s) => (s.project?.automationLanes ?? []).some((lane) => lane.trackId === track.id));
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);
  const isFxPanelOpen = useUIStore((s) => s.openEffectChainTrackId === track.id);
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
  const effectsBypassed = track.effectsBypassed ?? false;
  const headerBackgroundColor = track.isGroup ? ARRANGEMENT_GROUP_ROW_BG : ARRANGEMENT_HEADER_ROW_BG;
  const isTwoRow = laneHeight >= 60;
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
    const preset = saveTrackPreset(track.id, trimmedName);
    if (!preset) {
      toastError('Track presets cannot be saved in viewer mode.');
    }
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
      className={`relative flex items-center gap-2 border-b group select-none transition-[background-color,filter] duration-100 hover:brightness-[1.04] ${
        isDragOver ? 'bg-daw-hover-subtle' : ''
      } ${isImpliedMute ? 'daw-implied-mute' : ''} ${track.soloed ? 'daw-soloed' : ''}`}
      style={{
        backgroundColor: isDragOver ? undefined : headerBackgroundColor,
        borderColor: 'transparent',
        borderImage: isDragOver
          ? undefined
          : `linear-gradient(90deg, transparent 0%, ${ARRANGEMENT_ROW_SEPARATOR_COLOR} 10%, ${ARRANGEMENT_ROW_SEPARATOR_COLOR} 90%, transparent 100%) 1`,
        height: rowHeight,
        paddingLeft: isCollapsed ? 0 : isChild ? 24 : 8,
        paddingRight: isCollapsed ? 0 : 8,
        borderTop: isDragOver && dragOverPosition === 'before' ? '2px solid var(--color-daw-accent)' : undefined,
        borderBottom: isDragOver && dragOverPosition === 'after' ? '2px solid var(--color-daw-accent)' : undefined,
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
        const currentProject = useProjectStore.getState().project;
        if (e.shiftKey && currentProject) {
          // Shift+click: range select
          const selectedIds = useUIStore.getState().selectedTrackIds;
          const tracks = currentProject.tracks;
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
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none rounded-inherit"
          style={{
            backgroundColor: 'rgba(94, 89, 255, 0.18)',
            borderLeft: '2px solid rgba(94, 89, 255, 0.6)',
            transition: 'background-color var(--duration-normal) var(--ease-out)',
          }}
        />
      )}

      {/* Muted track: diagonal stripe overlay */}
      {track.muted && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none daw-mute-stripes"
          style={{ transition: 'opacity var(--duration-normal) var(--ease-out)' }}
        />
      )}

      {/* Color strip (left edge) — red when armed, golden glow when soloed */}
      <div
        className={`absolute left-0 top-0 bottom-0 rounded-r-sm cursor-pointer hover:w-2 transition-all duration-100 ${
          isArmed
            ? 'w-[6px] animate-pulse'
            : track.soloed
              ? 'w-[6px] shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              : 'w-[6px] hover:shadow-[0_0_6px_var(--track-color)]'
        }`}
        style={{
          backgroundColor: isArmed ? '#ef4444' : track.soloed ? '#10b981' : track.color,
          '--track-color': track.color,
        } as React.CSSProperties}
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
        <div
          data-testid="track-header-motion-shell"
          className="flex h-full w-full flex-col items-center justify-between py-2 animate-[fadeIn_150ms_ease-out]"
        >
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
            <div className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity duration-100 cursor-grab active:cursor-grabbing" title="Drag to reorder">
              <DragGripIcon />
            </div>
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
        <div
          data-testid="track-header-motion-shell"
          className="flex h-full min-w-0 flex-1 items-center gap-2 animate-[fadeIn_150ms_ease-out]"
        >
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
          className="flex-shrink-0 ml-1 w-4 flex items-center justify-center text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-400 cursor-grab active:cursor-grabbing transition-opacity duration-100"
          title="Drag to reorder"
        >
          <DragGripIcon />
        </div>
      )}

      {/* Instrument icon + track type badge */}
      <div className="flex-shrink-0 flex items-center gap-1">
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-sm"
          style={{ backgroundColor: track.color + '20' }}
          title={track.isGroup ? 'Group' : info.displayName}
        >
          {track.isGroup ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h4l2 2h6v7H2V4z" fill={track.color + '40'} />
            </svg>
          ) : info.emoji}
        </div>
        {!track.isGroup && isTwoRow && track.trackType && (
          <TrackTypeIcon trackType={track.trackType} size={10} />
        )}
      </div>

      {/* Track name element (shared between layouts) */}
      {isTwoRow ? (
        /* Two-row layout for non-compact tracks (laneHeight >= 60) */
        <div className="flex-1 min-w-[60px] flex flex-col gap-1 py-1">
          {/* Row 1: drag handle + instrument icon + name + M/S/Arm */}
          <div data-testid="track-header-row1" className="flex items-center gap-1 w-full">
            <div className="flex-1 min-w-[60px]">
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
                  className={`text-[11px] font-medium text-zinc-200 block truncate cursor-text leading-tight ${
                    track.muted ? 'line-through decoration-zinc-500' : ''
                  }`}
                  title={track.displayName}
                  onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
                >
                  {track.frozen && <FrozenIcon />}
                  {track.displayName}
                </span>
              )}
            </div>
            {track.trackType !== 'video' ? (
            <div
              data-primary-actions
              className="flex items-center gap-0.5 overflow-hidden"
            >
              <button
                onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
                className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                  track.muted ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                title="Mute (M)"
                aria-label={`Mute ${track.displayName}`}
              >M</button>
              <button
                onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
                className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                  track.soloed ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                title="Solo (S)"
                aria-label={`Solo ${track.displayName}`}
              >S</button>
              {!track.isGroup && (
                <button
                  onClick={() => setOpenEffectChainTrackId(isFxPanelOpen ? null : track.id)}
                  className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    track.frozen
                      ? 'text-zinc-600 cursor-not-allowed'
                      : isFxPanelOpen
                        ? 'text-sky-400'
                        : effectsBypassed
                          ? 'text-orange-400'
                          : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                  title={track.frozen ? 'Effects bypassed (track frozen)' : isFxPanelOpen ? 'Close effects chain' : 'Effects chain (FX)'}
                  aria-label={`Effects for ${track.displayName}`}
                >FX</button>
              )}
              {!track.isGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleArmTrack(track.id); }}
                  className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none flex items-center justify-center transition-colors duration-150`}
                  title="Record Arm"
                  aria-label={`Record arm ${track.displayName}`}
                >
                  <div className={`w-[8px] h-[8px] rounded-full ${isArmed ? 'bg-red-500' : 'bg-zinc-500 hover:bg-zinc-300'}`} />
                </button>
              )}
            </div>
            ) : (
              <div data-primary-actions className="flex items-center gap-1">
                <span className="text-[9px] text-zinc-500 font-medium">🎬 VID</span>
              </div>
            )}
          </div>

          {/* Row 2: combined fader + stereo meter (hidden for video tracks) */}
          {track.trackType !== 'video' && (
          <div data-testid="track-header-row2" className="w-full">
            <FaderMeter
              trackId={track.id}
              volume={track.volume}
              onVolumeChange={(v) => updateTrack(track.id, { volume: v })}
              trackName={track.displayName}
            />
          </div>
          )}
        </div>
      ) : (
        /* Single-row compact layout (laneHeight < 60) */
        <>
          <div className="flex-1 min-w-[60px] flex flex-col gap-1 py-1">
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
                className={`text-[11px] font-medium text-zinc-200 block truncate cursor-text leading-tight ${
                  track.muted ? 'line-through decoration-zinc-500' : ''
                }`}
                title={track.displayName}
                onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
              >
                {track.frozen && <FrozenIcon />}
                {track.displayName}
              </span>
            )}
          </div>

          {/* Compact M/S/FX buttons + volume slider + meter */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
              className={`text-[8px] font-bold leading-none transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                track.muted ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
              title="Mute (M)"
              aria-label={`Mute ${track.displayName}`}
            >M</button>
            <button
              onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
              className={`text-[8px] font-bold leading-none transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                track.soloed ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
              title="Solo (S)"
              aria-label={`Solo ${track.displayName}`}
            >S</button>
            <div className="flex-1 min-w-[40px]">
              <FaderMeter
                trackId={track.id}
                volume={track.volume}
                onVolumeChange={(v) => updateTrack(track.id, { volume: v })}
                trackName={track.displayName}
              />
            </div>
          </div>
        </>
      )}
        </div>
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
        <ContextMenuSeparator />
        <ContextMenuItem
          label={`Input Monitoring: ${monitorMode === 'off' ? 'Off' : monitorMode === 'auto' ? 'Auto' : 'On'}`}
          onClick={() => { setCtxMenu(null); cycleMonitor(); }}
        />
        <ContextMenuItem
          label={track.frozen ? 'Unfreeze Track' : 'Freeze Track'}
          onClick={() => { setCtxMenu(null); void handleFreeze(); }}
        />
        {!track.isGroup && (
          <ContextMenuItem
            label={`Effects Bypass${effectsBypassed ? ' (active)' : ''}`}
            onClick={() => { setCtxMenu(null); toggleTrackEffectsBypass(track.id); }}
          />
        )}
        <ContextMenuSeparator />
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
        <ContextMenuItem label="Bounce to Audio" onClick={() => { setCtxMenu(null); void useProjectStore.getState().bounceTrackToAudio(track.id); }} />
        {track.trackType === 'strudel' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem label="Freeze to MIDI" onClick={() => { setCtxMenu(null); void useProjectStore.getState().freezeStrudelToMidi(track.id); }} />
            <ContextMenuItem label="Freeze to Drum Machine" onClick={() => { setCtxMenu(null); void useProjectStore.getState().freezeStrudelToDrumMachine(track.id); }} />
            <ContextMenuItem label="Capture Version Snapshot" onClick={() => { setCtxMenu(null); useProjectStore.getState().captureStrudelVersion(track.id); }} />
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem label="Duplicate Track" onClick={() => { setCtxMenu(null); duplicateTrack(track.id); }} />
        {/* Move to Group submenu — only for non-group tracks */}
        {!track.isGroup && (() => {
          const groups = useProjectStore.getState().project?.tracks.filter((t) => t.isGroup) ?? [];
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
});

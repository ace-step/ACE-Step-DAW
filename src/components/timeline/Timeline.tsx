import { useRef, useCallback, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import type { TempoEvent, Track } from '../../types/project';
import { TrackHeader } from '../tracks/TrackHeader';
import { TrackListDisplayToggle } from '../tracks/TrackListDisplayToggle';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { snapToGrid } from '../../utils/time';
import { RegionRegenerateModal } from '../generation/RegionRegenerateModal';
import { CanvasContextMenu } from './CanvasContextMenu';
import { ClipContextMenuFallback } from './ClipContextMenuFallback';
import { InlineSuggestionBadge } from './InlineSuggestionBadge';
import { useAudioImport } from '../../hooks/useAudioImport';
import { clientXToLaneX } from '../../utils/timelineCoords';
import { Minimap } from './Minimap';
import { TempoLane } from './TempoLane';
import { TimeSignatureLane } from './TimeSignatureLane';
import { ArrangementMarkers } from './ArrangementMarkers';
import { SelectionFloatingToolbar } from './SelectionFloatingToolbar';
import { EmptyState } from '../layout/EmptyState';
import {
  buildArrangementTrackSlots,
  getArrangementEmptyTrackId,
  getArrangementVisibleRowCount,
} from '../arrangement/trackSlotLayout';
import {
  ARRANGEMENT_MARKERS_HEIGHT,
  TEMPO_LANE_HEIGHT,
  TIME_SIGNATURE_LANE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
} from './timelineLayout';
import { TimelineWindowOverlay } from './TimelineWindowOverlay';
import { useTimelineScroll } from './useTimelineScroll';
import { useTimelineDragSelection, getTrackVerticalRange } from './useTimelineDragSelection';
import { ArrangementEmptyTrackHeaderRow, EmptyTrackRow } from './EmptyTrackRows';

/** @deprecated Inspector is now a modal; kept for potential future use */
export const TRACK_INSPECTOR_HEIGHT = 220;

const EMPTY_TRACKS: Track[] = [];
const EMPTY_TEMPO_MAP: TempoEvent[] = [];

export function Timeline() {
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap ?? EMPTY_TEMPO_MAP);
  const addTrack = useProjectStore((s) => s.addTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const moveTrackToOrder = useProjectStore((s) => s.moveTrackToOrder);
  const setTimelineFocused = useUIStore((s) => s.setTimelineFocused);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const trackListDisplayMode = useUIStore((s) => s.trackListDisplayMode);
  const setTrackListWidth = useUIStore((s) => s.setTrackListWidth);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const keyboardContext = useUIStore((s) => s.keyboardContext);
  const setScrollX = useUIStore((s) => s.setScrollX);
  const setScrollY = useUIStore((s) => s.setScrollY);
  const regionRegenerateTarget = useUIStore((s) => s.regionRegenerateTarget);
  const inlineSuggestions = useUIStore((s) => s.inlineSuggestions);
  const suggestionFrequency = useUIStore((s) => s.suggestionFrequency);
  const showsArrangementMarkers = useUIStore((s) => s.showArrangementMarkers);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const [regionCtxMenu, setRegionCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number; clipId?: string } | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [dragOverEmptySlotIndex, setDragOverEmptySlotIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');
  const draggedTrackIdRef = useRef<string | null>(null);
  const trackListResizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const {
    importAudioToTrack: importAudioToTrackMain,
    importMultipleFiles,
    importLoopToTrack,
    importAudioFileAsNewQuickSampler,
    importAssetAsNewTrack,
  } = useAudioImport();

  const isTrackListCollapsed = trackListDisplayMode === 'collapsed';

  // --- Extracted hooks ---
  const { mergedScrollRef, viewportWidth, totalWidth } = useTimelineScroll(scrollRef);
  const {
    ctxDrag,
    selDrag,
    handleMouseDownCapture,
    startWindowMove,
    switchTimelineWindow,
  } = useTimelineDragSelection(scrollRef, trackAreaRef);

  // --- Drag handlers for file/loop/asset drops onto timeline ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();

    const laneX = clientXToLaneX(e.clientX);
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));

    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      const newTrack = addTrack('custom', 'sample');
      await importLoopToTrack(loopId, newTrack.id, startTime);
      return;
    }

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsNewTrack(assetId, startTime);
      return;
    }

    const wantsQuickSampler = e.altKey;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
          if (wantsQuickSampler) {
            await importAudioFileAsNewQuickSampler(file);
          } else {
            const newTrack = addTrack('custom', 'sample');
            useProjectStore.getState().updateTrack(newTrack.id, {
              displayName: file.name.replace(/\.[^.]+$/, ''),
            });
            await importAudioToTrackMain(file, newTrack.id, startTime);
          }
        } else if (/\.(mid|midi)$/i.test(file.name)) {
          await importMultipleFiles([file]);
        }
      }
    }
  }, [addTrack, bpm, tempoMap, pixelsPerSecond, importAudioToTrackMain, importMultipleFiles, importLoopToTrack, importAudioFileAsNewQuickSampler, importAssetAsNewTrack]);

  // --- Track header drag-reorder handlers ---
  const handleTrackHeaderDragStart = useCallback((trackId: string) => {
    draggedTrackIdRef.current = trackId;
  }, []);

  const handleTrackHeaderDragOver = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    if (!draggedTrackIdRef.current || draggedTrackIdRef.current === trackId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverTrackId(trackId);
    setDragOverEmptySlotIndex(null);
    setDragOverPosition(e.clientY < midY ? 'before' : 'after');
  }, []);

  const handleTrackHeaderDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedTrackId = draggedTrackIdRef.current;
    if (!draggedTrackId || draggedTrackId === targetId) {
      setDragOverTrackId(null);
      setDragOverEmptySlotIndex(null);
      draggedTrackIdRef.current = null;
      return;
    }
    reorderTrack(draggedTrackId, targetId, dragOverPosition);
    setDragOverTrackId(null);
    setDragOverEmptySlotIndex(null);
    draggedTrackIdRef.current = null;
  }, [dragOverPosition, reorderTrack]);

  const handleEmptyTrackHeaderDragOver = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    if (!draggedTrackIdRef.current || !hasProject) return;
    const draggedTrack = tracks.find((track) => track.id === draggedTrackIdRef.current);
    if (draggedTrack?.isGroup) return;
    setDragOverTrackId(null);
    setDragOverEmptySlotIndex(slotIndex);
  }, [hasProject, tracks]);

  const handleEmptyTrackHeaderDrop = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    const draggedTrackId = draggedTrackIdRef.current;
    if (!draggedTrackId || !hasProject) {
      setDragOverTrackId(null);
      setDragOverEmptySlotIndex(null);
      draggedTrackIdRef.current = null;
      return;
    }
    const draggedTrack = tracks.find((track) => track.id === draggedTrackId);
    if (draggedTrack?.isGroup) {
      setDragOverTrackId(null);
      setDragOverEmptySlotIndex(null);
      draggedTrackIdRef.current = null;
      return;
    }
    moveTrackToOrder(draggedTrackId, slotIndex + 1);
    setDragOverTrackId(null);
    setDragOverEmptySlotIndex(null);
    draggedTrackIdRef.current = null;
  }, [hasProject, moveTrackToOrder, tracks]);

  // --- Track list resize handle ---
  const handleTrackListResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    trackListResizeRef.current = { startX: e.clientX, startW: trackListWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!trackListResizeRef.current) return;
      const delta = ev.clientX - trackListResizeRef.current.startX;
      setTrackListWidth(trackListResizeRef.current.startW + delta);
    };
    const onMouseUp = () => {
      trackListResizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [setTrackListWidth, trackListWidth]);

  // --- Derived data ---
  const sortedTracks = useMemo(() => {
    const collapsedGroupIds = new Set(
      tracks
        .filter((track) => track.isGroup && track.collapsed)
        .map((track) => track.id),
    );

    return [...tracks]
      .filter((track) => !track.parentTrackId || !collapsedGroupIds.has(track.parentTrackId))
      .sort((a, b) => a.order - b.order);
  }, [tracks]);

  const arrangementVisibleRowCount = useMemo(
    () => getArrangementVisibleRowCount(sortedTracks),
    [sortedTracks],
  );
  const arrangementRows = useMemo(
    () => buildArrangementTrackSlots(sortedTracks, arrangementVisibleRowCount),
    [arrangementVisibleRowCount, sortedTracks],
  );
  const blockedEmptySlotOrders = useMemo(() => {
    const collapsedGroupIds = new Set(
      tracks
        .filter((track) => track.isGroup && track.collapsed)
        .map((track) => track.id),
    );

    return new Set(
      tracks
        .filter((track) => track.parentTrackId && collapsedGroupIds.has(track.parentTrackId))
        .map((track) => track.order),
    );
  }, [tracks]);

  const selectedClipLabel = useMemo(() => {
    if (!hasProject || selectedClipIds.size === 0) return 'No clip selected';
    const selectedId = Array.from(selectedClipIds)[0];
    const selectedClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedId);
    if (!selectedClip) return 'No clip selected';
    const trackName = tracks.find((track) => track.id === selectedClip.trackId)?.displayName ?? 'Unknown track';
    return `${trackName} @ ${selectedClip.startTime.toFixed(2)}s`;
  }, [hasProject, selectedClipIds, tracks]);

  const focusedTrackLabel = useMemo(() => {
    if (!hasProject || !keyboardContext.trackId) return 'Project';
    return tracks.find((track) => track.id === keyboardContext.trackId)?.displayName ?? 'Project';
  }, [hasProject, keyboardContext.trackId, tracks]);

  // --- Early return for no-project state ---
  if (!hasProject) {
    return <EmptyState />;
  }

  // --- Window overlay geometry ---
  const ctxLeft = contextWindow ? contextWindow.startTime * pixelsPerSecond : null;
  const ctxWidth = contextWindow
    ? (contextWindow.endTime - contextWindow.startTime) * pixelsPerSecond
    : null;
  const ctxVRange = contextWindow && scrollRef.current && trackAreaRef.current
    ? (() => {
        const vr = getTrackVerticalRange(scrollRef.current!, contextWindow.trackIds);
        if (!vr) return null;
        const cRect = scrollRef.current!.getBoundingClientRect();
        const taTop = trackAreaRef.current!.getBoundingClientRect().top - cRect.top + scrollRef.current!.scrollTop;
        return { top: vr.top - taTop, height: vr.height };
      })()
    : null;

  const selLeft = selectWindow ? selectWindow.startTime * pixelsPerSecond : null;
  const selWidth = selectWindow
    ? (selectWindow.endTime - selectWindow.startTime) * pixelsPerSecond
    : null;
  const selVRange = selectWindow && scrollRef.current && trackAreaRef.current
    ? (() => {
        const vr = getTrackVerticalRange(scrollRef.current!, selectWindow.trackIds);
        if (!vr) return null;
        const cRect = scrollRef.current!.getBoundingClientRect();
        const taTop = trackAreaRef.current!.getBoundingClientRect().top - cRect.top + scrollRef.current!.scrollTop;
        return { top: vr.top - taTop, height: vr.height };
      })()
    : null;

  const trackColumnHeaderHeight = TIMELINE_RULER_HEIGHT
    + (showsArrangementMarkers ? ARRANGEMENT_MARKERS_HEIGHT : 0)
    + (showTempoLane ? TEMPO_LANE_HEIGHT + TIME_SIGNATURE_LANE_HEIGHT : 0);
  const arrangementSurfaceWidth = trackListWidth + Math.max(totalWidth, viewportWidth);

  return (
    <>
      <Minimap />
      <div
        ref={mergedScrollRef}
        id="arrangement-timeline-scroll"
        data-keyboard-context="timeline"
        role="grid"
        tabIndex={0}
        data-onboarding-target="timeline"
        className="arrangement-scrollbar-hidden flex-1 overflow-auto bg-[#1c1d22] relative group"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollX(el.scrollLeft);
          setScrollY(el.scrollTop);
        }}
        onMouseDownCapture={handleMouseDownCapture}
        onFocus={() => { setKeyboardContext('timeline'); setTimelineFocused(true); }}
        onBlur={() => setTimelineFocused(false)}
        onMouseDown={() => setKeyboardContext('timeline')}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest?.('[data-track-column-region="true"]')) return;
          if (target.closest?.('[data-clip-block]')) return;
          if (target.closest?.('[data-sequencer-grid]')) return;
          // Fallback: find clip at click position by bounding rect check.
          // On macOS, two-finger trackpad press may fire contextmenu with e.target
          // being the lane instead of the clip, so we search all clip blocks.
          const allClipBlocks = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-clip-block]');
          for (const clipBlock of allClipBlocks) {
            const rect = clipBlock.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
              const clipId = clipBlock.getAttribute('data-clip-id');
              if (clipId) {
                e.preventDefault();
                setCanvasCtxMenu({ x: e.clientX, y: e.clientY, clipId });
                return;
              }
            }
          }
          if (selectWindow) {
            const selEl = target.closest?.('[style]');
            if (selEl && (selEl as HTMLElement).style.borderLeft?.includes('175, 82, 222')) return;
          }
          e.preventDefault();
          setCanvasCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ cursor: 'default' }}
      >
        <div
          className="relative grid"
          style={{
            width: arrangementSurfaceWidth || '100%',
            gridTemplateColumns: `${trackListWidth}px ${totalWidth}px`,
            gridTemplateRows: `${trackColumnHeaderHeight}px auto`,
          }}
        >
          {/* Track list column header */}
          <div
            id="arrangement-track-list"
            data-track-column-region="true"
            className="sticky top-0 left-0 z-40 flex flex-col bg-[#2a2a2a] border-r border-[#1a1a1a]"
            style={{ gridColumn: '1', gridRow: '1', width: trackListWidth, height: trackColumnHeaderHeight }}
          >
            <div
              className={`shrink-0 border-b border-[#3a3a3a] bg-[#333] flex items-center ${isTrackListCollapsed ? 'px-1.5 justify-center' : 'px-2 justify-between'}`}
              style={{ height: TIMELINE_RULER_HEIGHT }}
            >
              {!isTrackListCollapsed && (
                <span className="text-[10px] text-zinc-400 uppercase tracking-[0.24em] font-medium">Tracks</span>
              )}
              <TrackListDisplayToggle />
            </div>

            {showsArrangementMarkers && (
              <div
                className="shrink-0 border-b border-[#333] bg-[#242424]"
                style={{ height: ARRANGEMENT_MARKERS_HEIGHT }}
                data-testid="tracklist-marker-spacer"
              />
            )}

            {showTempoLane && (
              <div
                className="shrink-0 border-b border-white/10 bg-[rgba(245,158,11,0.03)]"
                style={{ height: TEMPO_LANE_HEIGHT + TIME_SIGNATURE_LANE_HEIGHT }}
                data-testid="tracklist-tempo-spacer"
              />
            )}

            {!isTrackListCollapsed && (
              <div
                className="absolute top-0 right-0 w-1.5 cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
                style={{ height: trackColumnHeaderHeight }}
                onMouseDown={handleTrackListResizeMouseDown}
              />
            )}
          </div>

          {/* Timeline header (ruler, markers, tempo) */}
          <div
            className="sticky top-0 z-30 bg-[#1c1d22]"
            style={{ gridColumn: '2', gridRow: '1', width: totalWidth }}
          >
            <TimeRuler />
            {showsArrangementMarkers && <ArrangementMarkers />}
            {showTempoLane && (
              <>
                <TempoLane />
                <TimeSignatureLane />
              </>
            )}
          </div>

          {/* Track list body */}
          <div
            data-track-column-region="true"
            className="sticky left-0 z-20 bg-[#2a2a2a] border-r border-[#1a1a1a]"
            style={{ gridColumn: '1', gridRow: '2', width: trackListWidth }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverTrackId(null);
                setDragOverEmptySlotIndex(null);
              }
            }}
          >
            {arrangementRows.map((row) => (row.kind === 'track' ? (
              <TrackHeader
                key={row.track.id}
                track={row.track}
                isCollapsed={isTrackListCollapsed}
                isChild={!!row.track.parentTrackId}
                onDragStart={handleTrackHeaderDragStart}
                onDragOver={handleTrackHeaderDragOver}
                onDrop={handleTrackHeaderDrop}
                isDragOver={dragOverTrackId === row.track.id}
                dragOverPosition={dragOverTrackId === row.track.id ? dragOverPosition : null}
              />
            ) : (
              <ArrangementEmptyTrackHeaderRow
                key={getArrangementEmptyTrackId(row.slotIndex)}
                slotIndex={row.slotIndex}
                isCollapsed={isTrackListCollapsed}
                isDropDisabled={blockedEmptySlotOrders.has(row.slotIndex + 1)}
                isDragOver={dragOverEmptySlotIndex === row.slotIndex}
                onDragOver={handleEmptyTrackHeaderDragOver}
                onDrop={handleEmptyTrackHeaderDrop}
              />
            )))}

            {!isTrackListCollapsed && (
              <div
                className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
                onMouseDown={handleTrackListResizeMouseDown}
              />
            )}
          </div>

          {/* Track lanes area */}
          <div className="relative" style={{ gridColumn: '2', gridRow: '2', width: totalWidth }}>
            <GridOverlay />
            <Playhead />

            <div ref={trackAreaRef} className="relative" style={{ contain: 'style layout' }}>

              {/* Committed context window overlay */}
              {ctxLeft !== null && ctxWidth !== null && ctxVRange && (
                <TimelineWindowOverlay
                  kind="context"
                  left={ctxLeft}
                  width={ctxWidth}
                  top={ctxVRange.top}
                  height={ctxVRange.height}
                  label="context window"
                  switchLabel="SEL"
                  switchAriaLabel="Convert context window into select window"
                  accentTextColor="#5AC8FA"
                  fillColor="rgba(90, 200, 250, 0.10)"
                  borderColor="rgba(90, 200, 250, 0.35)"
                  edgeColor="rgba(90, 200, 250, 0.7)"
                  align="left"
                  onMoveStart={(e) => startWindowMove('context', contextWindow!, e)}
                  onSwitch={() => switchTimelineWindow('context')}
                />
              )}

              {/* Committed select window overlay */}
              {selLeft !== null && selWidth !== null && selVRange && (
                <TimelineWindowOverlay
                  kind="select"
                  left={selLeft}
                  width={selWidth}
                  top={selVRange.top}
                  height={selVRange.height}
                  label="select window"
                  switchLabel="CTX"
                  switchAriaLabel="Convert select window into context window"
                  accentTextColor="#FFFFFF"
                  fillColor="rgba(255, 255, 255, 0.03)"
                  borderColor="rgba(255, 255, 255, 1)"
                  edgeColor="rgba(255, 255, 255, 1)"
                  align="right"
                  onMoveStart={(e) => startWindowMove('select', selectWindow!, e)}
                  onSwitch={() => switchTimelineWindow('select')}
                  onContextMenu={(e) => {
                    setRegionCtxMenu({ x: e.clientX, y: e.clientY });
                  }}
                />
              )}

              {/* Floating toolbar below select window */}
              <SelectionFloatingToolbar
                selLeft={selLeft}
                selWidth={selWidth}
                selBottom={selVRange ? selVRange.top + selVRange.height : null}
              />

              {/* Live context drag overlay */}
              {ctxDrag && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: ctxDrag.left,
                    width: ctxDrag.width,
                    top: ctxDrag.top,
                    height: ctxDrag.height,
                    background: 'rgba(90, 200, 250, 0.12)',
                    borderLeft: '1px solid rgba(90, 200, 250, 0.5)',
                    borderRight: '1px solid rgba(90, 200, 250, 0.5)',
                    borderTop: '1px solid rgba(90, 200, 250, 0.3)',
                    borderBottom: '1px solid rgba(90, 200, 250, 0.3)',
                  }}
                />
              )}

              {/* Live select drag overlay — accent-tinted with smooth fill */}
              {selDrag && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: selDrag.left,
                    width: selDrag.width,
                    top: selDrag.top,
                    height: selDrag.height,
                    background: 'rgba(94, 89, 255, 0.10)',
                    border: '1px solid rgba(94, 89, 255, 0.7)',
                    borderRadius: 1,
                  }}
                />
              )}
              {arrangementRows.map((row) => (row.kind === 'track' ? (
                <TrackLane key={row.track.id} track={row.track} />
              ) : (
                <EmptyTrackRow key={getArrangementEmptyTrackId(row.slotIndex)} slotIndex={row.slotIndex} />
              )))}

              {/* Inline AI suggestion badges */}
              {suggestionFrequency !== 'off' && inlineSuggestions.map((s) => (
                <InlineSuggestionBadge
                  key={s.id}
                  suggestion={s}
                  pixelsPerSecond={pixelsPerSecond}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Region context menu */}
      {regionCtxMenu && selectWindow && (
        <CanvasContextMenu
          x={regionCtxMenu.x}
          y={regionCtxMenu.y}
          onClose={() => setRegionCtxMenu(null)}
        />
      )}

      {/* Region regeneration modal */}
      {regionRegenerateTarget && <RegionRegenerateModal />}

      {/* Canvas context menu — or clip context menu when macOS trackpad fallback detected a clip */}
      {canvasCtxMenu && (
        canvasCtxMenu.clipId ? (
          <ClipContextMenuFallback
            x={canvasCtxMenu.x}
            y={canvasCtxMenu.y}
            clipId={canvasCtxMenu.clipId}
            onClose={() => setCanvasCtxMenu(null)}
          />
        ) : (
          <CanvasContextMenu
            x={canvasCtxMenu.x}
            y={canvasCtxMenu.y}
            onClose={() => setCanvasCtxMenu(null)}
          />
        )
      )}
    </>
  );
}

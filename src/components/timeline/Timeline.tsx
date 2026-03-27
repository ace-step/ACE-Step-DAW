import { useRef, useCallback, useState, useEffect, useMemo, useLayoutEffect } from 'react';
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
import { getBarDuration, snapToGrid } from '../../utils/time';
import { MultiTrackGenerateModal } from '../generation/MultiTrackGenerateModal';
import { RegionRegenerateModal } from '../generation/RegionRegenerateModal';
import { RegionContextMenu } from './RegionContextMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { InlineSuggestionBadge } from './InlineSuggestionBadge';
import { useAudioImport } from '../../hooks/useAudioImport';
import { getDragPayload, clearDragPayload } from '../../utils/dragPayload';
import { clientXToLaneX } from '../../utils/timelineCoords';
import { Minimap } from './Minimap';
import { TempoLane } from './TempoLane';
import { TimeSignatureLane } from './TimeSignatureLane';
import { ArrangementMarkers } from './ArrangementMarkers';
import { SelectionFloatingToolbar } from './SelectionFloatingToolbar';
import { toastInfo } from '../../hooks/useToast';
import {
  clampTimelineScrollLeft,
  clampTimelinePixelsPerSecond,
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  getNextTimelineZoomLevel,
  getTimelineContentWidth,
  getTimelineFitViewport,
  getTimelineZoomAnchor,
  getZoomedTimelineViewport,
} from '../../utils/timelineZoom';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import { convertTimelineWindowMode, moveTimelineWindow, type TimelineWindowRange } from './timelineWindowUtils';
import {
  buildArrangementTrackSlots,
  getArrangementEmptyTrackId,
  getArrangementVisibleRowCount,
} from '../arrangement/trackSlotLayout';
import { DEFAULT_ARRANGEMENT_ROW_HEIGHT } from '../arrangement/rowLayout';
import {
  ARRANGEMENT_MARKERS_HEIGHT,
  TEMPO_LANE_HEIGHT,
  TIME_SIGNATURE_LANE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
} from './timelineLayout';

/** @deprecated Inspector is now a modal; kept for potential future use */
export const TRACK_INSPECTOR_HEIGHT = 220;

const DRAG_THRESHOLD_PX = 4;
const WINDOW_CONTROL_BAR_HEIGHT = 24;
const EMPTY_TRACKS: Track[] = [];
const EMPTY_TEMPO_MAP: TempoEvent[] = [];

interface DragRect { left: number; width: number; top: number; height: number }

function getIntersectedTrackIds(container: HTMLElement, minY: number, maxY: number): string[] {
  const lanes = container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]');
  const cRect = container.getBoundingClientRect();
  const ids: string[] = [];
  for (const lane of lanes) {
    const r = lane.getBoundingClientRect();
    const laneTop = r.top - cRect.top + container.scrollTop;
    const laneBot = laneTop + r.height;
    if (laneBot > minY && laneTop < maxY) {
      ids.push(lane.dataset.trackId!);
    }
  }
  return ids;
}

function getTrackRowIndex(container: HTMLElement, trackId: string): number | null {
  const lanes = Array.from(container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]'));
  const rowIndex = lanes.findIndex((lane) => lane.dataset.trackId === trackId);
  return rowIndex === -1 ? null : rowIndex;
}

function getTrackVerticalRange(
  container: HTMLElement, trackIds: string[],
): { top: number; height: number } | null {
  if (trackIds.length === 0) return null;
  const cRect = container.getBoundingClientRect();
  let minTop = Infinity;
  let maxBot = -Infinity;
  const idSet = new Set(trackIds);
  const lanes = container.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]');
  for (const lane of lanes) {
    if (!idSet.has(lane.dataset.trackId!)) continue;
    const r = lane.getBoundingClientRect();
    const laneTop = r.top - cRect.top + container.scrollTop;
    const laneBot = laneTop + r.height;
    if (laneTop < minTop) minTop = laneTop;
    if (laneBot > maxBot) maxBot = laneBot;
  }
  if (minTop === Infinity) return null;
  return { top: minTop, height: maxBot - minTop };
}

interface TimelineWindowOverlayProps {
  kind: 'select' | 'context';
  left: number;
  width: number;
  top: number;
  height: number;
  label: string;
  switchLabel: string;
  switchAriaLabel: string;
  accentTextColor: string;
  fillColor: string;
  borderColor: string;
  edgeColor: string;
  align: 'left' | 'right';
  onMoveStart: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSwitch: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function TimelineWindowOverlay({
  kind,
  left,
  width,
  top,
  height,
  label,
  switchLabel,
  switchAriaLabel,
  accentTextColor,
  fillColor,
  borderColor,
  edgeColor,
  align,
  onMoveStart,
  onSwitch,
  onContextMenu,
}: TimelineWindowOverlayProps) {
  const justifyClass = align === 'left' ? 'justify-start' : 'justify-end';

  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{
        left,
        width,
        top,
        height,
        background: fillColor,
        borderLeft: `2px solid ${edgeColor}`,
        borderRight: `2px solid ${edgeColor}`,
        borderTop: `2px solid ${borderColor}`,
        borderBottom: `2px solid ${borderColor}`,
      }}
    >
      <div
        className={`absolute left-1 right-1 top-1 flex ${justifyClass}`}
      >
        <div
          className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.22em] shadow-[0_6px_20px_rgba(0,0,0,0.22)] backdrop-blur-sm cursor-grab active:cursor-grabbing"
          data-window-overlay-control="true"
          data-window-overlay-type={kind}
          aria-label={`${label} controls`}
          onMouseDown={onMoveStart}
          onContextMenu={(e) => {
            if (!onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e);
          }}
          style={{
            minHeight: WINDOW_CONTROL_BAR_HEIGHT,
            color: accentTextColor,
            background: 'rgba(18, 19, 24, 0.82)',
            borderColor,
          }}
        >
          <span className="truncate select-none">{label}</span>
          <button
            type="button"
            className="rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.18em] transition-colors hover:bg-white/8"
            data-window-overlay-control="true"
            aria-label={switchAriaLabel}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSwitch();
            }}
            style={{
              color: accentTextColor,
              borderColor,
            }}
          >
            {switchLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Timeline() {
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const timeSignature = useProjectStore((s) => s.project?.timeSignature ?? 4);
  const timeSignatureDenominator = useProjectStore((s) => s.project?.timeSignatureDenominator ?? 4);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap ?? EMPTY_TEMPO_MAP);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const moveTrackToOrder = useProjectStore((s) => s.moveTrackToOrder);
  const seek = useTransportStore((s) => s.seek);
  const currentTime = useTransportStore((s) => s.currentTime);
  const playStartTime = useTransportStore((s) => s.playStartTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const setTimelineFocused = useUIStore((s) => s.setTimelineFocused);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const setTimelineViewportWidth = useUIStore((s) => s.setTimelineViewportWidth);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const trackListDisplayMode = useUIStore((s) => s.trackListDisplayMode);
  const setTrackListWidth = useUIStore((s) => s.setTrackListWidth);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setContextWindow = useUIStore((s) => s.setContextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClips = useUIStore((s) => s.selectClips);
  const keyboardContext = useUIStore((s) => s.keyboardContext);
  const timelineZoomRequest = useUIStore((s) => s.timelineZoomRequest);
  const autoScrollEnabled = useUIStore((s) => s.autoScrollEnabled);
  const setScrollX = useUIStore((s) => s.setScrollX);
  const setScrollY = useUIStore((s) => s.setScrollY);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const deselectAllTracks = useUIStore((s) => s.deselectAllTracks);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const setRegionRegenerateTarget = useUIStore((s) => s.setRegionRegenerateTarget);
  const regionRegenerateTarget = useUIStore((s) => s.regionRegenerateTarget);
  const inlineSuggestions = useUIStore((s) => s.inlineSuggestions);
  const suggestionFrequency = useUIStore((s) => s.suggestionFrequency);

  const [regionCtxMenu, setRegionCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxDrag, setCtxDrag] = useState<DragRect | null>(null);
  const [selDrag, setSelDrag] = useState<DragRect | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [dragOverEmptySlotIndex, setDragOverEmptySlotIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');
  const draggedTrackIdRef = useRef<string | null>(null);
  const trackListResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const zoomTargetRef = useRef(pixelsPerSecond);
  const zoomAnchorRef = useRef<{ time: number; viewportX: number } | null>(null);
  const zoomFrameTimeRef = useRef<number | null>(null);
  const handledTimelineZoomRequestIdRef = useRef<number | null>(null);
  const { importAudioFile, importAudioToTrack: importAudioToTrackMain, importMultipleFiles, importLoopToTrack, importAssetToTrack, importAudioFileAsNewQuickSampler, importAssetAsQuickSampler } = useAudioImport();
  const isTrackListCollapsed = trackListDisplayMode === 'collapsed';

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

    // Handle preset loop drop -> create new sample track
    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      const newTrack = addTrack('custom', 'sample');
      await importLoopToTrack(loopId, newTrack.id, startTime);
      return;
    }

    // Handle asset drop -> create Quick Sampler track
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsQuickSampler(assetId);
      return;
    }

    // Audio files -> sample track (Alt+Drop -> Quick Sampler), MIDI files -> piano roll tracks
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
  }, [addTrack, bpm, tempoMap, pixelsPerSecond, importAudioToTrackMain, importMultipleFiles, importLoopToTrack, importAssetToTrack, importAudioFileAsNewQuickSampler, importAssetAsQuickSampler]);

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
  const showsArrangementMarkers = useUIStore((s) => s.showArrangementMarkers);

  const totalWidth = hasProject
    ? getTimelineContentWidth(totalDuration, pixelsPerSecond, viewportWidth)
    : 0;
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

  useEffect(() => {
    if (!hasProject || !timelineZoomRequest || !scrollRef.current) return;
    if (handledTimelineZoomRequestIdRef.current === timelineZoomRequest.id) return;

    const container = scrollRef.current;
    const nextViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);
    const projectRange = { startTime: 0, endTime: totalDuration };
    handledTimelineZoomRequestIdRef.current = timelineZoomRequest.id;

    let targetRange = projectRange;
    let usedFallback = false;

    if (timelineZoomRequest.mode === 'selection') {
      const selectedClips = tracks
        .flatMap((track) => track.clips)
        .filter((clip) => selectedClipIds.has(clip.id));

      if (selectedClips.length > 0) {
        targetRange = {
          startTime: Math.min(...selectedClips.map((clip) => clip.startTime)),
          endTime: Math.max(...selectedClips.map((clip) => clip.startTime + clip.duration)),
        };
      } else if (selectWindow) {
        targetRange = {
          startTime: selectWindow.startTime,
          endTime: selectWindow.endTime,
        };
      } else {
        usedFallback = true;
      }
    }

    if (timelineZoomRequest.mode === 'stepIn'
      || timelineZoomRequest.mode === 'stepOut'
      || timelineZoomRequest.mode === 'reset') {
      const nextPixelsPerSecond = timelineZoomRequest.mode === 'reset'
        ? DEFAULT_TIMELINE_PIXELS_PER_SECOND
        : getNextTimelineZoomLevel(
            pixelsPerSecond,
            timelineZoomRequest.mode === 'stepIn' ? 'in' : 'out',
          );

      if (nextPixelsPerSecond === pixelsPerSecond) return;

      const playheadAnchorTime = isPlaying ? currentTime : playStartTime;
      const anchor = getTimelineZoomAnchor({
        pixelsPerSecond,
        scrollLeft: container.scrollLeft,
        viewportWidth: nextViewportWidth,
        playheadTime: playheadAnchorTime,
      });
      const nextViewport = getZoomedTimelineViewport({
        pixelsPerSecond,
        scrollLeft: container.scrollLeft,
        viewportWidth: nextViewportWidth,
        totalDuration,
      }, nextPixelsPerSecond, anchor);

      setPixelsPerSecond(nextViewport.pixelsPerSecond);
      setScrollX(nextViewport.scrollLeft);
      container.scrollLeft = nextViewport.scrollLeft;
      return;
    }

    const nextViewport = getTimelineFitViewport(targetRange, nextViewportWidth, totalDuration, {
      paddingPx: timelineZoomRequest.mode === 'project' ? 0 : 40,
    });
    setPixelsPerSecond(nextViewport.pixelsPerSecond);
    setScrollX(nextViewport.scrollLeft);
    container.scrollLeft = nextViewport.scrollLeft;

    if (usedFallback) {
      toastInfo('Nothing is selected, so the timeline zoomed to the full project.');
    }
  }, [
    currentTime,
    hasProject,
    isPlaying,
    pixelsPerSecond,
    playStartTime,
    selectWindow,
    selectedClipIds,
    setPixelsPerSecond,
    setScrollX,
    totalDuration,
    trackListWidth,
    tracks,
    timelineZoomRequest,
  ]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !hasProject || !isPlaying || !autoScrollEnabled) return;

    const timelineViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);
    const fixedPlayheadViewportX = Math.min(
      Math.max(120, timelineViewportWidth * 0.35),
      Math.max(120, timelineViewportWidth - 96),
    );
    const nextScrollLeft = clampTimelineScrollLeft(
      currentTime * pixelsPerSecond - fixedPlayheadViewportX,
      totalDuration,
      pixelsPerSecond,
      timelineViewportWidth,
    );

    if (Math.abs(container.scrollLeft - nextScrollLeft) < 1) return;
    container.scrollLeft = nextScrollLeft;
    setScrollX(nextScrollLeft);
  }, [autoScrollEnabled, currentTime, hasProject, isPlaying, pixelsPerSecond, setScrollX, totalDuration, trackListWidth]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const container = scrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const target = e.target as HTMLElement | null;
        const isTrackColumnTarget = !!target?.closest?.('[data-track-column-region="true"]');
        const timelineViewportWidth = Math.max(1, (container.clientWidth - trackListWidth) || window.innerWidth || 1);
        const cursorOffsetX = isTrackColumnTarget
          ? Math.min(120, timelineViewportWidth - 1)
          : Math.max(0, Math.min(timelineViewportWidth - 1, e.clientX - rect.left - trackListWidth));
        const playheadAnchorTime = isPlaying ? currentTime : playStartTime;
        const anchor = getTimelineZoomAnchor({
          pixelsPerSecond,
          scrollLeft: container.scrollLeft,
          viewportWidth: timelineViewportWidth,
          pointerViewportX: cursorOffsetX,
          playheadTime: playheadAnchorTime,
        });

        const normalizedDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * 18
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? e.deltaY * (container.clientHeight || window.innerHeight || 1)
            : e.deltaY;
        const sensitivity = e.ctrlKey && !e.metaKey ? 0.0065 : 0.0042;
        const zoomFactor = Math.exp(-normalizedDelta * sensitivity);
        const currentBase = zoomAnimationFrameRef.current === null
          ? pixelsPerSecond
          : zoomTargetRef.current;
        zoomTargetRef.current = clampTimelinePixelsPerSecond(currentBase * zoomFactor);
        zoomAnchorRef.current = anchor;

        if (zoomAnimationFrameRef.current !== null) {
          return;
        }

        const animateZoom = (timestamp: number) => {
          const liveContainer = scrollRef.current;
          const liveAnchor = zoomAnchorRef.current;
          if (!liveContainer || !liveAnchor) {
            zoomAnimationFrameRef.current = null;
            zoomFrameTimeRef.current = null;
            return;
          }

          const dt = zoomFrameTimeRef.current === null ? 16 : Math.max(8, timestamp - zoomFrameTimeRef.current);
          zoomFrameTimeRef.current = timestamp;
          const currentPixels = useUIStore.getState().pixelsPerSecond;
          const alpha = 1 - Math.exp(-dt / 42);
          const nextPixelsPerSecond = Math.abs(zoomTargetRef.current - currentPixels) < 0.02
            ? zoomTargetRef.current
            : currentPixels + (zoomTargetRef.current - currentPixels) * alpha;

          const nextViewport = getZoomedTimelineViewport({
            pixelsPerSecond: currentPixels,
            scrollLeft: liveContainer.scrollLeft,
            viewportWidth: Math.max(1, (liveContainer.clientWidth - trackListWidth) || window.innerWidth || 1),
            totalDuration,
          }, nextPixelsPerSecond, liveAnchor);

          setPixelsPerSecond(nextViewport.pixelsPerSecond);
          setScrollX(nextViewport.scrollLeft);
          liveContainer.scrollLeft = nextViewport.scrollLeft;

          if (Math.abs(zoomTargetRef.current - nextPixelsPerSecond) < 0.02) {
            zoomAnimationFrameRef.current = null;
            zoomFrameTimeRef.current = null;
            return;
          }

          zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
        };

        zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
      }
    },
    [currentTime, isPlaying, pixelsPerSecond, playStartTime, setPixelsPerSecond, setScrollX, totalDuration, trackListWidth],
  );

  useEffect(() => () => {
    if (zoomAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomAnimationFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateViewportWidth = () => {
      const nextWidth = Math.max(0, (container.clientWidth - trackListWidth) || window.innerWidth || 0);
      setViewportWidth(nextWidth);
      setTimelineViewportWidth(nextWidth);
    };
    updateViewportWidth();

    const ro = new ResizeObserver(updateViewportWidth);
    ro.observe(container);
    return () => ro.disconnect();
  }, [setTimelineViewportWidth, trackListWidth]);

  // Use non-passive wheel listener so preventDefault() works for trackpad pinch-zoom
  const wheelRef = useNonPassiveWheel(handleWheel);
  // Merge scrollRef (used throughout) with wheelRef (callback ref from hook)
  const mergedScrollRef = useCallback((el: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    wheelRef(el);
  }, [wheelRef]);

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-window-overlay-control="true"]')) return;
      if (target.closest?.('[data-clip-block]')) return;
      if (target.closest?.('[data-track-column-region="true"]')) return;
      if (target.closest?.('.fixed')) return;
      if (target.closest?.('[data-sequencer-grid]')) return;
      if (target.closest?.('[data-timeline-scrubber="true"]')) return;
      if (target.closest?.('[data-testid="arrangement-markers"]')) return;

      const isCtx = e.altKey;
      const isSel = !isCtx;

      e.preventDefault();
      e.stopPropagation();

      const container = scrollRef.current;
      const trackArea = trackAreaRef.current;
      if (!container || !trackArea) return;

      const scrollLeft = container.scrollLeft;
      const cRect = container.getBoundingClientRect();
      const timelineRectLeft = cRect.left + trackListWidth;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startViewX = startClientX - timelineRectLeft;
      const startViewY = startClientY - cRect.top + container.scrollTop;
      const primaryTrackId = getIntersectedTrackIds(container, startViewY, startViewY + 1)[0];

      let hasDragged = false;
      const setDrag = isCtx ? setCtxDrag : setSelDrag;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        hasDragged = true;

        const curViewX = ev.clientX - timelineRectLeft;
        const curViewY = ev.clientY - cRect.top + container.scrollTop;

        const left = Math.min(startViewX, curViewX) + scrollLeft;
        const width = Math.abs(curViewX - startViewX);

        const minY = Math.min(startViewY, curViewY);
        const maxY = Math.max(startViewY, curViewY);

        const vRange = getTrackVerticalRange(
          container, getIntersectedTrackIds(container, minY, maxY),
        );
        const trackAreaTop = trackArea.getBoundingClientRect().top - cRect.top + container.scrollTop;
        const top = vRange ? vRange.top - trackAreaTop : minY - trackAreaTop;
        const height = vRange ? vRange.height : maxY - minY;
        setDrag({ left, width, top, height });
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!hasDragged) {
          setDrag(null);
          // Click without drag → seek playhead + select the clicked track row
          const time = (startViewX + scrollLeft) / pixelsPerSecond;
          seek(time);
          setTimelineFocused(true);
          // Find and select the track row at the click Y position
          const clickedIds = getIntersectedTrackIds(container, startViewY, startViewY + 1);
          if (clickedIds.length > 0) {
            selectTrack(clickedIds[0], ev.metaKey || ev.ctrlKey);
          } else {
            deselectAllTracks();
          }
          return;
        }

        const endViewX = ev.clientX - timelineRectLeft;
        const endViewY = ev.clientY - cRect.top + container.scrollTop;

        const leftPx = Math.min(startViewX, endViewX) + scrollLeft;
        const rightPx = Math.max(startViewX, endViewX) + scrollLeft;
        const minY = Math.min(startViewY, endViewY);
        const maxY = Math.max(startViewY, endViewY);

        const rawStart = leftPx / pixelsPerSecond;
        const rawEnd = rightPx / pixelsPerSecond;
        const startTime = Math.max(0, snapToGrid(rawStart, bpm, 1));
        const endTime = snapToGrid(rawEnd, bpm, 1);
        const trackIds = getIntersectedTrackIds(container, minY, maxY);

        if (endTime > startTime && trackIds.length > 0) {
          if (isCtx) {
            setContextWindow({ startTime, endTime, trackIds });
          } else {
            const nextSelectWindow: TimelineWindowRange = {
              startTime,
              endTime,
              trackIds,
            };
            if (primaryTrackId !== undefined) {
              nextSelectWindow.primaryTrackId = primaryTrackId;
              const targetRowIndex = getTrackRowIndex(container, primaryTrackId);
              if (targetRowIndex !== null) {
                nextSelectWindow.targetRowIndex = targetRowIndex;
              }
            }
            setSelectWindow(nextSelectWindow);
            seek(startTime);

            // Auto-select all clips overlapping the select window
            const overlappingClipIds: string[] = [];
            const trackIdSet = new Set(trackIds);
            for (const track of tracks) {
              if (!trackIdSet.has(track.id)) continue;
              for (const clip of track.clips) {
                const clipEnd = clip.startTime + clip.duration;
                if (clipEnd > startTime && clip.startTime < endTime) {
                  overlappingClipIds.push(clip.id);
                }
              }
            }
            if (overlappingClipIds.length > 0) {
              selectClips(overlappingClipIds);
            }
          }
        }
        setDrag(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bpm, pixelsPerSecond, setContextWindow, setSelectWindow, deselectAllTracks, selectTrack, selectClips, seek, setTimelineFocused, trackListWidth, tracks],
  );

  const startWindowMove = useCallback(
    (
      kind: 'select' | 'context',
      windowRange: TimelineWindowRange,
      e: React.MouseEvent<HTMLDivElement>,
    ) => {
      if (e.button !== 0) return;

      const container = scrollRef.current;
      if (!container || !hasProject) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const timelineRectLeft = rect.left + trackListWidth;
      const setWindow = kind === 'context' ? setContextWindow : setSelectWindow;
      const pointerTimeAtStart = (e.clientX - timelineRectLeft + container.scrollLeft) / pixelsPerSecond;
      const pointerOffsetTime = pointerTimeAtStart - windowRange.startTime;

      // Track vertical state for cross-track movement
      const startClientY = e.clientY;
      const initialVRange = getTrackVerticalRange(container, windowRange.trackIds);
      const initialWindowHeight = initialVRange ? initialVRange.height : 0;

      let currentWindow = windowRange;

      const applyMove = (clientX: number, clientY: number) => {
        const pointerTime = (clientX - timelineRectLeft + container.scrollLeft) / pixelsPerSecond;
        const desiredStartTime = snapToGrid(pointerTime - pointerOffsetTime, bpm, 1);

        // Calculate vertical delta and find new track set
        const deltaY = clientY - startClientY;
        if (initialVRange) {
          const newTop = initialVRange.top + deltaY;
          const newBottom = newTop + initialWindowHeight;
          const newTrackIds = getIntersectedTrackIds(container, newTop, newBottom);
          if (newTrackIds.length > 0) {
            currentWindow = {
              ...currentWindow,
              trackIds: newTrackIds,
              primaryTrackId: newTrackIds[0],
            };
          }
        }

        const moved = moveTimelineWindow(currentWindow, desiredStartTime, totalDuration);
        currentWindow = moved;
        setWindow(moved);
      };

      const onMouseMove = (ev: MouseEvent) => {
        applyMove(ev.clientX, ev.clientY);
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        applyMove(ev.clientX, ev.clientY);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bpm, hasProject, pixelsPerSecond, setContextWindow, setSelectWindow, totalDuration, trackListWidth],
  );

  const switchTimelineWindow = useCallback(
    (kind: 'select' | 'context') => {
      const nextWindows = convertTimelineWindowMode(kind, { selectWindow, contextWindow });
      setSelectWindow(nextWindows.selectWindow);
      setContextWindow(nextWindows.contextWindow);
    },
    [contextWindow, selectWindow, setContextWindow, setSelectWindow],
  );


  if (!hasProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Create a new project to get started
      </div>
    );
  }

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
          // Only show canvas context menu on empty area
          const target = e.target as HTMLElement;
          if (target.closest?.('[data-track-column-region="true"]')) return;
          if (target.closest?.('[data-clip-block]')) return;
          if (target.closest?.('[data-sequencer-grid]')) return;
          // Don't interfere with select window region context menu
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

          <div className="relative" style={{ gridColumn: '2', gridRow: '2', width: totalWidth }}>
            {/* Grid and playhead span full height (tracks + empty space below) */}
            <GridOverlay />
            <Playhead />

            <div ref={trackAreaRef} className="relative" style={{ contain: 'style layout' }}>

              {/* Committed context window overlay — Apple Teal (#5AC8FA) */}
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

              {/* Committed select window overlay — Neutral White */}
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

              {/* Live context drag overlay — Apple Teal (#5AC8FA) */}
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

              {/* Live select drag overlay — Neutral White */}
              {selDrag && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: selDrag.left,
                    width: selDrag.width,
                    top: selDrag.top,
                    height: selDrag.height,
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderLeft: '1px solid rgba(255, 255, 255, 0.8)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.8)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.8)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.8)',
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

      {/* MultiTrackGenerateModal is now accessed via GENR button or toolbar —
           no longer auto-opens on selectWindow creation (#577) */}

      {/* Region context menu — right-click on select window → same as canvas context menu with AI Tools */}
      {regionCtxMenu && selectWindow && (
        <CanvasContextMenu
          x={regionCtxMenu.x}
          y={regionCtxMenu.y}
          onClose={() => setRegionCtxMenu(null)}
        />
      )}

      {/* Region regeneration modal */}
      {regionRegenerateTarget && <RegionRegenerateModal />}

      {/* Canvas context menu — right-click on empty timeline area */}
      {canvasCtxMenu && (
        <CanvasContextMenu
          x={canvasCtxMenu.x}
          y={canvasCtxMenu.y}
          onClose={() => setCanvasCtxMenu(null)}
        />
      )}
    </>
  );
}

/** Empty placeholder rows below tracks — infinite grid like ACE Studio */
const PLACEHOLDER_ROW_HEIGHT = DEFAULT_ARRANGEMENT_ROW_HEIGHT;

function ArrangementEmptyTrackHeaderRow({
  slotIndex,
  isCollapsed,
  isDropDisabled,
  isDragOver,
  onDragOver,
  onDrop,
}: {
  slotIndex: number;
  isCollapsed: boolean;
  isDropDisabled: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent, slotIndex: number) => void;
  onDrop: (e: React.DragEvent, slotIndex: number) => void;
}) {
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const virtualId = getArrangementEmptyTrackId(slotIndex);
  const isSelected = selectedTrackIds.has(virtualId);

  return (
    <div
      className="relative flex items-center justify-center border-b cursor-pointer group"
      style={{
        height: PLACEHOLDER_ROW_HEIGHT,
        borderColor: 'var(--color-daw-arrangement-separator)',
        backgroundColor: isDragOver ? 'rgba(94, 89, 255, 0.12)' : undefined,
        boxShadow: isDragOver ? 'inset 0 0 0 1px rgba(94, 89, 255, 0.45)' : undefined,
      }}
      onClick={() => {
        selectTrack(virtualId, false);
        setShowInstrumentPicker(true);
      }}
      onDragOver={isDropDisabled ? undefined : (e) => onDragOver(e, slotIndex)}
      onDrop={isDropDisabled ? undefined : (e) => onDrop(e, slotIndex)}
      aria-label={`Empty track slot ${slotIndex + 1}`}
      data-drop-disabled={isDropDisabled ? 'true' : 'false'}
      data-testid={`empty-header-row-${slotIndex}`}
    >
      {isSelected && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}
      <span className={`text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${isCollapsed ? 'text-sm' : 'text-lg'}`}>+</span>
    </div>
  );
}

function EmptyTrackRow({ slotIndex }: { slotIndex: number }) {
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setTrackLaneRect = useUIStore((s) => s.setTrackLaneRect);
  const removeTrackLaneRect = useUIStore((s) => s.removeTrackLaneRect);
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const timeSignature = useProjectStore((s) => s.project?.timeSignature ?? 4);
  const timeSignatureDenominator = useProjectStore((s) => s.project?.timeSignatureDenominator ?? 4);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap ?? EMPTY_TEMPO_MAP);
  const addTrack = useProjectStore((s) => s.addTrack);
  const virtualId = getArrangementEmptyTrackId(slotIndex);
  const isSelected = selectedTrackIds.has(virtualId);
  const { importAudioFile, importAudioToTrack, importLoopToTrack, importAssetToTrack, importAssetAsQuickSampler, importAudioFileAsNewQuickSampler } = useAudioImport();

  const laneRef = useRef<HTMLDivElement>(null);
  const [dropGhost, setDropGhost] = useState<{ left: number; width: number; name: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const defaultClipDuration = hasProject
    ? getBarDuration(bpm, timeSignature, timeSignatureDenominator) * 4
    : 8;

  useLayoutEffect(() => {
    const el = laneRef.current;
    if (!el) return;

    const update = () => {
      const parentEl = el.offsetParent as HTMLElement | null;
      const parentOffset = parentEl ? parentEl.offsetTop : 0;
      setTrackLaneRect(virtualId, {
        top: el.offsetTop + parentOffset,
        height: el.offsetHeight,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      ro.disconnect();
      removeTrackLaneRect(virtualId);
    };
  }, [removeTrackLaneRect, setTrackLaneRect, virtualId]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragOver(true);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      if (hasProject) {
        const payload = getDragPayload();
        const laneX = clientXToLaneX(e.clientX);
        const rawTime = laneX / pixelsPerSecond;
        const snappedTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));
        const ghostDuration = payload?.duration ?? defaultClipDuration;
        const ghostName = payload?.name ?? (types.includes('Files') ? 'Audio file' : 'Audio');
        setDropGhost({
          left: snappedTime * pixelsPerSecond,
          width: ghostDuration * pixelsPerSecond,
          name: ghostName,
        });
      }
    }
  }, [hasProject, pixelsPerSecond, defaultClipDuration, bpm, tempoMap]);

  const onDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setDropGhost(null);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDropGhost(null);
    clearDragPayload();
    if (!hasProject) return;

    const laneX = clientXToLaneX(e.clientX);
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));

    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      const newTrack = addTrack('custom', 'sample', { order: slotIndex + 1 });
      await importLoopToTrack(loopId, newTrack.id, startTime);
      return;
    }

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsQuickSampler(assetId);
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
            const newTrack = addTrack('custom', 'sample', { order: slotIndex + 1 });
            useProjectStore.getState().updateTrack(newTrack.id, {
              displayName: file.name.replace(/\.[^.]+$/, ''),
            });
            await importAudioToTrack(file, newTrack.id, startTime);
          }
        }
      }
    }
  }, [hasProject, pixelsPerSecond, addTrack, importAudioToTrack, importLoopToTrack, importAssetToTrack, importAssetAsQuickSampler, importAudioFileAsNewQuickSampler, bpm, tempoMap]);

  return (
    <div
      ref={laneRef}
      data-track-id={virtualId}
      data-timeline-lane
      className="relative"
      style={{
        height: PLACEHOLDER_ROW_HEIGHT,
        borderBottom: '1px solid var(--color-daw-arrangement-separator)',
        backgroundColor: isDragOver ? 'rgba(94, 89, 255, 0.08)' : undefined,
      }}
      data-testid={`empty-row-${slotIndex}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isSelected && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}
      {dropGhost && (
        <div
          className="absolute top-1 bottom-1 rounded-md pointer-events-none z-30 flex items-center overflow-hidden"
          style={{
            left: dropGhost.left,
            width: Math.max(dropGhost.width, 4),
            backgroundColor: 'rgba(94, 89, 255, 0.30)',
            border: '1px dashed rgba(94, 89, 255, 0.7)',
          }}
        >
          <span className="text-[10px] text-white/70 px-2 truncate">{dropGhost.name}</span>
        </div>
      )}
    </div>
  );
}

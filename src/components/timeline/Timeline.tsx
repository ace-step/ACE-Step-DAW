import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { snapToGrid } from '../../utils/time';
import { MultiTrackGenerateModal } from '../generation/MultiTrackGenerateModal';
import { RegionRegenerateModal } from '../generation/RegionRegenerateModal';
import { RegionContextMenu } from './RegionContextMenu';
import { CanvasContextMenu } from './CanvasContextMenu';
import { InlineSuggestionBadge } from './InlineSuggestionBadge';
import { useAudioImport } from '../../hooks/useAudioImport';
import { Minimap } from './Minimap';
import { TempoLane } from './TempoLane';
import { ArrangementMarkers } from './ArrangementMarkers';
import { TimelineEmptyState } from './TimelineEmptyState';
import { SelectionFloatingToolbar } from './SelectionFloatingToolbar';
import { toastInfo } from '../../hooks/useToast';
import { getTimelineFitViewport } from '../../utils/timelineZoom';
import { convertTimelineWindowMode, moveTimelineWindow, type TimelineWindowRange } from './timelineWindowUtils';

/** @deprecated Inspector is now a modal; kept for potential future use */
export const TRACK_INSPECTOR_HEIGHT = 220;

const DRAG_THRESHOLD_PX = 4;
const WINDOW_CONTROL_BAR_HEIGHT = 24;

interface DragRect { left: number; width: number; top: number; height: number }

function getIntersectedTrackIds(container: HTMLElement, minY: number, maxY: number): string[] {
  const lanes = container.querySelectorAll<HTMLElement>('[data-track-id]');
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

function getTrackVerticalRange(
  container: HTMLElement, trackIds: string[],
): { top: number; height: number } | null {
  if (trackIds.length === 0) return null;
  const cRect = container.getBoundingClientRect();
  let minTop = Infinity;
  let maxBot = -Infinity;
  const idSet = new Set(trackIds);
  const lanes = container.querySelectorAll<HTMLElement>('[data-track-id]');
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
  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const seek = useTransportStore((s) => s.seek);
  const setTimelineFocused = useUIStore((s) => s.setTimelineFocused);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setContextWindow = useUIStore((s) => s.setContextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const keyboardContext = useUIStore((s) => s.keyboardContext);
  const timelineZoomRequest = useUIStore((s) => s.timelineZoomRequest);
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
  const [fileDragOver, setFileDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const { importMultipleFiles, importLoopToTrack, importAssetToTrack, importAudioFileAsNewQuickSampler, importAssetAsQuickSampler } = useAudioImport();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      dragCounterRef.current++;
      setFileDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setFileDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setFileDragOver(false);

    // Handle preset loop drop -> create new sample track
    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      const newTrack = addTrack('custom', 'sample');
      await importLoopToTrack(loopId, newTrack.id, 0);
      return;
    }

    // Handle asset drop -> create Quick Sampler track
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsQuickSampler(assetId);
      return;
    }

    // Audio files -> Quick Sampler, MIDI files -> piano roll tracks
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
          await importAudioFileAsNewQuickSampler(file);
        } else if (/\.(mid|midi)$/i.test(file.name)) {
          await importMultipleFiles([file]);
        }
      }
    }
  }, [addTrack, importMultipleFiles, importLoopToTrack, importAssetToTrack, importAudioFileAsNewQuickSampler, importAssetAsQuickSampler]);

  // Safety net: if a child (e.g. TrackLane) stops propagation on drop,
  // the Timeline's own handleDrop never fires. Listen globally to clear the overlay.
  useEffect(() => {
    const clearOverlay = () => {
      dragCounterRef.current = 0;
      setFileDragOver(false);
    };
    window.addEventListener('drop', clearOverlay);
    window.addEventListener('dragend', clearOverlay);
    return () => {
      window.removeEventListener('drop', clearOverlay);
      window.removeEventListener('dragend', clearOverlay);
    };
  }, []);

  const getVisibleTracks = useProjectStore((s) => s.getVisibleTracks);
  const sortedTracks = project ? getVisibleTracks() : [];

  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;
  const selectedClipLabel = useMemo(() => {
    if (!project || selectedClipIds.size === 0) return 'No clip selected';
    const selectedId = Array.from(selectedClipIds)[0];
    const selectedClip = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedId);
    if (!selectedClip) return 'No clip selected';
    const trackName = project.tracks.find((track) => track.id === selectedClip.trackId)?.displayName ?? 'Unknown track';
    return `${trackName} @ ${selectedClip.startTime.toFixed(2)}s`;
  }, [project, selectedClipIds]);
  const focusedTrackLabel = useMemo(() => {
    if (!project || !keyboardContext.trackId) return 'Project';
    return project.tracks.find((track) => track.id === keyboardContext.trackId)?.displayName ?? 'Project';
  }, [keyboardContext.trackId, project]);

  useEffect(() => {
    if (!project || !timelineZoomRequest || !scrollRef.current) return;

    const container = scrollRef.current;
    const viewportWidth = container.clientWidth || window.innerWidth || 1;
    const projectRange = { startTime: 0, endTime: project.totalDuration };

    let targetRange = projectRange;
    let usedFallback = false;

    if (timelineZoomRequest.mode === 'selection') {
      const selectedClips = project.tracks
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

    const nextViewport = getTimelineFitViewport(targetRange, viewportWidth);
    setPixelsPerSecond(nextViewport.pixelsPerSecond);
    setScrollX(nextViewport.scrollLeft);
    container.scrollLeft = nextViewport.scrollLeft;

    if (usedFallback) {
      toastInfo('Nothing is selected, so the timeline zoomed to the full project.');
    }
  }, [project, selectWindow, selectedClipIds, setPixelsPerSecond, setScrollX, timelineZoomRequest]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
        const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= pixelsPerSecond);
        let nextPixelsPerSecond = pixelsPerSecond;

        if (e.deltaY < 0 && currentIdx < ZOOM_LEVELS.length - 1) {
          nextPixelsPerSecond = ZOOM_LEVELS[currentIdx + 1];
        } else if (e.deltaY > 0 && currentIdx > 0) {
          nextPixelsPerSecond = ZOOM_LEVELS[currentIdx - 1];
        }

        if (nextPixelsPerSecond === pixelsPerSecond) {
          return;
        }

        const container = e.currentTarget;
        const rect = container.getBoundingClientRect();
        const cursorOffsetX = e.clientX - rect.left;
        const timeAtCursor = (container.scrollLeft + cursorOffsetX) / pixelsPerSecond;

        setPixelsPerSecond(nextPixelsPerSecond);
        const nextScrollLeft = Math.max(0, timeAtCursor * nextPixelsPerSecond - cursorOffsetX);
        setScrollX(nextScrollLeft);
        container.scrollLeft = nextScrollLeft;
      }
    },
    [pixelsPerSecond, setPixelsPerSecond, setScrollX],
  );

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-window-overlay-control="true"]')) return;
      if (target.closest?.('[data-clip-block]')) return;
      if (target.closest?.('.fixed')) return;
      if (target.closest?.('[data-sequencer-grid]')) return;
      if (target.closest?.('[data-timeline-scrubber="true"]')) return;

      const isCtx = e.altKey;
      const isSel = !isCtx;

      e.preventDefault();
      e.stopPropagation();

      const container = scrollRef.current;
      const trackArea = trackAreaRef.current;
      if (!container || !trackArea) return;

      const bpm = project?.bpm ?? 120;
      const scrollLeft = container.scrollLeft;
      const cRect = container.getBoundingClientRect();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startViewX = startClientX - cRect.left;
      const startViewY = startClientY - cRect.top + container.scrollTop;

      let hasDragged = false;
      const setDrag = isCtx ? setCtxDrag : setSelDrag;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        hasDragged = true;

        const curViewX = ev.clientX - cRect.left;
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

        const endViewX = ev.clientX - cRect.left;
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
            setSelectWindow({ startTime, endTime, trackIds });
          }
        }
        setDrag(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pixelsPerSecond, project, setContextWindow, setSelectWindow, deselectAllTracks, selectTrack, seek, setTimelineFocused],
  );

  const startWindowMove = useCallback(
    (
      kind: 'select' | 'context',
      windowRange: TimelineWindowRange,
      e: React.MouseEvent<HTMLDivElement>,
    ) => {
      if (e.button !== 0) return;

      const container = scrollRef.current;
      if (!container || !project) return;

      e.preventDefault();
      e.stopPropagation();

      const bpm = project.bpm ?? 120;
      const totalDuration = project.totalDuration;
      const rect = container.getBoundingClientRect();
      const setWindow = kind === 'context' ? setContextWindow : setSelectWindow;
      const pointerTimeAtStart = (e.clientX - rect.left + container.scrollLeft) / pixelsPerSecond;
      const pointerOffsetTime = pointerTimeAtStart - windowRange.startTime;

      const applyMove = (clientX: number) => {
        const pointerTime = (clientX - rect.left + container.scrollLeft) / pixelsPerSecond;
        const desiredStartTime = snapToGrid(pointerTime - pointerOffsetTime, bpm, 1);
        setWindow(moveTimelineWindow(windowRange, desiredStartTime, totalDuration));
      };

      const onMouseMove = (ev: MouseEvent) => {
        applyMove(ev.clientX);
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        applyMove(ev.clientX);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pixelsPerSecond, project, setContextWindow, setSelectWindow],
  );

  const switchTimelineWindow = useCallback(
    (kind: 'select' | 'context') => {
      const nextWindows = convertTimelineWindowMode(kind, { selectWindow, contextWindow });
      setSelectWindow(nextWindows.selectWindow);
      setContextWindow(nextWindows.contextWindow);
    },
    [contextWindow, selectWindow, setContextWindow, setSelectWindow],
  );


  if (!project) {
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

  return (
    <>
      <Minimap />
      <div
        ref={scrollRef}
        data-keyboard-context="timeline"
        role="grid"
        tabIndex={0}
        data-onboarding-target="timeline"
        className="flex-1 overflow-auto bg-[#1c1d22] relative group"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollY(el.scrollTop);
        }}
        onWheel={handleWheel}
        onMouseDownCapture={handleMouseDownCapture}
        onFocus={() => { setKeyboardContext('timeline'); setTimelineFocused(true); }}
        onBlur={() => setTimelineFocused(false)}
        onMouseDown={() => setKeyboardContext('timeline')}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          // Only show canvas context menu on empty area
          const target = e.target as HTMLElement;
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
        {fileDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-900/30 border-2 border-dashed border-blue-400/60 pointer-events-none">
            <div className="bg-blue-950/80 border border-blue-500/50 rounded-lg px-6 py-4 text-center">
              <p className="text-sm font-medium text-blue-200">Drop audio or MIDI files here</p>
              <p className="text-[10px] text-blue-400 mt-1">WAV, MP3, OGG, FLAC, AAC, MID</p>
            </div>
          </div>
        )}
        <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
          <TimeRuler />
          <ArrangementMarkers />
          {showTempoLane && <TempoLane />}

          {/* Grid and playhead span full height (tracks + empty space below) */}
          <GridOverlay />
          <Playhead />

          <div ref={trackAreaRef} className="relative">

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

            {/* Committed select window overlay — Apple Purple (#AF52DE) */}
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
                accentTextColor="#AF52DE"
                fillColor="rgba(175, 82, 222, 0.10)"
                borderColor="rgba(175, 82, 222, 0.35)"
                edgeColor="rgba(175, 82, 222, 0.7)"
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

            {/* Live select drag overlay — Apple Purple (#AF52DE) */}
            {selDrag && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: selDrag.left,
                  width: selDrag.width,
                  top: selDrag.top,
                  height: selDrag.height,
                  background: 'rgba(175, 82, 222, 0.12)',
                  borderLeft: '1px solid rgba(175, 82, 222, 0.5)',
                  borderRight: '1px solid rgba(175, 82, 222, 0.5)',
                  borderTop: '1px solid rgba(175, 82, 222, 0.3)',
                  borderBottom: '1px solid rgba(175, 82, 222, 0.3)',
                }}
              />
            )}


            {sortedTracks.map((track) => (
              <TrackLane key={track.id} track={track} />
            ))}

            {/* Empty placeholder rows — infinite grid like ACE Studio */}
            <EmptyTrackRows />

            <TimelineEmptyState />

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
const PLACEHOLDER_ROW_HEIGHT = 64; // matches default track height
const PLACEHOLDER_ROW_COUNT = 20;  // enough to fill any viewport

function EmptyTrackRows() {
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  return (
    <>
      {Array.from({ length: PLACEHOLDER_ROW_COUNT }, (_, i) => {
        const virtualId = `__empty-${i}`;
        const isSelected = selectedTrackIds.has(virtualId);
        return (
          <div
            key={virtualId}
            data-track-id={virtualId}
            data-timeline-lane
            className="relative"
            style={{
              height: PLACEHOLDER_ROW_HEIGHT,
              borderBottom: '1px solid var(--color-daw-arrangement-separator)',
            }}
            data-testid={`empty-row-${i}`}
          >
            {isSelected && (
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
            )}
          </div>
        );
      })}
    </>
  );
}

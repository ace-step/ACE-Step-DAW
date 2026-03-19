import { useRef, useCallback, useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import { GridOverlay } from './GridOverlay';
import { snapToGrid } from '../../utils/time';
import { MultiTrackGenerateModal } from '../generation/MultiTrackGenerateModal';
import { RegionRegenerateModal } from '../generation/RegionRegenerateModal';
import { RegionContextMenu } from './RegionContextMenu';
import { InlineSuggestionBadge } from './InlineSuggestionBadge';
import { useAudioImport } from '../../hooks/useAudioImport';
import { Minimap } from './Minimap';
import { TempoLane } from './TempoLane';
import { ArrangementMarkers } from './ArrangementMarkers';

/** @deprecated Inspector is now a modal; kept for potential future use */
export const TRACK_INSPECTOR_HEIGHT = 220;

const DRAG_THRESHOLD_PX = 4;

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

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const showTempoLane = useUIStore((s) => s.showTempoLane);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setContextWindow = useUIStore((s) => s.setContextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const selectClips = useUIStore((s) => s.selectClips);
  const setRegionRegenerateTarget = useUIStore((s) => s.setRegionRegenerateTarget);
  const regionRegenerateTarget = useUIStore((s) => s.regionRegenerateTarget);
  const inlineSuggestions = useUIStore((s) => s.inlineSuggestions);
  const suggestionFrequency = useUIStore((s) => s.suggestionFrequency);

  const [regionCtxMenu, setRegionCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxDrag, setCtxDrag] = useState<DragRect | null>(null);
  const [selDrag, setSelDrag] = useState<DragRect | null>(null);
  const [normalDrag, setNormalDrag] = useState<DragRect | null>(null);
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

  const sortedTracks = project
    ? [...project.tracks].sort((a, b) => a.order - b.order)
    : [];

  const totalWidth = project ? project.totalDuration * pixelsPerSecond : 0;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
        const currentIdx = ZOOM_LEVELS.findIndex((z) => z >= pixelsPerSecond);
        if (e.deltaY < 0 && currentIdx < ZOOM_LEVELS.length - 1) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx + 1]);
        } else if (e.deltaY > 0 && currentIdx > 0) {
          setPixelsPerSecond(ZOOM_LEVELS[currentIdx - 1]);
        }
      }
    },
    [pixelsPerSecond, setPixelsPerSecond],
  );

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest?.('[data-clip-block]')) return;
      if (target.closest?.('.fixed')) return;
      if (target.closest?.('[data-sequencer-grid]')) return;

      const isCtx = e.altKey;
      const isSel = !isCtx && (e.metaKey || e.ctrlKey);
      const isNormal = !isCtx && !isSel;

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
      const setDrag = isCtx ? setCtxDrag : isSel ? setSelDrag : setNormalDrag;

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

        if (isNormal) {
          const trackAreaTop = trackArea.getBoundingClientRect().top - cRect.top + container.scrollTop;
          setDrag({ left, width, top: minY - trackAreaTop, height: maxY - minY });
        } else {
          const vRange = getTrackVerticalRange(
            container, getIntersectedTrackIds(container, minY, maxY),
          );
          const trackAreaTop = trackArea.getBoundingClientRect().top - cRect.top + container.scrollTop;
          const top = vRange ? vRange.top - trackAreaTop : minY - trackAreaTop;
          const height = vRange ? vRange.height : maxY - minY;
          setDrag({ left, width, top, height });
        }
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!hasDragged) {
          setDrag(null);
          return;
        }

        const endViewX = ev.clientX - cRect.left;
        const endViewY = ev.clientY - cRect.top + container.scrollTop;

        const leftPx = Math.min(startViewX, endViewX) + scrollLeft;
        const rightPx = Math.max(startViewX, endViewX) + scrollLeft;
        const minY = Math.min(startViewY, endViewY);
        const maxY = Math.max(startViewY, endViewY);

        if (isNormal) {
          const rawStart = leftPx / pixelsPerSecond;
          const rawEnd = rightPx / pixelsPerSecond;
          const trackIds = new Set(getIntersectedTrackIds(container, minY, maxY));
          const tracks = project?.tracks ?? [];
          const hitClipIds: string[] = [];
          for (const t of tracks) {
            if (!trackIds.has(t.id)) continue;
            for (const c of t.clips) {
              const clipEnd = c.startTime + c.duration;
              if (clipEnd > rawStart && c.startTime < rawEnd) {
                hitClipIds.push(c.id);
              }
            }
          }
          selectClips(hitClipIds);
        } else {
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
        }
        setDrag(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pixelsPerSecond, project, setContextWindow, setSelectWindow, selectClips],
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
        className="flex-1 overflow-auto bg-[#242424] relative"
        onWheel={handleWheel}
        onMouseDownCapture={handleMouseDownCapture}
        onFocus={() => setKeyboardContext('timeline')}
        onMouseDown={() => setKeyboardContext('timeline')}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ cursor: 'default' }}
      >
        {fileDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-900/30 border-2 border-dashed border-blue-400/60 pointer-events-none">
            <div className="bg-blue-950/80 border border-blue-500/50 rounded-lg px-6 py-4 text-center">
              <p className="text-sm font-medium text-blue-200">Drop audio files here</p>
              <p className="text-[10px] text-blue-400 mt-1">WAV, MP3, OGG, FLAC, AAC</p>
            </div>
          </div>
        )}
        <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
          <TimeRuler />
          <ArrangementMarkers />
          {showTempoLane && <TempoLane />}

          <div ref={trackAreaRef} className="relative">
            <GridOverlay />
            <Playhead />

            {/* Committed context window overlay — Apple Teal (#5AC8FA) */}
            {ctxLeft !== null && ctxWidth !== null && ctxVRange && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: ctxLeft,
                  width: ctxWidth,
                  top: ctxVRange.top,
                  height: ctxVRange.height,
                  background: 'rgba(90, 200, 250, 0.10)',
                  borderLeft: '2px solid rgba(90, 200, 250, 0.7)',
                  borderRight: '2px solid rgba(90, 200, 250, 0.7)',
                  borderTop: '2px solid rgba(90, 200, 250, 0.35)',
                  borderBottom: '2px solid rgba(90, 200, 250, 0.35)',
                }}
              >
                <span
                  className="absolute top-0.5 left-1 text-[9px] font-mono select-none"
                  style={{ color: '#5AC8FA', background: 'rgba(20,30,40,0.75)', padding: '0 4px', borderRadius: 3 }}
                >
                  context window
                </span>
              </div>
            )}

            {/* Committed select window overlay — Apple Purple (#AF52DE) */}
            {selLeft !== null && selWidth !== null && selVRange && (
              <div
                className="absolute z-10"
                style={{
                  left: selLeft,
                  width: selWidth,
                  top: selVRange.top,
                  height: selVRange.height,
                  background: 'rgba(175, 82, 222, 0.10)',
                  borderLeft: '2px solid rgba(175, 82, 222, 0.7)',
                  borderRight: '2px solid rgba(175, 82, 222, 0.7)',
                  borderTop: '2px solid rgba(175, 82, 222, 0.35)',
                  borderBottom: '2px solid rgba(175, 82, 222, 0.35)',
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRegionCtxMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <span
                  className="absolute top-0.5 right-1 text-[9px] font-mono select-none pointer-events-none"
                  style={{ color: '#AF52DE', background: 'rgba(20,20,35,0.75)', padding: '0 4px', borderRadius: 3 }}
                >
                  select window
                </span>
              </div>
            )}

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

            {/* Live rubber-band clip selection overlay — Apple Blue (#007AFF) */}
            {normalDrag && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: normalDrag.left,
                  width: normalDrag.width,
                  top: normalDrag.top,
                  height: normalDrag.height,
                  background: 'rgba(0, 122, 255, 0.10)',
                  border: '1px solid rgba(0, 122, 255, 0.45)',
                }}
              />
            )}

            {sortedTracks.map((track) => (
              <TrackLane key={track.id} track={track} />
            ))}

            {sortedTracks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
                Add a track to begin
              </div>
            )}

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

      {selectWindow && (
        <MultiTrackGenerateModal
          selectWindow={selectWindow}
          contextWindow={contextWindow}
          onClose={() => {
            setSelectWindow(null);
          }}
        />
      )}

      {/* Region context menu — right-click on select window */}
      {regionCtxMenu && selectWindow && (
        <RegionContextMenu
          x={regionCtxMenu.x}
          y={regionCtxMenu.y}
          onRegenerateRegion={() => {
            setRegionCtxMenu(null);
            setRegionRegenerateTarget({
              startTime: selectWindow.startTime,
              endTime: selectWindow.endTime,
              trackIds: selectWindow.trackIds,
            });
          }}
          onClose={() => setRegionCtxMenu(null)}
          hasReadyClips={
            project.tracks.some((t) =>
              selectWindow.trackIds.includes(t.id) &&
              t.clips.some((c) => {
                const clipEnd = c.startTime + c.duration;
                return Math.min(selectWindow.endTime, clipEnd) > Math.max(selectWindow.startTime, c.startTime)
                  && c.generationStatus === 'ready';
              }),
            )
          }
        />
      )}

      {/* Region regeneration modal */}
      {regionRegenerateTarget && <RegionRegenerateModal />}
    </>
  );
}

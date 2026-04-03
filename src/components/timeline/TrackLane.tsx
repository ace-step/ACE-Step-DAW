import React, { useCallback, useLayoutEffect, useMemo, useState, useRef } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useVST3Store } from '../../store/vst3Store';
import { ClipBlock } from './ClipBlock';
import { TakeLaneStrip } from './TakeLaneStrip';
import { AutomationLaneView } from './AutomationLaneView';
import { AddLayerModal } from '../generation/AddLayerModal';
import { getBarDuration, snapToGrid } from '../../utils/time';
import { useAudioImport } from '../../hooks/useAudioImport';
import { CanvasContextMenu } from './CanvasContextMenu';
import { CrossfadeOverlay } from './CrossfadeOverlay';
import { getTimelineVisualDuration } from '../../utils/timelineZoom';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';
import { processTrackLaneFileDrop } from './trackLaneFileDrop';
import { getDragPayload, clearDragPayload } from '../../utils/dragPayload';
import { clientXToLaneX } from '../../utils/timelineCoords';
import {
  ARRANGEMENT_EMPTY_LANE_BG,
  ARRANGEMENT_ROW_BORDER_CLASS,
  ARRANGEMENT_ROW_SEPARATOR_COLOR,
  ARRANGEMENT_SELECTED_LANE_BG,
} from '../arrangement/rowSurface';
import {
  getArrangementLaneHeightForRenderedRowHeight,
  getArrangementRowHeight,
} from '../arrangement/rowLayout';

interface TrackLaneProps {
  track: Track;
}


const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;
const EMPTY_LANE_SURFACE_OVERLAY_OPACITY = 0.55;

function TrackLaneInner({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const isSelected = useUIStore((s) => s.selectedTrackIds.has(track.id));
  const selectTrack = useUIStore((s) => s.selectTrack);
  const setOpenSequencerTrackId = useUIStore((s) => s.setOpenSequencerTrackId);
  const setOpenDrumMachineTrackId = useUIStore((s) => s.setOpenDrumMachineTrackId);
  const setOpenStrudelEditor = useUIStore((s) => s.setOpenStrudelEditor);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const selectClip = useUIStore((s) => s.selectClip);
  const hasProject = useProjectStore((s) => s.project != null);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 0);
  const timeSignature = useProjectStore((s) => s.project?.timeSignature ?? 4);
  const timeSignatureDenominator = useProjectStore((s) => s.project?.timeSignatureDenominator ?? 4);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap);
  const automationLanesRaw = useProjectStore((s) => s.project?.automationLanes);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const convertMidiFileToStrudel = useProjectStore((s) => s.convertMidiFileToStrudel);
  const applyStrudelCodeToTrack = useProjectStore((s) => s.applyStrudelCodeToTrack);
  const placeGenerationHistoryOnTrack = useGenerationStore((s) => s.placeGenerationHistoryOnTrack);
  const loadVST3Plugin = useVST3Store((s) => s.loadPlugin);

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; startTime: number; duration: number;
  } | null>(null);

  const [addLayerTarget, setAddLayerTarget] = useState<{
    startTime: number; duration: number;
  } | null>(null);

  const {
    importAssetAsQuickSampler,
    importAudioFileAsSampler,
    importAudioFileAsNewQuickSampler,
    importAudioToTrack,
    importMidiFile,
    importLoopToTrack,
    importAssetToTrack,
  } = useAudioImport();
  const [fileDragOver, setFileDragOver] = useState(false);
  const [dropGhost, setDropGhost] = useState<{ left: number; width: number; name: string } | null>(null);
  const dragCounterRef = useRef(0);

  const laneRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startRowHeight: number; startLaneHeight: number } | null>(null);
  const laneHeight = track.laneHeight ?? 80;
  const rowHeight = getArrangementRowHeight(track);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const minRenderedRowHeight = getArrangementRowHeight({ ...track, laneHeight: MIN_LANE_HEIGHT });
    const maxRenderedRowHeight = getArrangementRowHeight({ ...track, laneHeight: MAX_LANE_HEIGHT });

    resizeRef.current = {
      startY: e.clientY,
      startRowHeight: rowHeight,
      startLaneHeight: laneHeight,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientY - resizeRef.current.startY;
      const nextRenderedRowHeight = Math.min(
        maxRenderedRowHeight,
        Math.max(minRenderedRowHeight, resizeRef.current.startRowHeight + delta),
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
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (resizeRef.current) {
        updateTrack(track.id, { laneHeight: resizeRef.current.startLaneHeight });
      }
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }, [rowHeight, track, updateTrack]);

  if (!hasProject) return null;

  const trackType = track.trackType ?? 'stems';
  const isSequencer = trackType === 'sequencer';
  const isDrumMachine = trackType === 'drumMachine';
  const isPianoRoll = trackType === 'pianoRoll';
  const isStrudel = trackType === 'strudel';
  const totalWidth = getTimelineVisualDuration(totalDuration, pixelsPerSecond, timelineViewportWidth) * pixelsPerSecond;
  const defaultClipDuration = getBarDuration(bpm, timeSignature, timeSignatureDenominator) * 4;

  const hitsClip = useCallback((clickTime: number): boolean => {
    const GUARD = 8 / pixelsPerSecond;
    return track.clips.some(
      (c) => clickTime >= c.startTime - GUARD && clickTime < c.startTime + c.duration + GUARD,
    );
  }, [track.clips, pixelsPerSecond]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    const laneX = clientXToLaneX(e.clientX);
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));
    const remaining = totalDuration - startTime;
    const duration = Math.max(10, Math.min(30, remaining));
    setCtxMenu({ x: e.clientX, y: e.clientY, startTime, duration });
    setAddLayerTarget(null);
  }, [pixelsPerSecond, bpm, tempoMap, totalDuration]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    // For pattern-based tracks, double-click opens the editor
    if (isStrudel) {
      e.stopPropagation();
      setOpenStrudelEditor(track.id);
      return;
    }
    if (isDrumMachine) {
      e.stopPropagation();
      setOpenDrumMachineTrackId(track.id);
      return;
    }
    if (isSequencer) {
      e.stopPropagation();
      setOpenSequencerTrackId(track.id);
      return;
    }
    if (isPianoRoll) {
      e.stopPropagation();
      const rawTime = clientXToLaneX(e.clientX) / pixelsPerSecond;
      const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));
      const clip = addClip(track.id, {
        startTime,
        duration: defaultClipDuration,
        prompt: 'MIDI Clip',
        globalCaption: '',
        lyrics: '',
        midiData: { notes: [], grid: '1/16' },
        source: 'uploaded',
      });
      selectClip(clip.id);
      setOpenPianoRoll(track.id, clip.id);
      return;
    }

    // For stems/sample/audio tracks, double-click on empty space creates a new empty clip
    e.stopPropagation();
    const clickTime = clientXToLaneX(e.clientX) / pixelsPerSecond;
    if (hitsClip(clickTime)) return;
    const startTime = Math.max(0, snapToGrid(clickTime, bpm, 1, tempoMap));
    const clip = addClip(track.id, {
      startTime,
      duration: defaultClipDuration,
      prompt: 'Audio Clip',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    selectClip(clip.id);
  }, [isDrumMachine, isSequencer, isPianoRoll, isStrudel, pixelsPerSecond, bpm, tempoMap, hitsClip, track.id, addClip, defaultClipDuration, setOpenDrumMachineTrackId, setOpenSequencerTrackId, setOpenStrudelEditor, selectClip, setOpenPianoRoll]);

  const clearSel = useCallback(() => {
    setAddLayerTarget(null);
  }, []);

  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (
      types.includes('Files')
      || types.includes('application/x-loop-id')
      || types.includes('application/x-asset-id')
      || types.includes('application/x-generation-history-id')
      || types.includes('application/x-vst3-plugin')
    ) {
      e.preventDefault();
      dragCounterRef.current++;
      setFileDragOver(true);
    }
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (
      types.includes('Files')
      || types.includes('application/x-loop-id')
      || types.includes('application/x-asset-id')
      || types.includes('application/x-generation-history-id')
      || types.includes('application/x-vst3-plugin')
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      // Compute ghost preview position (works for both internal drag payloads and external OS file drags)
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
  }, [hasProject, bpm, tempoMap, pixelsPerSecond, defaultClipDuration]);

  const handleFileDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setFileDragOver(false);
      setDropGhost(null);
    }
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setFileDragOver(false);
    setDropGhost(null);
    clearDragPayload();
    if (!hasProject) return;

    const laneX = clientXToLaneX(e.clientX);
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));

    // Handle VST3 plugin drop — loads a plugin instance onto this track
    const vst3PluginId = e.dataTransfer.getData('application/x-vst3-plugin');
    if (vst3PluginId) {
      void loadVST3Plugin(vst3PluginId, track.id);
      return;
    }

    const historyId = e.dataTransfer.getData('application/x-generation-history-id');
    if (historyId) {
      placeGenerationHistoryOnTrack(historyId, track.id, startTime);
      return;
    }

    // Handle preset loop drop
    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      await importLoopToTrack(loopId, track.id, startTime);
      return;
    }

    // Handle asset drop
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      if (track.trackType === 'pianoRoll') {
        await importAssetAsQuickSampler(assetId, track.id);
        return;
      }
      await importAssetToTrack(assetId, track.id, startTime);
      return;
    }

    // Handle file drop
    // Alt+Drop on any track → create as Quick Sampler (new track)
    const wantsQuickSampler = e.altKey;
    const files = e.dataTransfer.files;
    if (!files.length) return;
    for (const file of Array.from(files)) {
      await processTrackLaneFileDrop({
        file,
        trackType: track.trackType,
        trackId: track.id,
        startTime,
        wantsQuickSampler,
        importAudioFileAsSampler,
        importAudioFileAsNewQuickSampler,
        importAudioToTrack,
        importMidiFile,
        convertMidiFileToStrudel,
        applyStrudelCodeToTrack,
        setOpenStrudelEditor,
      });
    }
  }, [applyStrudelCodeToTrack, convertMidiFileToStrudel, loadVST3Plugin, placeGenerationHistoryOnTrack, hasProject, bpm, tempoMap, pixelsPerSecond, track.id, track.trackType, importAssetAsQuickSampler, importAssetToTrack, importAudioFileAsSampler, importAudioFileAsNewQuickSampler, importAudioToTrack, importMidiFile, importLoopToTrack, setOpenStrudelEditor]);

  const hasClips = track.clips.length > 0;
  const shouldHighlightEmptyLane = !hasClips && !isSequencer && !isDrumMachine && !isPianoRoll && !isStrudel;
  const automationLanes = useMemo(
    () => (automationLanesRaw ?? []).filter((l) => l.trackId === track.id),
    [automationLanesRaw, track.id],
  );

  // Report lane geometry to uiStore so SelectedTrackCursor can read it
  // without triggering per-frame DOM queries during playback.
  useLayoutEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const update = () => {
      const parentEl = el.offsetParent as HTMLElement | null;
      const parentOffset = parentEl ? parentEl.offsetTop : 0;
      useUIStore.getState().setTrackLaneRect(track.id, {
        top: el.offsetTop + parentOffset,
        height: el.offsetHeight,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      useUIStore.getState().removeTrackLaneRect(track.id);
    };
  }, [track.id]);

  return (
    <>
      <div
        ref={laneRef}
        data-track-id={track.id}
        data-timeline-lane
        data-testid={`track-lane-${track.id}`}
        data-lane-surface={shouldHighlightEmptyLane ? 'empty' : 'default'}
        className={`relative border-b group/lane ${ARRANGEMENT_ROW_BORDER_CLASS} ${fileDragOver ? 'bg-blue-900/20' : ''}`}
        style={{
          width: totalWidth,
          height: rowHeight,
          opacity: track.muted ? 0.4 : 1,
          borderColor: ARRANGEMENT_ROW_SEPARATOR_COLOR,
          contain: 'content',
          contentVisibility: 'auto',
          containIntrinsicSize: `auto ${rowHeight}px`,
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onDragEnter={handleFileDragEnter}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {/* Selected track overlay — semi-transparent so grid lines show through */}
        {isSelected && !fileDragOver && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }}
          />
        )}

        {shouldHighlightEmptyLane && !fileDragOver && !isSelected && (
          <div
            aria-hidden="true"
            data-testid={`track-lane-surface-overlay-${track.id}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: ARRANGEMENT_EMPTY_LANE_BG,
              opacity: EMPTY_LANE_SURFACE_OVERLAY_OPACITY,
            }}
          />
        )}

        {/* Empty lane hover hint — appears when hovering empty audio/stems tracks */}
        {shouldHighlightEmptyLane && !fileDragOver && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover/lane:opacity-100 transition-opacity duration-300"
            data-testid="empty-lane-hint"
          >
            <span className="text-[10px] text-zinc-500 select-none">
              Drag clips here or double-click to create
            </span>
          </div>
        )}

        {/* Drop ghost preview — shows where the clip will land */}
        {dropGhost && (
          <div
            className="absolute top-1 bottom-1 rounded-md pointer-events-none z-30 flex items-center overflow-hidden"
            style={{
              left: dropGhost.left,
              width: Math.max(dropGhost.width, 4),
              backgroundColor: track.color ? `${track.color}4D` : 'rgba(94, 89, 255, 0.30)',
              border: `1px dashed ${track.color ?? 'rgba(94, 89, 255, 0.7)'}`,
            }}
          >
            <span className="text-[10px] text-white/70 px-2 truncate">{dropGhost.name}</span>
          </div>
        )}

        <>
          {track.clips.map((clip) => (
            <ClipBlock key={clip.id} clip={clip} track={track} />
          ))}
          <CrossfadeOverlay track={track} />

          {isSequencer && !hasClips && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => setOpenSequencerTrackId(track.id)}
            >
              <div className="flex items-center gap-2 bg-[#2d2d2d]/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-[#444] border-dashed">
                <span className="text-emerald-400 text-sm">SEQ</span>
                <span className="text-xs text-zinc-400">Double-click to open sequencer editor</span>
              </div>
            </div>
          )}

          {isStrudel && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => setOpenStrudelEditor(track.id)}
            >
              <div className="flex items-center gap-2 bg-[#2d2d2d]/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-[#e67e22]/30 border-dashed">
                <span className="text-[#e67e22] text-sm">STR</span>
                <span className="text-xs text-zinc-400">Double-click to open pattern editor</span>
              </div>
            </div>
          )}

          {isPianoRoll && !hasClips && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => {
                const clip = addClip(track.id, {
                  startTime: 0,
                  duration: defaultClipDuration,
                  prompt: 'MIDI Clip',
                  globalCaption: '',
                  lyrics: '',
                  midiData: { notes: [], grid: '1/16' },
                  source: 'uploaded',
                });
                selectClip(clip.id);
                setOpenPianoRoll(track.id, clip.id);
              }}
            >
              <div className="flex items-center gap-2 bg-[#2d2d2d]/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-[#444] border-dashed">
                <span className="text-violet-300 text-sm">{TRACK_TYPE_CATALOG[trackType].abbr}</span>
                <span className="text-xs text-zinc-400">Double-click to create or open a MIDI clip</span>
              </div>
            </div>
          )}
        </>

        {ctxMenu && (
          <CanvasContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
          />
        )}

        {/* Bottom-edge resize handle */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-20"
          onMouseDown={onResizeMouseDown}
        />
      </div>

      {/* Take Lanes — rendered below the track lane when showTakeLanes is enabled */}
      {track.showTakeLanes && track.clips.map((clip) =>
        clip.takes && clip.takes.length > 0 ? (
          <div key={`takes-${clip.id}`} className="relative border-b border-[#1e1e30]" style={{ width: totalWidth }}>
            <TakeLaneStrip clip={clip} track={track} />
          </div>
        ) : null,
      )}

      {/* Automation Lanes — rendered below the track lane when present */}
      {automationLanes.map((lane) => (
        <AutomationLaneView key={lane.id} trackId={track.id} lane={lane} />
      ))}

      {addLayerTarget && (
        <AddLayerModal
          trackId={track.id}
          startTime={addLayerTarget.startTime}
          duration={addLayerTarget.duration}
          contextWindow={contextWindow}
          onClose={clearSel}
        />
      )}
    </>
  );
}

export const TrackLane = React.memo(TrackLaneInner);

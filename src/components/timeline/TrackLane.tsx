import { useCallback, useState, useRef } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { ClipBlock } from './ClipBlock';
import { TakeLaneStrip } from './TakeLaneStrip';
import { AutomationLaneView } from './AutomationLaneView';
import { AddLayerModal } from '../generation/AddLayerModal';
import { getBarDuration, snapToGrid } from '../../utils/time';
import { useAudioImport } from '../../hooks/useAudioImport';
import { ContextMenuWrapper, ContextMenuItem } from '../ui/ContextMenu';
import { CrossfadeOverlay } from './CrossfadeOverlay';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';
import {
  ARRANGEMENT_EMPTY_LANE_BG,
  ARRANGEMENT_ROW_BORDER_CLASS,
  ARRANGEMENT_ROW_SEPARATOR_COLOR,
} from '../arrangement/rowSurface';

interface TrackLaneProps {
  track: Track;
}

interface LaneContextMenuProps {
  x: number;
  y: number;
  onAddLayer: () => void;
  onOpenSequencer?: () => void;
  onOpenPianoRoll?: () => void;
  onCreateQuickSampler?: () => void;
  onClose: () => void;
}

function LaneContextMenu({ x, y, onAddLayer, onOpenSequencer, onOpenPianoRoll, onCreateQuickSampler, onClose }: LaneContextMenuProps) {
  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose}>
      {onOpenSequencer && (
        <ContextMenuItem label="Open Sequencer Editor..." onClick={() => { onClose(); onOpenSequencer(); }} color="#6ee7b7" />
      )}
      {onOpenPianoRoll && (
        <ContextMenuItem label="Open Piano Roll..." onClick={() => { onClose(); onOpenPianoRoll(); }} color="#c4b5fd" />
      )}
      {onCreateQuickSampler && (
        <ContextMenuItem label="Create Quick Sampler..." onClick={() => { onClose(); onCreateQuickSampler(); }} color="#fcd34d" />
      )}
      <ContextMenuItem label="Add Layer..." onClick={() => { onClose(); onAddLayer(); }} />
    </ContextMenuWrapper>
  );
}

const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;
const EMPTY_LANE_SURFACE_OVERLAY_OPACITY = 0.55;

export function TrackLane({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setOpenSequencerTrackId = useUIStore((s) => s.setOpenSequencerTrackId);
  const setOpenDrumMachineTrackId = useUIStore((s) => s.setOpenDrumMachineTrackId);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const selectClip = useUIStore((s) => s.selectClip);
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const ensureMidiClip = useProjectStore((s) => s.ensureMidiClip);
  const placeGenerationHistoryOnTrack = useGenerationStore((s) => s.placeGenerationHistoryOnTrack);

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
    openQuickSamplerFilePicker,
  } = useAudioImport();
  const [fileDragOver, setFileDragOver] = useState(false);

  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const laneHeight = track.laneHeight ?? 64;

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startY: e.clientY, startH: laneHeight };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientY - resizeRef.current.startY;
      const newH = Math.min(MAX_LANE_HEIGHT, Math.max(MIN_LANE_HEIGHT, resizeRef.current.startH + delta));
      updateTrack(track.id, { laneHeight: newH });
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (resizeRef.current) {
        updateTrack(track.id, { laneHeight: resizeRef.current.startH });
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
  }, [laneHeight, track.id, updateTrack]);

  if (!project) return null;

  const trackType = track.trackType ?? 'stems';
  const isSequencer = trackType === 'sequencer';
  const isDrumMachine = trackType === 'drumMachine';
  const isPianoRoll = trackType === 'pianoRoll';
  const totalWidth = project.totalDuration * pixelsPerSecond;
  const defaultClipDuration = getBarDuration(project.bpm, project.timeSignature) * 4;

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
    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = e.clientX - rect.left;
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1, project.tempoMap));
    const remaining = project.totalDuration - startTime;
    const duration = Math.max(10, Math.min(30, remaining));
    setCtxMenu({ x: e.clientX, y: e.clientY, startTime, duration });
    setAddLayerTarget(null);
  }, [pixelsPerSecond, project.bpm, project.tempoMap, project.totalDuration]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    // For sequencer tracks, double-click opens the editor
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
      const rect = e.currentTarget.getBoundingClientRect();
      const laneX = e.clientX - rect.left;
      const rawTime = laneX / pixelsPerSecond;
      const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1, project.tempoMap));
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
    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = e.clientX - rect.left;
    const clickTime = laneX / pixelsPerSecond;
    if (hitsClip(clickTime)) return;
    const startTime = Math.max(0, snapToGrid(clickTime, project.bpm, 1, project.tempoMap));
    const clip = addClip(track.id, {
      startTime,
      duration: defaultClipDuration,
      prompt: 'Audio Clip',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    selectClip(clip.id);
  }, [isDrumMachine, isSequencer, isPianoRoll, pixelsPerSecond, project.bpm, project.tempoMap, hitsClip, track.id, addClip, defaultClipDuration, setOpenDrumMachineTrackId, setOpenSequencerTrackId, selectClip, setOpenPianoRoll]);

  const clearSel = useCallback(() => {
    setAddLayerTarget(null);
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (
      types.includes('Files')
      || types.includes('application/x-loop-id')
      || types.includes('application/x-asset-id')
      || types.includes('application/x-generation-history-id')
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback(() => {
    setFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    if (!project) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = e.clientX - rect.left;
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1, project.tempoMap));

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
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
        if (track.trackType === 'pianoRoll') {
          await importAudioFileAsSampler(file, track.id);
        } else if (wantsQuickSampler) {
          await importAudioFileAsNewQuickSampler(file);
        } else {
          await importAudioToTrack(file, track.id, startTime);
        }
      } else if (/\.(mid|midi)$/i.test(file.name)) {
        await importMidiFile(file, startTime);
      }
    }
  }, [placeGenerationHistoryOnTrack, project, pixelsPerSecond, track.id, track.trackType, importAssetAsQuickSampler, importAssetToTrack, importAudioFileAsSampler, importAudioFileAsNewQuickSampler, importAudioToTrack, importMidiFile, importLoopToTrack]);

  const hasClips = track.clips.length > 0;
  const shouldHighlightEmptyLane = !hasClips && !isSequencer && !isDrumMachine && !isPianoRoll;
  const automationLanes = (project?.automationLanes ?? []).filter((l) => l.trackId === track.id);

  return (
    <>
      <div
        data-track-id={track.id}
        data-testid={`track-lane-${track.id}`}
        data-lane-surface={shouldHighlightEmptyLane ? 'empty' : 'default'}
        className={`relative border-b ${ARRANGEMENT_ROW_BORDER_CLASS} ${fileDragOver ? 'bg-blue-900/20' : ''}`}
        style={{
          width: totalWidth,
          height: laneHeight,
          opacity: track.muted ? 0.4 : 1,
          borderColor: ARRANGEMENT_ROW_SEPARATOR_COLOR,
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {shouldHighlightEmptyLane && !fileDragOver && (
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

        {fileDragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 border border-dashed border-blue-400/60 rounded-sm">
            <span className="text-[10px] text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded">Drop audio or MIDI here {track.trackType !== 'pianoRoll' ? '(Alt = Quick Sampler)' : ''}</span>
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
          <LaneContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onAddLayer={() => setAddLayerTarget({ startTime: ctxMenu.startTime, duration: ctxMenu.duration })}
            onOpenSequencer={isSequencer ? () => setOpenSequencerTrackId(track.id) : undefined}
            onOpenPianoRoll={isPianoRoll ? () => {
              const clip = addClip(track.id, {
                startTime: ctxMenu.startTime,
                duration: defaultClipDuration,
                prompt: 'MIDI Clip',
                globalCaption: '',
                lyrics: '',
                midiData: { notes: [], grid: '1/16' },
                source: 'uploaded',
              });
              selectClip(clip.id);
              setOpenPianoRoll(track.id, clip.id);
            } : undefined}
            onCreateQuickSampler={() => openQuickSamplerFilePicker()}
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

import { useCallback, useState, useRef } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { ClipBlock } from './ClipBlock';
import { AutomationLaneView } from './AutomationLaneView';
import { AddLayerModal } from '../generation/AddLayerModal';
import { snapToGrid } from '../../utils/time';
import { useAudioImport } from '../../hooks/useAudioImport';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';

function getBarDurationSec(bpm: number, timeSignature: number): number {
  return (60 / bpm) * timeSignature;
}

interface TrackLaneProps {
  track: Track;
}

interface LaneContextMenuProps {
  x: number;
  y: number;
  onAddLayer: () => void;
  onOpenSequencer?: () => void;
  onOpenPianoRoll?: () => void;
  onClose: () => void;
}

function LaneContextMenu({ x, y, onAddLayer, onOpenSequencer, onOpenPianoRoll, onClose }: LaneContextMenuProps) {
  const clampedX = Math.min(x, window.innerWidth - 180);
  const clampedY = Math.min(y, window.innerHeight - 80);
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[160px]"
        style={{ left: clampedX, top: clampedY }}
      >
        {onOpenSequencer && (
          <button
            onClick={() => { onClose(); onOpenSequencer(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Open Sequencer Editor...
          </button>
        )}
        {onOpenPianoRoll && (
          <button
            onClick={() => { onClose(); onOpenPianoRoll(); }}
            className="w-full text-left px-3 py-1.5 text-[11px] text-violet-300 hover:bg-daw-accent hover:text-white transition-colors"
          >
            Open Piano Roll...
          </button>
        )}
        <button
          onClick={() => { onClose(); onAddLayer(); }}
          className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
        >
          Add Layer...
        </button>
      </div>
    </>
  );
}

const MIN_LANE_HEIGHT = 40;
const MAX_LANE_HEIGHT = 400;

export function TrackLane({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const setOpenSequencerTrackId = useUIStore((s) => s.setOpenSequencerTrackId);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const ensureMidiClip = useProjectStore((s) => s.ensureMidiClip);

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; startTime: number; duration: number;
  } | null>(null);

  const [addLayerTarget, setAddLayerTarget] = useState<{
    startTime: number; duration: number;
  } | null>(null);

  const { importAudioBufferToTrack, importAudioToTrack, importLoopToTrack, importAssetToTrack } = useAudioImport();
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
    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [laneHeight, track.id, updateTrack]);

  if (!project) return null;

  const trackType = track.trackType ?? 'stems';
  const isSequencer = trackType === 'sequencer';
  const isPianoRoll = trackType === 'pianoRoll';
  const totalWidth = project.totalDuration * pixelsPerSecond;

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
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1));
    const remaining = project.totalDuration - startTime;
    const duration = Math.max(10, Math.min(30, remaining));
    setCtxMenu({ x: e.clientX, y: e.clientY, startTime, duration });
    setAddLayerTarget(null);
  }, [pixelsPerSecond, project.bpm, project.totalDuration]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    // For sequencer tracks, double-click opens the editor
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
      const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1));
      const clip = ensureMidiClip(track.id, startTime, Math.max(4, getBarDurationSec(project.bpm, project.timeSignature)));
      setOpenPianoRoll(track.id, clip.id);
      return;
    }

    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = e.clientX - rect.left;
    const clickTime = laneX / pixelsPerSecond;
    if (hitsClip(clickTime)) return;
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1));
    const remaining = project.totalDuration - startTime;
    const duration = Math.max(10, Math.min(30, remaining));
    setCtxMenu({ x: e.clientX, y: e.clientY, startTime, duration });
    setAddLayerTarget(null);
  }, [isSequencer, isPianoRoll, pixelsPerSecond, project.bpm, project.totalDuration, project.timeSignature, hitsClip, track.id, setOpenSequencerTrackId, ensureMidiClip, setOpenPianoRoll]);

  const clearSel = useCallback(() => {
    setAddLayerTarget(null);
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
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
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1));

    // Handle preset loop drop
    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      await importLoopToTrack(loopId, track.id, startTime);
      return;
    }

    // Handle asset drop
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetToTrack(assetId, track.id, startTime);
      return;
    }

    // Handle file drop
    const files = e.dataTransfer.files;
    if (!files.length) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
        await importAudioToTrack(file, track.id, startTime);
      }
    }
  }, [project, pixelsPerSecond, track.id, importAudioToTrack, importLoopToTrack, importAssetToTrack]);

  const hasClips = track.clips.length > 0;
  const automationLanes = (project?.automationLanes ?? []).filter((l) => l.trackId === track.id);

  return (
    <>
      <div
        data-track-id={track.id}
        data-testid={`track-lane-${track.id}`}
        className={`relative border-b border-[#333] ${fileDragOver ? 'bg-blue-900/20' : ''}`}
        style={{ width: totalWidth, height: laneHeight }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {fileDragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 border border-dashed border-blue-400/60 rounded-sm">
            <span className="text-[10px] text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded">Drop audio here</span>
          </div>
        )}

        <>
          {track.clips.map((clip) => (
            <ClipBlock key={clip.id} clip={clip} track={track} />
          ))}

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
                const clip = ensureMidiClip(track.id, 0, Math.max(4, getBarDurationSec(project.bpm, project.timeSignature)));
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
              const clip = ensureMidiClip(track.id, ctxMenu.startTime, ctxMenu.duration);
              setOpenPianoRoll(track.id, clip.id);
            } : undefined}
            onClose={() => setCtxMenu(null)}
          />
        )}

        {/* Bottom-edge resize handle */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-20"
          onMouseDown={onResizeMouseDown}
        />
      </div>

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

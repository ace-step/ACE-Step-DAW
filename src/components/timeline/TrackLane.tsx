import { useCallback, useState, useRef } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { ClipBlock } from './ClipBlock';
import { AddLayerModal } from '../generation/AddLayerModal';
import { snapToGrid } from '../../utils/time';
import { useAudioImport } from '../../hooks/useAudioImport';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';

interface TrackLaneProps {
  track: Track;
}

interface LaneContextMenuProps {
  x: number;
  y: number;
  onAddLayer: () => void;
  onOpenSequencer?: () => void;
  onClose: () => void;
}

function LaneContextMenu({ x, y, onAddLayer, onOpenSequencer, onClose }: LaneContextMenuProps) {
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
        className="fixed z-50 bg-daw-surface border border-daw-border rounded shadow-xl py-1 min-w-[160px]"
        style={{ left: clampedX, top: clampedY }}
      >
        {onOpenSequencer && (
          <button
            onClick={() => { onClose(); onOpenSequencer(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-emerald-300 hover:bg-daw-surface-2 transition-colors"
          >
            Open Sequencer Editor...
          </button>
        )}
        <button
          onClick={() => { onClose(); onAddLayer(); }}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
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
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; startTime: number; duration: number;
  } | null>(null);

  const [addLayerTarget, setAddLayerTarget] = useState<{
    startTime: number; duration: number;
  } | null>(null);

  const { importAudioToTrack } = useAudioImport();
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
  const isComingSoon = trackType === 'pianoRoll';
  const totalWidth = project.totalDuration * pixelsPerSecond;

  const hitsClip = useCallback((clickTime: number): boolean => {
    const GUARD = 8 / pixelsPerSecond;
    return track.clips.some(
      (c) => clickTime >= c.startTime - GUARD && clickTime < c.startTime + c.duration + GUARD,
    );
  }, [track.clips, pixelsPerSecond]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isComingSoon) return;
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
  }, [isComingSoon, pixelsPerSecond, project.bpm, project.totalDuration]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isComingSoon) return;

    // For sequencer tracks, double-click opens the editor
    if (isSequencer) {
      e.stopPropagation();
      setOpenSequencerTrackId(track.id);
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
  }, [isComingSoon, isSequencer, pixelsPerSecond, project.bpm, project.totalDuration, hitsClip, track.id, setOpenSequencerTrackId]);

  const clearSel = useCallback(() => {
    setAddLayerTarget(null);
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
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
    const files = e.dataTransfer.files;
    if (!files.length || !project) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = e.clientX - rect.left;
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, project.bpm, 1));

    for (const file of Array.from(files)) {
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
        await importAudioToTrack(file, track.id, startTime);
      }
    }
  }, [project, pixelsPerSecond, track.id, importAudioToTrack]);

  const hasClips = track.clips.length > 0;

  return (
    <>
      <div
        data-track-id={track.id}
        className={`relative border-b border-daw-border ${fileDragOver ? 'bg-blue-900/20' : ''}`}
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

        {isComingSoon ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="flex items-center gap-2 bg-daw-surface/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-daw-border">
              <span className="text-lg">{TRACK_TYPE_CATALOG[trackType].emoji}</span>
              <span className="text-xs font-medium text-zinc-400">{TRACK_TYPE_CATALOG[trackType].label}</span>
              <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Coming Soon</span>
            </div>
          </div>
        ) : (
          <>
            {/* Render clips (works for all track types including sequencer after bounce) */}
            {track.clips.map((clip) => (
              <ClipBlock key={clip.id} clip={clip} track={track} />
            ))}

            {/* Sequencer track hint when no bounced clips */}
            {isSequencer && !hasClips && (
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={() => setOpenSequencerTrackId(track.id)}
              >
                <div className="flex items-center gap-2 bg-daw-surface/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-daw-border border-dashed">
                  <span className="text-emerald-400 text-sm">SEQ</span>
                  <span className="text-xs text-zinc-400">Double-click to open sequencer editor</span>
                </div>
              </div>
            )}
          </>
        )}

        {ctxMenu && (
          <LaneContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onAddLayer={() => setAddLayerTarget({ startTime: ctxMenu.startTime, duration: ctxMenu.duration })}
            onOpenSequencer={isSequencer ? () => setOpenSequencerTrackId(track.id) : undefined}
            onClose={() => setCtxMenu(null)}
          />
        )}

        {/* Bottom-edge resize handle */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-indigo-500/40 transition-colors z-20"
          onMouseDown={onResizeMouseDown}
        />
      </div>

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


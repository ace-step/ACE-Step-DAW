import { useCallback, useState } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { ClipBlock } from './ClipBlock';
import { AddLayerModal } from '../generation/AddLayerModal';
import { snapToGrid } from '../../utils/time';

interface TrackLaneProps {
  track: Track;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane context menu (right-click / double-click on empty area)
// ─────────────────────────────────────────────────────────────────────────────

interface LaneContextMenuProps {
  x: number;
  y: number;
  onAddLayer: () => void;
  onClose: () => void;
}

function LaneContextMenu({ x, y, onAddLayer, onClose }: LaneContextMenuProps) {
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
        <button
          onClick={() => { onClose(); onAddLayer(); }}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
        >
          Add Layer…
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrackLane
// ─────────────────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 6;

export function TrackLane({ track }: TrackLaneProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const project = useProjectStore((s) => s.project);

  // ── Context menu ──────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; startTime: number; duration: number;
  } | null>(null);

  // ── AddLayerModal state (opened via right-click / double-click context menu) ──
  const [addLayerTarget, setAddLayerTarget] = useState<{
    startTime: number; duration: number;
  } | null>(null);

  if (!project) return null;

  const totalWidth = project.totalDuration * pixelsPerSecond;

  // Check if a time position is on or near an existing clip
  const hitsClip = useCallback((clickTime: number): boolean => {
    const GUARD = 8 / pixelsPerSecond;
    return track.clips.some(
      (c) => clickTime >= c.startTime - GUARD && clickTime < c.startTime + c.duration + GUARD,
    );
  }, [track.clips, pixelsPerSecond]);

  // ── Right-click → context menu ────────────────────────────────────────────
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

  // ── Double-click → context menu (Mac alternative) ────────────────────────
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
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
  }, [pixelsPerSecond, project.bpm, project.totalDuration, hitsClip]);

  // Drag-select is now handled globally by Timeline (capture phase) so that
  // drags in any direction work across multiple track lanes. TrackLane no
  // longer needs its own drag-select handler.

  const clearSel = useCallback(() => {
    setAddLayerTarget(null);
  }, []);

  return (
    <>
      <div
        className="relative h-16 border-b border-daw-border"
        style={{ width: totalWidth }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        {/* Clips */}
        {track.clips.map((clip) => (
          <ClipBlock key={clip.id} clip={clip} track={track} />
        ))}

        {/* Lane context menu */}
        {ctxMenu && (
          <LaneContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onAddLayer={() => setAddLayerTarget({ startTime: ctxMenu.startTime, duration: ctxMenu.duration })}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>

      {/* AddLayerModal — rendered outside the lane div to avoid clipping */}
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

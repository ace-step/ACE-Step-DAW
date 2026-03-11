import { useRef, useCallback, useState } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGeneration } from '../../hooks/useGeneration';
import { hexToRgba } from '../../utils/color';
import { snapToGrid } from '../../utils/time';
import { AddLayerModal } from '../generation/AddLayerModal';
import { regenerateClip } from '../../services/generationPipeline';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

const EDGE_HANDLE_PX = 6;
const MIN_CLIP_DURATION = 0.5;

type DragMode = 'move' | 'resize-left' | 'resize-right';

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);
  const project = useProjectStore((s) => s.project);
  const { generateClip } = useGeneration();

  // AddLayerModal trigger (from clip context menu "Add Layer here")
  const [addLayerOpen, setAddLayerOpen] = useState(false);

  // Version navigation
  const versions = clip.versions ?? [];
  const activeVersionIdx = clip.activeVersionIdx ?? (versions.length > 0 ? versions.length - 1 : -1);
  const totalVersions = versions.length;

  const peaks = clip.waveformPeaks;

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isSelected = selectedClipIds.has(clip.id);

  const dragRef = useRef(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const getDragMode = useCallback((e: React.MouseEvent): DragMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX <= EDGE_HANDLE_PX) return 'resize-left';
    if (relX >= rect.width - EDGE_HANDLE_PX) return 'resize-right';
    return 'move';
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const mode = getDragMode(e);
    const startX = e.clientX;
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origAudioOffset = clip.audioOffset ?? 0;
    const origAudioDuration = clip.audioDuration ?? clip.duration;
    const bpm = project?.bpm ?? 120;
    const totalDuration = project?.totalDuration ?? 600;
    dragRef.current = false;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) < 3 && !dragRef.current) return;
      dragRef.current = true;

      const deltaSec = dx / pixelsPerSecond;

      if (mode === 'move') {
        let newStart = snapToGrid(origStart + deltaSec, bpm, 1);
        newStart = Math.max(0, Math.min(newStart, totalDuration - origDuration));
        updateClip(clip.id, { startTime: newStart });
      } else if (mode === 'resize-left') {
        // Dragging left edge: crops from the start of the audio
        let newStart = snapToGrid(origStart + deltaSec, bpm, 1);
        newStart = Math.max(0, newStart);
        const maxStart = origStart + origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);

        const shift = newStart - origStart;
        // Constrain: can't crop past the audio buffer end
        let newAudioOffset = origAudioOffset + shift;
        if (newAudioOffset < 0) {
          newStart = origStart - origAudioOffset;
          newAudioOffset = 0;
        }
        if (newAudioOffset > origAudioDuration - MIN_CLIP_DURATION) {
          newAudioOffset = origAudioDuration - MIN_CLIP_DURATION;
          newStart = origStart + (newAudioOffset - origAudioOffset);
        }
        const newDuration = origDuration + (origStart - newStart);
        updateClip(clip.id, { startTime: newStart, duration: newDuration, audioOffset: newAudioOffset });
      } else {
        // Dragging right edge: extends or crops the clip duration.
        // No audio-buffer cap — if the clip exceeds the buffer, Web Audio pads
        // with silence and the user can regenerate to fill the extra region.
        let newDuration = snapToGrid(origDuration + deltaSec, bpm, 1);
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration);
        newDuration = Math.min(newDuration, totalDuration - origStart);
        updateClip(clip.id, { duration: newDuration });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [clip.id, clip.startTime, clip.duration, clip.audioOffset, clip.audioDuration, pixelsPerSecond, project, updateClip, getDragMode]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu(null);
    selectClip(clip.id, e.metaKey || e.ctrlKey);
  }, [clip.id, selectClip]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const el = e.currentTarget as HTMLElement;
    if (relX <= EDGE_HANDLE_PX || relX >= rect.width - EDGE_HANDLE_PX) {
      el.style.cursor = 'col-resize';
    } else {
      el.style.cursor = 'grab';
    }
  }, []);

  const statusStyles: Record<string, string> = {
    empty: 'opacity-60',
    queued: 'opacity-70',
    generating: 'opacity-80 animate-pulse',
    processing: 'opacity-80 animate-pulse',
    ready: '',
    error: 'opacity-60',
    stale: 'opacity-50',
  };

  // Crop waveform peaks to the visible region
  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const peakWidthPx = width - 4; // padding

  // Determine visible portion of peaks array
  const startPeakIdx = peaks ? Math.floor((audioOffset / audioDuration) * peaks.length) : 0;
  const endPeakIdx = peaks ? Math.min(
    Math.ceil(((audioOffset + clip.duration) / audioDuration) * peaks.length),
    peaks.length,
  ) : 0;
  const visiblePeakCount = endPeakIdx - startPeakIdx;
  const numBars = peaks ? Math.min(visiblePeakCount, Math.floor(peakWidthPx / 2)) : 0;
  const barSpacing = numBars > 0 ? peakWidthPx / numBars : 0;

  return (
    <>
      <div
        className={`absolute top-1 bottom-1 rounded-sm select-none overflow-hidden
          ${statusStyles[clip.generationStatus] ?? ''}
          ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        `}
        style={{
          left,
          width: Math.max(width, 4),
          backgroundColor: hexToRgba(track.color, 0.3),
          borderLeft: `2px solid ${track.color}`,
        }}
        data-clip-block
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMoveLocal}
        onContextMenu={handleContextMenu}
      >
        {/* Resize handles */}
        <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-col-resize z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-10" />

        {/* Waveform — peaks rendered at fixed density, not stretched */}
        {peaks && numBars > 0 && (
          <div className="absolute inset-0 flex items-center overflow-hidden">
            <svg
              width={peakWidthPx}
              height="100%"
              viewBox={`0 0 ${peakWidthPx} 100`}
              preserveAspectRatio="none"
              className="opacity-60 ml-0.5"
            >
              {Array.from({ length: numBars }, (_, i) => {
                const peakIdx = startPeakIdx + Math.floor((i / numBars) * visiblePeakCount);
                const peak = peaks[Math.min(peakIdx, peaks.length - 1)];
                const h = peak * 80;
                return (
                  <rect
                    key={i}
                    x={i * barSpacing}
                    y={50 - h / 2}
                    width={Math.max(barSpacing * 0.7, 0.5)}
                    height={Math.max(h, 1)}
                    fill={track.color}
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Label */}
        <div className="absolute top-0 left-1.5 text-[9px] font-medium text-white truncate leading-4 z-10 drop-shadow-sm pointer-events-none"
          style={{ right: totalVersions > 1 ? '52px' : '6px' }}
        >
          {clip.prompt || '(no prompt)'}
        </div>

        {/* Version navigation — only visible when multiple versions exist */}
        {totalVersions > 1 && (
          <div
            className="absolute top-0 right-0.5 flex items-center gap-0.5 z-20"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setActiveVersion(clip.id, activeVersionIdx - 1); }}
              disabled={activeVersionIdx <= 0}
              className="text-[8px] text-white/80 hover:text-white disabled:opacity-30 px-0.5 leading-4 transition-opacity"
              title="Previous version"
            >
              ◀
            </button>
            <span className="text-[8px] text-white/70 font-mono leading-4">
              {activeVersionIdx + 1}/{totalVersions}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveVersion(clip.id, activeVersionIdx + 1); }}
              disabled={activeVersionIdx >= totalVersions - 1}
              className="text-[8px] text-white/80 hover:text-white disabled:opacity-30 px-0.5 leading-4 transition-opacity"
              title="Next version"
            >
              ▶
            </button>
          </div>
        )}

        {/* Status indicator */}
        {clip.generationStatus === 'generating' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {clip.generationStatus === 'error' && (
          <div className="absolute bottom-0 left-1.5 text-[8px] text-red-300 truncate pointer-events-none">
            Error
          </div>
        )}
        {clip.generationStatus === 'ready' && clip.inferredMetas && (
          <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-400 truncate pointer-events-none">
            {[
              clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
              clip.inferredMetas.keyScale || null,
            ].filter(Boolean).join(' | ')}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { closeCtxMenu(); setEditingClip(clip.id); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onRegenerate={() => { closeCtxMenu(); regenerateClip(clip.id); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onDelete={() => { closeCtxMenu(); removeClip(clip.id); }}
          onAddLayer={() => { closeCtxMenu(); setAddLayerOpen(true); }}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
          isReady={clip.generationStatus === 'ready'}
        />
      )}

      {/* AddLayerModal — opened from clip context menu "Add Layer here" */}
      {addLayerOpen && (
        <AddLayerModal
          trackId={track.id}
          startTime={clip.startTime}
          duration={clip.duration}
          contextWindow={contextWindow}
          onClose={() => setAddLayerOpen(false)}
        />
      )}
    </>
  );
}

function ClipContextMenu({
  x, y, onEdit, onGenerate, onRegenerate, onDuplicate, onDelete, onAddLayer, onClose, hasPrompt, isReady,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLayer: () => void;
  onClose: () => void;
  hasPrompt: boolean;
  isReady: boolean;
}) {
  const clampedX = Math.min(x, window.innerWidth - 200);
  const clampedY = Math.min(y, window.innerHeight - 240);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-daw-surface border border-daw-border rounded shadow-xl py-1 min-w-[180px]"
        style={{ left: clampedX, top: clampedY }}
      >
        <button
          onClick={onEdit}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
        >
          Edit Clip
        </button>
        {isReady ? (
          <button
            onClick={onRegenerate}
            disabled={!hasPrompt}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed"
          >
            Re-generate
          </button>
        ) : (
          <button
            onClick={onGenerate}
            disabled={!hasPrompt}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed"
          >
            Generate
          </button>
        )}
        <button
          onClick={onDuplicate}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
        >
          Duplicate
        </button>
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={onAddLayer}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-daw-surface-2 transition-colors"
        >
          Add Layer here…
        </button>
        <div className="my-1 border-t border-daw-border" />
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </>
  );
}

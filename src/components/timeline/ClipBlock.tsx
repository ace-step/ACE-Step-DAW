import { useRef, useCallback, useState, useEffect } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
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

interface DragGhostInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  targetTrackId: string | null;
  targetLaneRect: { top: number; height: number } | null;
  sourceLaneRect: { top: number; height: number } | null;
  isShiftCopy?: boolean;
}

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setCoverModal = useUIStore((s) => s.setCoverModal);
  const setRepaintModal = useUIStore((s) => s.setRepaintModal);

  // Track generating progress for this clip to show in the status overlay
  const generatingProgress = useGenerationStore((s) => {
    const job = s.jobs.find(
      (j) => j.clipId === clip.id && (j.status === 'generating' || j.status === 'queued' || j.status === 'processing'),
    );
    return job?.progress ?? null;
  });
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const batchDuplicateClips = useProjectStore((s) => s.batchDuplicateClips);
  const batchMoveClips = useProjectStore((s) => s.batchMoveClips);
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);
  const project = useProjectStore((s) => s.project);
  const { generateClip } = useGeneration();
  const isMidiClip = Boolean(clip.midiData);

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhostInfo | null>(null);

  // Listen for external "edit clip" signal (keyboard shortcut E)
  const editingClipId = useUIStore((s) => s.editingClipId);
  useEffect(() => {
    if (editingClipId === clip.id) {
      setEditModalOpen(true);
      setEditingClip(null);
    }
  }, [editingClipId, clip.id, setEditingClip]);

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

  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const duplicateClipToTrack = useProjectStore((s) => s.duplicateClipToTrack);
  const clipBlockRef = useRef<HTMLDivElement>(null);

  const findClosestLane = useCallback((clientY: number): { trackId: string; rect: DOMRect } | null => {
    const lanes = document.querySelectorAll<HTMLElement>('[data-track-id]');
    let best: { trackId: string; rect: DOMRect; dist: number } | null = null;
    for (const lane of lanes) {
      const r = lane.getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      const dist = Math.abs(clientY - centerY);
      if (!best || dist < best.dist) {
        best = { trackId: lane.dataset.trackId!, rect: r, dist };
      }
    }
    return best ? { trackId: best.trackId, rect: best.rect } : null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const mode = getDragMode(e);
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origAudioOffset = clip.audioOffset ?? 0;
    const origAudioDuration = clip.audioDuration ?? clip.duration;
    const bpm = project?.bpm ?? 120;
    const totalDuration = project?.totalDuration ?? 600;
    dragRef.current = false;
    let isShiftCopy = e.shiftKey;

    const isMultiSelected = selectedClipIds.size > 1 && selectedClipIds.has(clip.id);
    let lastBatchOffset = 0;

    const clipW = clip.duration * pixelsPerSecond;
    const clipH = clipBlockRef.current?.offsetHeight ?? 48;
    const clipRect = clipBlockRef.current?.getBoundingClientRect();
    const clickOffsetPx = clipRect ? startX - clipRect.left : 0;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && !dragRef.current) return;
      dragRef.current = true;
      isShiftCopy = ev.shiftKey;

      const deltaSec = dx / pixelsPerSecond;

      if (mode === 'move') {
        if (isShiftCopy) {
          if (isMultiSelected && lastBatchOffset !== 0) {
            batchMoveClips([...selectedClipIds], -lastBatchOffset);
            lastBatchOffset = 0;
          } else {
            updateClip(clip.id, { startTime: origStart });
          }
        } else {
          const isFineMove = ev.metaKey || ev.ctrlKey;
          let newStart = isFineMove
            ? Math.round((origStart + deltaSec) * 100) / 100
            : snapToGrid(origStart + deltaSec, bpm, 1);
          newStart = Math.max(0, Math.min(newStart, totalDuration - origDuration));
          const timeOffset = newStart - origStart;

          if (isMultiSelected) {
            const delta = timeOffset - lastBatchOffset;
            if (delta !== 0) {
              batchMoveClips([...selectedClipIds], delta);
              lastBatchOffset = timeOffset;
            }
          } else {
            updateClip(clip.id, { startTime: newStart });
          }
        }

        const closest = findClosestLane(ev.clientY);
        if (closest) {
          const ghostLeftVp = ev.clientX - clickOffsetPx;
          const sourceLane = findClosestLane(startY);
          const isCrossingTrack = closest.trackId !== track.id;
          setDragGhost({
            x: ghostLeftVp,
            y: closest.rect.top + 4,
            width: clipW,
            height: clipH,
            targetTrackId: (isCrossingTrack || isShiftCopy) ? closest.trackId : null,
            targetLaneRect: (isCrossingTrack || isShiftCopy)
              ? { top: closest.rect.top, height: closest.rect.height }
              : null,
            sourceLaneRect: (isCrossingTrack || isShiftCopy) && sourceLane
              ? { top: sourceLane.rect.top, height: sourceLane.rect.height }
              : null,
            isShiftCopy,
          });
        }
      } else if (mode === 'resize-left') {
        let newStart = snapToGrid(origStart + deltaSec, bpm, 1);
        newStart = Math.max(0, newStart);
        const maxStart = origStart + origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);

        const shift = newStart - origStart;
        let newAudioOffset = origAudioOffset + shift;

        if (newAudioOffset < 0) {
          newAudioOffset = 0;
          newStart = origStart - origAudioOffset;
        }
        if (newAudioOffset > origAudioDuration - MIN_CLIP_DURATION) {
          newAudioOffset = origAudioDuration - MIN_CLIP_DURATION;
          newStart = origStart + (newAudioOffset - origAudioOffset);
        }

        const newDuration = origDuration + (origStart - newStart);
        updateClip(clip.id, { startTime: newStart, duration: newDuration, audioOffset: newAudioOffset });
      } else {
        let newDuration = snapToGrid(origDuration + deltaSec, bpm, 1);
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration);
        newDuration = Math.min(newDuration, totalDuration - origStart);
        updateClip(clip.id, { duration: newDuration });
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setDragGhost(null);

      if (mode === 'move' && dragRef.current) {
        const closest = findClosestLane(ev.clientY);
        const deltaSec = (ev.clientX - startX) / pixelsPerSecond;
        const isFineMove = ev.metaKey || ev.ctrlKey;
        const dropStart = Math.max(0, isFineMove
          ? Math.round((origStart + deltaSec) * 100) / 100
          : snapToGrid(origStart + deltaSec, bpm, 1));

        if (ev.shiftKey && closest) {
          if (isMultiSelected && lastBatchOffset !== 0) {
            batchMoveClips([...selectedClipIds], -lastBatchOffset);
            lastBatchOffset = 0;
          } else {
            updateClip(clip.id, { startTime: origStart });
          }
          const timeOffset = dropStart - origStart;
          if (isMultiSelected) {
            batchDuplicateClips([...selectedClipIds], timeOffset);
          } else {
            duplicateClipToTrack(clip.id, closest.trackId, dropStart);
          }
        } else if (closest && closest.trackId !== track.id && !isMultiSelected) {
          moveClipToTrack(clip.id, closest.trackId);
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [clip.id, clip.startTime, clip.duration, clip.audioOffset, clip.audioDuration, pixelsPerSecond, project, updateClip, getDragMode, track.id, moveClipToTrack, duplicateClipToTrack, batchDuplicateClips, batchMoveClips, selectedClipIds, findClosestLane]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    setCtxMenu(null);
    selectClip(clip.id, e.metaKey || e.ctrlKey);
  }, [clip.id, selectClip]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current) return;
    if (isMidiClip) {
      setOpenPianoRoll(track.id, clip.id);
      return;
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [isMidiClip, setOpenPianoRoll, track.id, clip.id]);

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

  // Waveform: render at fixed density so trimming/extending never stretches the waveform
  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const peakWidthPx = width - 4;

  // Fixed pixels-per-peak: each peak sample always maps to the same width
  const pxPerPeak = peaks && peaks.length > 0 && audioDuration > 0
    ? (audioDuration * pixelsPerSecond) / peaks.length
    : 2;
  // Minimum bar width of 2px
  const barWidth = Math.max(pxPerPeak * 0.7, 0.5);
  const barSpacing = Math.max(pxPerPeak, 1);

  // Which peak indices are visible in this clip window
  const startPeakIdx = peaks ? Math.floor((audioOffset / audioDuration) * peaks.length) : 0;
  const visibleAudioSec = Math.min(clip.duration, Math.max(0, audioDuration - audioOffset));
  const endPeakIdx = peaks ? Math.min(
    Math.ceil(((audioOffset + visibleAudioSec) / audioDuration) * peaks.length),
    peaks.length,
  ) : 0;
  const visiblePeakCount = endPeakIdx - startPeakIdx;
  const numBars = Math.max(0, visiblePeakCount);
  const audioWidthPx = numBars * barSpacing;

  return (
    <>
      <div
        ref={clipBlockRef}
        className={`absolute top-1 bottom-1 rounded-md select-none overflow-hidden
          ${statusStyles[clip.generationStatus] ?? ''}
          ${isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent' : ''}
          ${dragGhost && dragGhost.targetTrackId && !dragGhost.isShiftCopy ? 'opacity-0' : ''}
        `}
        style={{
          left,
          width: Math.max(width, 4),
          background: `linear-gradient(180deg, ${hexToRgba(track.color, 0.45)} 0%, ${hexToRgba(track.color, 0.28)} 100%)`,
          borderLeft: `3px solid ${track.color}`,
          boxShadow: isSelected ? '0 0 10px rgba(0, 122, 255, 0.45), inset 0 0 0 1px rgba(0, 122, 255, 0.3)' : 'none',
          ...(isSelected ? { '--tw-ring-color': 'rgba(0, 122, 255, 0.85)' } as React.CSSProperties : {}),
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

        {/* Waveform — fixed density, only in audio-backed region */}
        {peaks && numBars > 0 && audioWidthPx > 0 && (
          <div className="absolute inset-0 flex items-center overflow-hidden">
            <svg
              width={audioWidthPx}
              height="100%"
              viewBox={`0 0 ${audioWidthPx} 100`}
              preserveAspectRatio="none"
              className="opacity-60 ml-0.5"
            >
              {Array.from({ length: numBars }, (_, i) => {
                const peakIdx = Math.min(startPeakIdx + i, peaks.length - 1);
                const peak = peaks[peakIdx];
                const h = peak * 80;
                return (
                  <rect
                    key={i}
                    x={i * barSpacing}
                    y={50 - h / 2}
                    width={barWidth}
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
          style={{ right: totalVersions >= 1 ? '52px' : '6px' }}
        >
          {isMidiClip ? `${clip.midiData?.notes.length ?? 0} notes` : (clip.prompt || '(no prompt)')}
        </div>

        {/* Version navigation — visible whenever at least one version exists */}
        {totalVersions >= 1 && (
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
              onClick={(e) => {
                e.stopPropagation();
                if (activeVersionIdx < totalVersions - 1) {
                  setActiveVersion(clip.id, activeVersionIdx + 1);
                } else {
                  regenerateClip(clip.id);
                }
              }}
              disabled={clip.generationStatus === 'generating' || clip.generationStatus === 'queued'}
              className="text-[8px] text-white/80 hover:text-white disabled:opacity-30 px-0.5 leading-4 transition-opacity"
              title={activeVersionIdx >= totalVersions - 1 ? 'Generate new version' : 'Next version'}
            >
              {clip.generationStatus === 'generating' || clip.generationStatus === 'queued'
                ? <span className="inline-block w-2 h-2 border border-white/80 border-t-transparent rounded-full animate-spin" />
                : '▶'}
            </button>
          </div>
        )}

        {/* Status overlay — spinner + progress text during generation */}
        {generatingProgress && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/30 rounded-md">
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mb-0.5" />
            <span className="text-[8px] text-white/90 font-medium text-center px-1 leading-tight max-w-full truncate">
              {generatingProgress}
            </span>
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
        {isMidiClip && (
          <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-300/80 truncate pointer-events-none">
            MIDI clip • double-click to edit
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { closeCtxMenu(); setEditModalOpen(true); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onRegenerate={() => { closeCtxMenu(); regenerateClip(clip.id); }}
          onOpenMidi={() => { closeCtxMenu(); setOpenPianoRoll(track.id, clip.id); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onDelete={() => { closeCtxMenu(); removeClip(clip.id); }}
          onAddLayer={() => { closeCtxMenu(); setAddLayerOpen(true); }}
          onCreateCover={() => {
            closeCtxMenu();
            setCoverModal(clip.id);
          }}
          onRepaint={() => {
            closeCtxMenu();
            // Compute repaint range from selectWindow if it overlaps this clip
            let range: { start: number; end: number } | null = null;
            if (selectWindow) {
              const rs = Math.max(selectWindow.startTime, clip.startTime);
              const re = Math.min(selectWindow.endTime, clip.startTime + clip.duration);
              if (re > rs) range = { start: rs, end: re };
            }
            setRepaintModal(clip.id, range);
          }}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
          isReady={clip.generationStatus === 'ready'}
          isMidiClip={isMidiClip}
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

      {/* Edit Clip — unified modal in edit mode */}
      {editModalOpen && (
        <AddLayerModal
          trackId={track.id}
          startTime={clip.startTime}
          duration={clip.duration}
          contextWindow={contextWindow}
          clipId={clip.id}
          onClose={() => setEditModalOpen(false)}
        />
      )}

      {/* Cross-track drag ghost + target lane highlight */}
      {dragGhost && dragGhost.targetTrackId && (
        <>
          {/* Source lane placeholder (dashed outline showing where clip came from) */}
          {dragGhost.sourceLaneRect && (
            <div
              className="fixed pointer-events-none z-[98]"
              style={{
                left: left,
                top: dragGhost.sourceLaneRect.top + 4,
                width,
                height: dragGhost.sourceLaneRect.height - 8,
                border: `1.5px dashed ${hexToRgba(track.color, 0.4)}`,
                borderRadius: 2,
                backgroundColor: hexToRgba(track.color, dragGhost.isShiftCopy ? 0.15 : 0.04),
              }}
            />
          )}

          {/* Lane-aligned ghost — visually mirrors the original clip at target lane size */}
          <div
            className="fixed pointer-events-none z-[100] rounded-sm overflow-hidden"
            style={{
              left: dragGhost.x,
              top: dragGhost.y,
              width: dragGhost.width,
              height: dragGhost.targetLaneRect
                ? dragGhost.targetLaneRect.height - 8
                : dragGhost.height,
              backgroundColor: hexToRgba(track.color, 0.45),
              borderLeft: `2px solid ${track.color}`,
              boxShadow: `0 4px 20px ${hexToRgba(track.color, 0.3)}, 0 0 0 1px ${hexToRgba(track.color, 0.5)}`,
              transition: 'top 80ms ease-out',
            }}
          >
            {/* Mini waveform inside ghost */}
            {peaks && numBars > 0 && audioWidthPx > 0 && (
              <div className="absolute inset-0 flex items-center overflow-hidden">
                <svg
                  width={audioWidthPx}
                  height="100%"
                  viewBox={`0 0 ${audioWidthPx} 100`}
                  preserveAspectRatio="none"
                  className="opacity-50 ml-0.5"
                >
                  {Array.from({ length: numBars }, (_, i) => {
                    const peakIdx = Math.min(startPeakIdx + i, peaks.length - 1);
                    const peak = peaks[peakIdx];
                    const h = peak * 80;
                    return (
                      <rect
                        key={i}
                        x={i * barSpacing}
                        y={50 - h / 2}
                        width={barWidth}
                        height={Math.max(h, 1)}
                        fill={track.color}
                      />
                    );
                  })}
                </svg>
              </div>
            )}
            <div className="absolute top-0 left-1.5 right-1.5 text-[9px] font-medium text-white truncate leading-4 z-10 drop-shadow-sm">
              {clip.prompt || track.displayName}
            </div>
            {/* Copy badge when Shift is held */}
            {dragGhost.isShiftCopy && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow z-20">
                +
              </div>
            )}
          </div>

          {/* Target lane highlight */}
          {dragGhost.targetLaneRect && (
            <div
              className="fixed pointer-events-none z-[99]"
              style={{
                left: 0,
                top: dragGhost.targetLaneRect.top,
                width: '100vw',
                height: dragGhost.targetLaneRect.height,
                backgroundColor: hexToRgba(track.color, 0.06),
                borderTop: `1px solid ${hexToRgba(track.color, 0.35)}`,
                borderBottom: `1px solid ${hexToRgba(track.color, 0.35)}`,
                transition: 'top 80ms ease-out',
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function ClipContextMenu({
  x, y,
  onEdit, onGenerate, onRegenerate, onOpenMidi,
  onDuplicate, onDelete, onAddLayer,
  onCreateCover, onRepaint,
  onClose,
  hasPrompt, isReady, isMidiClip,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenMidi: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLayer: () => void;
  onCreateCover: () => void;
  onRepaint: () => void;
  onClose: () => void;
  hasPrompt: boolean;
  isReady: boolean;
  isMidiClip: boolean;
}) {
  const clampedX = Math.min(x, window.innerWidth - 210);
  const clampedY = Math.min(y, window.innerHeight - 300);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[190px] backdrop-blur-sm"
        style={{ left: clampedX, top: clampedY }}
      >
        <button onClick={onEdit} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
          Edit Clip
        </button>
        {isMidiClip ? (
          <button onClick={onOpenMidi} className="w-full text-left px-3 py-1.5 text-[11px] text-violet-200 hover:bg-daw-accent hover:text-white transition-colors">
            Open Piano Roll
          </button>
        ) : isReady ? (
          <button onClick={onRegenerate} disabled={!hasPrompt} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed">
            Regenerate
          </button>
        ) : (
          <button onClick={onGenerate} disabled={!hasPrompt} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed">
            Generate
          </button>
        )}

        {!isMidiClip && isReady && (
          <>
            <button onClick={onCreateCover} className="w-full text-left px-3 py-1.5 text-[11px] text-amber-300 hover:bg-daw-accent hover:text-white transition-colors">
              Create Cover…
            </button>
            <button onClick={onRepaint} className="w-full text-left px-3 py-1.5 text-[11px] text-rose-300 hover:bg-daw-accent hover:text-white transition-colors">
              Repaint Selection…
            </button>
          </>
        )}

        <div className="my-1 border-t border-[#555]" />
        <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
          Duplicate
        </button>
        {!isMidiClip && (
          <button onClick={onAddLayer} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
            Add Layer here…
          </button>
        )}
        <div className="my-1 border-t border-[#555]" />
        <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-600 hover:text-white transition-colors">
          Delete
        </button>
      </div>
    </>
  );
}

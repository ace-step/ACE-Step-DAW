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
import { ClipContextMenu } from './ClipContextMenu';
import { ClipWaveform, ClipMidiThumbnail } from './ClipWaveform';
import { ClipGainEnvelope } from './ClipGainEnvelope';
import { ClipStatusOverlay } from './ClipStatusOverlay';
import { FADE_HANDLE_KEYBOARD_STEP, getClipFadeBounds } from '../../utils/clipFade';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

const EDGE_HANDLE_PX = 6;
const FADE_HANDLE_HIT_TARGET_PX = 14;
const MIN_CLIP_DURATION = 0.5;

type DragMode = 'move' | 'resize-left' | 'resize-right' | 'slip';

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
  const setVocal2BGMModal = useUIStore((s) => s.setVocal2BGMModal);
  const setAnalysisPanel = useUIStore((s) => s.setAnalysisPanel);
  const setStemSeparationModal = useUIStore((s) => s.setStemSeparationModal);

  const generatingProgress = useGenerationStore((s) => {
    const job = [...s.jobs].reverse().find(
      (j) => j.clipId === clip.id && (j.status === 'generating' || j.status === 'queued' || j.status === 'processing'),
    );
    return job?.progress ?? null;
  });
  const updateClip = useProjectStore((s) => s.updateClip);
  const setClipFade = useProjectStore((s) => s.setClipFade);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const consolidateClips = useProjectStore((s) => s.consolidateClips);
  const convertAudioToMidi = useProjectStore((s) => s.convertAudioToMidi);
  const createQuickSamplerFromClip = useProjectStore((s) => s.createQuickSamplerFromClip);
  const exportMidiClip = useProjectStore((s) => s.exportMidiClip);
  const batchDuplicateClips = useProjectStore((s) => s.batchDuplicateClips);
  const batchMoveClips = useProjectStore((s) => s.batchMoveClips);
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);
  const project = useProjectStore((s) => s.project);
  const { generateClip } = useGeneration();
  const isMidiClip = Boolean(clip.midiData);
  const hasAudioBody = Boolean(clip.isolatedAudioKey || clip.cumulativeMixKey || clip.waveformPeaks);

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhostInfo | null>(null);

  const editingClipId = useUIStore((s) => s.editingClipId);
  useEffect(() => {
    if (editingClipId === clip.id) {
      setEditModalOpen(true);
      setEditingClip(null);
    }
  }, [editingClipId, clip.id, setEditingClip]);

  const versions = clip.versions ?? [];
  const activeVersionIdx = clip.activeVersionIdx ?? (versions.length > 0 ? versions.length - 1 : -1);
  const totalVersions = versions.length;

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isSelected = selectedClipIds.has(clip.id);
  const { fadeInDuration, fadeOutDuration } = getClipFadeBounds(clip);
  const fadeInWidth = Math.min(width, fadeInDuration * pixelsPerSecond);
  const fadeOutWidth = Math.min(width, fadeOutDuration * pixelsPerSecond);

  const dragRef = useRef(false);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const getDragMode = useCallback((e: React.MouseEvent): DragMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX <= EDGE_HANDLE_PX) return 'resize-left';
    if (relX >= rect.width - EDGE_HANDLE_PX) return 'resize-right';
    if (e.altKey) return 'slip';
    return 'move';
  }, []);

  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const duplicateClipToTrack = useProjectStore((s) => s.duplicateClipToTrack);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
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
      if (!dragRef.current) beginDrag();
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
      } else if (mode === 'slip') {
        const maxOffset = Math.max(0, origAudioDuration - origDuration);
        if (maxOffset > 0) {
          const newOffset = Math.max(0, Math.min(origAudioOffset + deltaSec, maxOffset));
          updateClip(clip.id, { audioOffset: newOffset });
        }
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
      endDrag();

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
  }, [clip.id, clip.startTime, clip.duration, clip.audioOffset, clip.audioDuration, pixelsPerSecond, project, updateClip, getDragMode, track.id, moveClipToTrack, duplicateClipToTrack, batchDuplicateClips, batchMoveClips, selectedClipIds, findClosestLane, beginDrag, endDrag]);

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
      el.style.cursor = e.altKey ? 'ew-resize' : 'grab';
    }
  }, []);

  const updateFadeFromPointer = useCallback((edge: 'in' | 'out', clientX: number) => {
    const rect = clipBlockRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (edge === 'in') {
      const nextFade = Math.max(0, Math.min((clientX - rect.left) / pixelsPerSecond, clip.duration));
      setClipFade(clip.id, { fadeInDuration: nextFade });
      return;
    }

    const nextFade = Math.max(0, Math.min((rect.right - clientX) / pixelsPerSecond, clip.duration));
    setClipFade(clip.id, { fadeOutDuration: nextFade });
  }, [clip.duration, clip.id, pixelsPerSecond, setClipFade]);

  const handleFadeMouseDown = useCallback((edge: 'in' | 'out') => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    beginDrag();
    updateFadeFromPointer(edge, e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      updateFadeFromPointer(edge, ev.clientX);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      endDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [beginDrag, endDrag, updateFadeFromPointer]);

  const handleFadeKeyDown = useCallback((edge: 'in' | 'out') => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const growKey = edge === 'in' ? 'ArrowRight' : 'ArrowLeft';
    const shrinkKey = edge === 'in' ? 'ArrowLeft' : 'ArrowRight';

    if (e.key === 'Home') {
      e.preventDefault();
      setClipFade(clip.id, edge === 'in' ? { fadeInDuration: 0 } : { fadeOutDuration: 0 });
      return;
    }

    if (e.key !== growKey && e.key !== shrinkKey) return;

    e.preventDefault();
    const delta = (e.shiftKey ? FADE_HANDLE_KEYBOARD_STEP * 5 : FADE_HANDLE_KEYBOARD_STEP) * (e.key === growKey ? 1 : -1);
    if (edge === 'in') {
      setClipFade(clip.id, { fadeInDuration: fadeInDuration + delta });
      return;
    }
    setClipFade(clip.id, { fadeOutDuration: fadeOutDuration + delta });
  }, [clip.id, fadeInDuration, fadeOutDuration, setClipFade]);

  const handleFadeReset = useCallback((edge: 'in' | 'out') => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setClipFade(clip.id, edge === 'in' ? { fadeInDuration: 0 } : { fadeOutDuration: 0 });
  }, [clip.id, setClipFade]);

  const statusStyles: Record<string, string> = {
    empty: 'opacity-60',
    queued: 'opacity-70',
    generating: 'opacity-80 animate-pulse',
    processing: 'opacity-80 animate-pulse',
    ready: '',
    error: 'opacity-60',
    stale: 'opacity-50',
  };

  const peaks = clip.waveformPeaks;
  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const selectedActionClipIds = selectedClipIds.has(clip.id) ? [...selectedClipIds] : [clip.id];
  const selectedActionClips = selectedActionClipIds
    .map((clipId) => project?.tracks.flatMap((candidate) => candidate.clips).find((candidate) => candidate.id === clipId))
    .filter((candidate): candidate is Clip => Boolean(candidate));
  const canConsolidate = selectedActionClips.length === selectedActionClipIds.length
    && selectedActionClips.every((candidate) => candidate.trackId === track.id)
    && new Set(selectedActionClips.map((candidate) => Boolean(candidate.midiData))).size <= 1;

  const handleConsolidate = async () => {
    const consolidatedClip = await consolidateClips(track.id, selectedActionClipIds);
    closeCtxMenu();
    if (consolidatedClip) {
      selectClip(consolidatedClip.id, false);
    }
  };

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
        data-clip-id={clip.id}
        data-testid={`clip-${clip.id}`}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMoveLocal}
        onContextMenu={handleContextMenu}
      >
        <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-col-resize z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-10" />

        <ClipWaveform
          peaks={peaks}
          audioDuration={audioDuration}
          audioOffset={audioOffset}
          clipDuration={clip.duration}
          width={width}
          color={track.color}
        />

        {!isMidiClip && hasAudioBody && (
          <>
            {fadeInWidth > 0 && (
              <div
                className="absolute inset-y-0 left-0 pointer-events-none"
                style={{
                  width: fadeInWidth,
                  background: 'linear-gradient(90deg, rgba(10, 12, 18, 0.72) 0%, rgba(10, 12, 18, 0.18) 100%)',
                  clipPath: 'polygon(0 100%, 0 0, 100% 100%)',
                }}
              />
            )}
            {fadeOutWidth > 0 && (
              <div
                className="absolute inset-y-0 right-0 pointer-events-none"
                style={{
                  width: fadeOutWidth,
                  background: 'linear-gradient(270deg, rgba(10, 12, 18, 0.72) 0%, rgba(10, 12, 18, 0.18) 100%)',
                  clipPath: 'polygon(0 100%, 100% 0, 100% 100%)',
                }}
              />
            )}
            <button
              type="button"
              role="slider"
              aria-label={`Fade in handle for clip ${clip.id}`}
              aria-valuemin={0}
              aria-valuemax={clip.duration}
              aria-valuenow={fadeInDuration}
              className="absolute top-1 bottom-1 z-20 rounded-full border border-white/40 bg-black/55 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-sky-400"
              style={{
                left: Math.max(EDGE_HANDLE_PX, fadeInWidth - FADE_HANDLE_HIT_TARGET_PX / 2),
                width: FADE_HANDLE_HIT_TARGET_PX,
              }}
              data-fade-handle="in"
              onMouseDown={handleFadeMouseDown('in')}
              onKeyDown={handleFadeKeyDown('in')}
              onDoubleClick={handleFadeReset('in')}
            >
              <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/80" />
            </button>
            <button
              type="button"
              role="slider"
              aria-label={`Fade out handle for clip ${clip.id}`}
              aria-valuemin={0}
              aria-valuemax={clip.duration}
              aria-valuenow={fadeOutDuration}
              className="absolute top-1 bottom-1 z-20 rounded-full border border-white/40 bg-black/55 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-sky-400"
              style={{
                left: Math.max(EDGE_HANDLE_PX, width - fadeOutWidth - FADE_HANDLE_HIT_TARGET_PX / 2),
                width: FADE_HANDLE_HIT_TARGET_PX,
              }}
              data-fade-handle="out"
              onMouseDown={handleFadeMouseDown('out')}
              onKeyDown={handleFadeKeyDown('out')}
              onDoubleClick={handleFadeReset('out')}
            >
              <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/80" />
            </button>
          </>
        )}

        {clip.gainEnvelope && clip.gainEnvelope.length > 0 && (
          <ClipGainEnvelope
            clipId={clip.id}
            clipDuration={clip.duration}
            width={width}
            gainEnvelope={clip.gainEnvelope}
            color={track.color}
          />
        )}

        {isMidiClip && clip.midiData && (
          <ClipMidiThumbnail
            midiData={clip.midiData}
            width={width}
            duration={clip.duration}
            bpm={project?.bpm ?? 120}
            color={track.color}
          />
        )}

        <div className="absolute top-0 left-1.5 text-[9px] font-medium text-white truncate leading-4 z-10 drop-shadow-sm pointer-events-none"
          style={{ right: totalVersions >= 1 ? '52px' : '6px' }}
        >
          {isMidiClip ? `${clip.midiData?.notes.length ?? 0} notes` : (clip.prompt || '(no prompt)')}
        </div>

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

        <ClipStatusOverlay clip={clip} generatingProgress={generatingProgress} isMidiClip={isMidiClip} />
      </div>

      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { closeCtxMenu(); setEditModalOpen(true); }}
          onGenerate={() => { closeCtxMenu(); generateClip(clip.id); }}
          onRegenerate={() => { closeCtxMenu(); regenerateClip(clip.id); }}
          onOpenMidi={() => { closeCtxMenu(); setOpenPianoRoll(track.id, clip.id); }}
          onExportMidi={() => { closeCtxMenu(); exportMidiClip(clip.id); }}
          onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
          onConsolidate={() => { void handleConsolidate(); }}
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
          onVocal2BGM={() => {
            closeCtxMenu();
            setVocal2BGMModal(clip.id);
          }}
          onAnalyze={() => {
            closeCtxMenu();
            setAnalysisPanel(clip.id);
          }}
          onSeparateStems={() => {
            closeCtxMenu();
            setStemSeparationModal(clip.id);
          }}
          onConvertToMidi={() => {
            closeCtxMenu();
            convertAudioToMidi(clip.id);
          }}
          onCreateQuickSampler={() => {
            closeCtxMenu();
            const samplerTrack = createQuickSamplerFromClip(track.id, clip.id);
            if (samplerTrack) {
              useUIStore.getState().setOpenPianoRoll(samplerTrack.id);
            }
          }}
          onClose={closeCtxMenu}
          hasPrompt={!!clip.prompt}
          isReady={clip.generationStatus === 'ready'}
          isMidiClip={isMidiClip}
          isVocalTrack={track.trackName === 'vocals' || track.trackName === 'backing_vocals'}
          hasAudio={!!(clip.isolatedAudioKey || clip.cumulativeMixKey)}
          canConsolidate={canConsolidate}
        />
      )}

      {addLayerOpen && (
        <AddLayerModal
          trackId={track.id}
          startTime={clip.startTime}
          duration={clip.duration}
          contextWindow={contextWindow}
          onClose={() => setAddLayerOpen(false)}
        />
      )}

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

      {dragGhost && dragGhost.targetTrackId && (
        <>
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
            <ClipWaveform
              peaks={peaks}
              audioDuration={audioDuration}
              audioOffset={audioOffset}
              clipDuration={clip.duration}
              width={width}
              color={track.color}
              opacityClassName="opacity-50"
            />
            <div className="absolute top-0 left-1.5 right-1.5 text-[9px] font-medium text-white truncate leading-4 z-10 drop-shadow-sm">
              {clip.prompt || track.displayName}
            </div>
            {dragGhost.isShiftCopy && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow z-20">
                +
              </div>
            )}
          </div>

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

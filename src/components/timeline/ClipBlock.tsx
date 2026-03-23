import { useRef, useCallback, useState, useEffect } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useTransportStore } from '../../store/transportStore';
import { useGeneration } from '../../hooks/useGeneration';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { hexToRgba } from '../../utils/color';
import { snapToGrid } from '../../utils/time';
import { Z } from '../../utils/zIndex';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import {
  CLIP_WAVEFORM_PEAK_COUNT,
  getClipAudibleSourceEnd,
  getClipContentOffset,
  getClipSourceSpan,
} from '../../utils/clipAudio';
import { AddLayerModal } from '../generation/AddLayerModal';
import { regenerateClip } from '../../services/generationPipeline';
import { ClipContextMenu } from './ClipContextMenu';
import { ClipWaveform, ClipMidiThumbnail } from './ClipWaveform';
import { ClipGainEnvelope } from './ClipGainEnvelope';
import { ClipWarpMarkers } from './ClipWarpMarkers';
import { ClipStatusOverlay } from './ClipStatusOverlay';
import { FADE_HANDLE_KEYBOARD_STEP, getClipFadeBounds } from '../../utils/clipFade';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

const EDGE_HANDLE_PX = 16;
const FADE_HANDLE_HIT_TARGET_PX = 14;
const MIN_CLIP_DURATION = 0.5;
const CLIP_DRAG_EPSILON = 0.0001;
const HEADER_RAIL_HEIGHT_PX = 20;

const waveformUpgradeInFlight = new Set<string>();

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

interface ClipPresentation {
  waveformColor: string;
  titleColor: string;
  metaColor: string;
  headerBackground: string;
  bodyBackground: string;
  bodyBorderColor: string;
  containerShadow: string;
  selectionRingColor: string;
}

function getClipPresentation(clipColor: string, isSelected: boolean): ClipPresentation {
  if (isSelected) {
    return {
      waveformColor: '#16181f',
      titleColor: '#181b22',
      metaColor: 'rgba(24, 27, 34, 0.72)',
      headerBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.96)} 0%, ${hexToRgba(clipColor, 0.88)} 100%)`,
      bodyBackground: 'linear-gradient(180deg, rgba(253, 251, 246, 0.98) 0%, rgba(244, 238, 228, 0.96) 100%)',
      bodyBorderColor: 'rgba(255, 255, 255, 0.92)',
      containerShadow: '0 0 0 1px rgba(255,255,255,0.96), 0 14px 28px rgba(0,0,0,0.22)',
      selectionRingColor: 'rgba(255,255,255,0.96)',
    };
  }

  return {
    waveformColor: '#1a1d26',
    titleColor: '#18161a',
    metaColor: 'rgba(24, 22, 26, 0.7)',
    headerBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.96)} 0%, ${hexToRgba(clipColor, 0.9)} 100%)`,
    bodyBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.56)} 0%, ${hexToRgba(clipColor, 0.42)} 100%)`,
    bodyBorderColor: hexToRgba(clipColor, 0.34),
    containerShadow: '0 8px 18px rgba(0,0,0,0.14)',
    selectionRingColor: hexToRgba(clipColor, 0.42),
  };
}

export function ClipBlock({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setRepaintModal = useUIStore((s) => s.setRepaintModal);
  const setVocal2BGMModal = useUIStore((s) => s.setVocal2BGMModal);
  const setAnalysisPanel = useUIStore((s) => s.setAnalysisPanel);
  const setStemSeparationModal = useUIStore((s) => s.setStemSeparationModal);
  const setAudioToMidiModal = useUIStore((s) => s.setAudioToMidiModal);

  const generatingProgress = useGenerationStore((s) => {
    const job = [...s.jobs].reverse().find(
      (j) => j.clipId === clip.id && (j.status === 'generating' || j.status === 'queued' || j.status === 'processing'),
    );
    if (!job) return null;
    if (job.progressPercent != null) {
      return `${job.stage ?? job.progress} ${Math.round(job.progressPercent)}%`;
    }
    return job.stage ?? job.progress;
  });
  const updateClip = useProjectStore((s) => s.updateClip);
  const setClipFade = useProjectStore((s) => s.setClipFade);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const consolidateClips = useProjectStore((s) => s.consolidateClips);
  const snapClipEdgeToZeroCrossing = useProjectStore((s) => s.snapClipEdgeToZeroCrossing);
  const createQuickSamplerFromClip = useProjectStore((s) => s.createQuickSamplerFromClip);
  const applyAudioQuantize = useProjectStore((s) => s.applyAudioQuantize);
  const clearAudioQuantize = useProjectStore((s) => s.clearAudioQuantize);
  const exportMidiClip = useProjectStore((s) => s.exportMidiClip);
  const sliceClipToRange = useProjectStore((s) => s.sliceClipToRange);
  const splitClipAtZeroCrossing = useProjectStore((s) => s.splitClipAtZeroCrossing);
  const batchDuplicateClips = useProjectStore((s) => s.batchDuplicateClips);
  const batchMoveClips = useProjectStore((s) => s.batchMoveClips);
  const updateClipColors = useProjectStore((s) => s.updateClipColors);
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);
  const project = useProjectStore((s) => s.project);
  const { generateClip } = useGeneration();
  const isMidiClip = Boolean(clip.midiData);
  const hasAudioBody = Boolean(clip.isolatedAudioKey || clip.cumulativeMixKey || clip.waveformPeaks);

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhostInfo | null>(null);
  const [scissorLine, setScissorLine] = useState<number | null>(null);
  const [rangePreview, setRangePreview] = useState<{ left: number; width: number } | null>(null);
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<'left' | 'right' | null>(null);
  const [hoverSeekX, setHoverSeekX] = useState<number | null>(null);
  const scissorRef = useRef(false);
  const suppressContextMenuRef = useRef(false);
  const rangePreviewCommittedRef = useRef(false);

  // Cleanup cursor on unmount if scissor mode was active
  useEffect(() => {
    return () => {
      if (scissorRef.current) document.body.style.cursor = '';
      if (/(?:^|-)resize$/.test(document.body.style.cursor)) document.body.style.cursor = '';
      if (/(?:^|-)resize$/.test(document.documentElement.style.cursor)) document.documentElement.style.cursor = '';
    };
  }, []);

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

  useEffect(() => {
    if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) return;
    if (clip.waveformPeaks && clip.waveformPeaks.length >= CLIP_WAVEFORM_PEAK_COUNT) return;
    if (waveformUpgradeInFlight.has(clip.id)) return;

    let cancelled = false;
    waveformUpgradeInFlight.add(clip.id);

    void (async () => {
      try {
        const blob = await loadAudioBlobByKey(clip.isolatedAudioKey!);
        if (!blob || cancelled) return;

        const buffer = await getAudioEngine().decodeAudioData(blob);
        if (cancelled) return;

        const upgradedPeaks = computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT);
        useProjectStore.setState((state) => {
          if (!state.project) return state;
          return {
            ...state,
            project: {
              ...state.project,
              updatedAt: Date.now(),
              tracks: state.project.tracks.map((candidate) => ({
                ...candidate,
                clips: candidate.clips.map((candidateClip) => (
                  candidateClip.id === clip.id
                    ? {
                        ...candidateClip,
                        waveformPeaks: upgradedPeaks,
                        audioDuration: candidateClip.audioDuration ?? buffer.duration,
                      }
                    : candidateClip
                )),
              })),
            },
          };
        });
      } catch {
        // Keep the existing waveform if the upgrade pass fails.
      } finally {
        waveformUpgradeInFlight.delete(clip.id);
      }
    })();

    return () => {
      cancelled = true;
      waveformUpgradeInFlight.delete(clip.id);
    };
  }, [clip.audioDuration, clip.generationStatus, clip.id, clip.isolatedAudioKey, clip.waveformPeaks]);

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isClipSelected = selectedClipIds.has(clip.id);
  const isSelected = isClipSelected;
  const { fadeInDuration, fadeOutDuration } = getClipFadeBounds(clip);
  const fadeInWidth = Math.min(width, fadeInDuration * pixelsPerSecond);
  const fadeOutWidth = Math.min(width, fadeOutDuration * pixelsPerSecond);
  const showFadeInHandle = fadeInDuration > 0;
  const showFadeOutHandle = fadeOutDuration > 0;
  const clipColor = clip.color ?? track.color;
  const clipPresentation = getClipPresentation(clipColor, isSelected);

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
  const undo = useProjectStore((s) => s.undo);
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
    // Skip scissor tool on fade handles
    if ((e.target as HTMLElement).closest('[data-fade-handle]')) return;
    const isSecondaryPress = e.button === 2 || (e.button === 0 && e.ctrlKey);
    if (e.button !== 0 && !isSecondaryPress) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const isHeaderRailTarget = relY <= HEADER_RAIL_HEIGHT_PX
      || Boolean((e.target as HTMLElement).closest('[data-clip-header-rail="true"]'));

    const mode = getDragMode(e);
    const canStartPrimaryDrag = mode === 'resize-left'
      || mode === 'resize-right'
      || (isHeaderRailTarget && (mode === 'move' || mode === 'slip'));
    const canStartSecondaryGesture = isSecondaryPress && mode === 'move';

    if (!isSecondaryPress && !canStartPrimaryDrag && mode === 'move') {
      e.stopPropagation();
      e.preventDefault();

      const clipRect = clipBlockRef.current?.getBoundingClientRect();
      if (!clipRect) return;

      const startRelX = Math.max(0, Math.min(e.clientX - clipRect.left, clipRect.width));
      let didDrag = false;

      const updatePreview = (clientX: number) => {
        const currentRelX = Math.max(0, Math.min(clientX - clipRect.left, clipRect.width));
        const leftPx = Math.min(startRelX, currentRelX);
        const widthPx = Math.abs(currentRelX - startRelX);
        setRangePreview(widthPx > 0 ? { left: leftPx, width: widthPx } : null);
        return { leftPx, widthPx };
      };

      const onMouseMove = (ev: MouseEvent) => {
        const { widthPx } = updatePreview(ev.clientX);
        if (widthPx >= 3) {
          didDrag = true;
        }
      };

      const onMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const { leftPx, widthPx } = updatePreview(ev.clientX);
        setRangePreview(null);

        if (!didDrag || widthPx < 3) {
          return;
        }

        rangePreviewCommittedRef.current = true;

        const previewStartTime = clip.startTime + (leftPx / pixelsPerSecond);
        const previewEndTime = clip.startTime + ((leftPx + widthPx) / pixelsPerSecond);

        void sliceClipToRange(clip.id, previewStartTime, previewEndTime).then((selectedClipId) => {
          if (!selectedClipId) return;
          selectClip(selectedClipId, false);
          useUIStore.getState().selectTrack(track.id, false);
        });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    if (!canStartPrimaryDrag && !canStartSecondaryGesture) {
      return;
    }

    e.stopPropagation();
    if (e.button === 0) {
      e.preventDefault();
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origAudioOffset = clip.audioOffset ?? 0;
    const origAudioDuration = clip.audioDuration ?? clip.duration;
    const origContentOffset = getClipContentOffset(clip);
    const origTimeStretchRate = clip.timeStretchRate;
    const origStretchMode = clip.stretchMode;
    const origSourceSpan = getClipSourceSpan(clip);
    const origAudibleSourceEnd = getClipAudibleSourceEnd(clip);
    const bpm = project?.bpm ?? 120;
    const totalDuration = project?.totalDuration ?? 600;
    dragRef.current = false;
    scissorRef.current = false;
    let isShiftCopy = e.shiftKey;

    const isMultiSelected = selectedClipIds.size > 1 && selectedClipIds.has(clip.id);
    let lastBatchOffset = 0;

    const clipW = clip.duration * pixelsPerSecond;
    const clipH = clipBlockRef.current?.offsetHeight ?? 48;
    const clipRect = clipBlockRef.current?.getBoundingClientRect();
    const clickOffsetPx = clipRect ? startX - clipRect.left : 0;
    const supportsScissor = clip.generationStatus === 'ready' || Boolean(clip.midiData);
    const canStartLongPressScissor = supportsScissor && isSecondaryPress && mode === 'move';
    let secondaryMoved = false;

    // --- Long-press scissor detection (secondary press only) ---
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    if (mode === 'move' && canStartLongPressScissor) {
      e.preventDefault();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        scissorRef.current = true;
        suppressContextMenuRef.current = true;
        // Calculate initial scissor line position
        if (clipRect) {
          const relX = startX - clipRect.left;
          const splitTime = origStart + relX / pixelsPerSecond;
          const snapped = e.altKey ? splitTime : snapToGrid(splitTime, bpm, 1);
          const snappedPx = (snapped - origStart) * pixelsPerSecond;
          setScissorLine(Math.max(0, Math.min(snappedPx, clipW)));
        }
        // Override cursor
        document.body.style.cursor = 'crosshair';
      }, 300);
    }

    const onMouseMove = (ev: MouseEvent) => {
      // If in scissor mode, just update the split line position
      if (scissorRef.current) {
        const liveRect = clipBlockRef.current?.getBoundingClientRect();
        if (!liveRect) return;
        const relX = ev.clientX - liveRect.left;
        const splitTime = origStart + relX / pixelsPerSecond;
        const snapped = ev.altKey ? splitTime : snapToGrid(splitTime, bpm, 1);
        const snappedPx = (snapped - origStart) * pixelsPerSecond;
        setScissorLine(Math.max(0, Math.min(snappedPx, clipW)));
        return;
      }
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (isSecondaryPress && (Math.abs(dx) >= 3 || Math.abs(dy) >= 3)) {
        secondaryMoved = true;
      }
      if (isSecondaryPress && !scissorRef.current) {
        if (Math.abs(dx) >= 3 || Math.abs(dy) >= 3) {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        }
        return;
      }
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && !dragRef.current) return;
      // Cancel long-press timer once real drag starts
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (!dragRef.current) beginDrag();
      dragRef.current = true;
      isShiftCopy = ev.shiftKey;

      const deltaSec = dx / pixelsPerSecond;

      if (mode === 'move') {
        document.body.style.cursor = isShiftCopy ? 'copy' : 'grabbing';
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
        let newStart = ev.altKey ? origStart + deltaSec : snapToGrid(origStart + deltaSec, bpm, 1);
        newStart = Math.max(0, newStart);
        const maxStart = origStart + origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);

        const newDuration = origDuration + (origStart - newStart);
        if (ev.shiftKey) {
          updateClip(clip.id, {
            startTime: newStart,
            duration: newDuration,
            contentOffset: undefined,
            timeStretchRate: Math.max(CLIP_DRAG_EPSILON, origSourceSpan / newDuration),
            stretchMode: 'repitch',
          });
          return;
        }

        if (newStart < origStart) {
          const extension = origStart - newStart;
          updateClip(clip.id, {
            startTime: newStart,
            duration: newDuration,
            contentOffset: origContentOffset + extension,
            timeStretchRate: undefined,
            stretchMode: undefined,
          });
          return;
        }

        const trimAmount = newStart - origStart;
        const silenceTrim = Math.min(origContentOffset, trimAmount);
        const audioTrim = trimAmount - silenceTrim;
        updateClip(clip.id, {
          startTime: newStart,
          duration: newDuration,
          contentOffset: Math.max(0, origContentOffset - silenceTrim) || undefined,
          audioOffset: Math.min(origAudioDuration, origAudioOffset + audioTrim),
          timeStretchRate: undefined,
          stretchMode: undefined,
        });
      } else if (mode === 'slip') {
        document.body.style.cursor = 'ew-resize';
        const maxOffset = Math.max(0, origAudioDuration - origDuration);
        if (maxOffset > 0) {
          const newOffset = Math.max(0, Math.min(origAudioOffset + deltaSec, maxOffset));
          updateClip(clip.id, { audioOffset: newOffset });
        }
      } else {
        let newDuration = ev.altKey ? origDuration + deltaSec : snapToGrid(origDuration + deltaSec, bpm, 1);
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration);
        newDuration = Math.min(newDuration, totalDuration - origStart);
        if (ev.shiftKey) {
          updateClip(clip.id, {
            duration: newDuration,
            contentOffset: undefined,
            timeStretchRate: Math.max(CLIP_DRAG_EPSILON, origSourceSpan / newDuration),
            stretchMode: 'repitch',
          });
          return;
        }
        updateClip(clip.id, {
          duration: newDuration,
          contentOffset: Math.min(origContentOffset, newDuration) || undefined,
          timeStretchRate: undefined,
          stretchMode: undefined,
        });
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      // Cancel scissor mode
      if (scissorRef.current) {
        scissorRef.current = false;
        setScissorLine(null);
        document.body.style.cursor = '';
        return;
      }
      setDragGhost(null);
      document.body.style.cursor = '';
      if (dragRef.current) {
        // Restore original state for multi-select batch moves
        if (isMultiSelected && lastBatchOffset !== 0) {
          batchMoveClips([...selectedClipIds], -lastBatchOffset);
        } else if (mode === 'move') {
          updateClip(clip.id, { startTime: origStart });
        } else if (mode === 'resize-left') {
          updateClip(clip.id, {
            startTime: origStart,
            duration: origDuration,
            audioOffset: origAudioOffset,
            contentOffset: origContentOffset || undefined,
            timeStretchRate: origTimeStretchRate,
            stretchMode: origStretchMode,
          });
        } else if (mode === 'resize-right') {
          updateClip(clip.id, {
            duration: origDuration,
            contentOffset: origContentOffset || undefined,
            timeStretchRate: origTimeStretchRate,
            stretchMode: origStretchMode,
          });
        } else if (mode === 'slip') {
          updateClip(clip.id, { audioOffset: origAudioOffset });
        }
        endDrag();
        undo();
      }
      dragRef.current = false;
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      // Execute scissor split
      if (scissorRef.current) {
        scissorRef.current = false;
        setScissorLine(null);
        document.body.style.cursor = '';
        const liveRect = clipBlockRef.current?.getBoundingClientRect();
        if (!liveRect) return;
        const relX = ev.clientX - liveRect.left;
        const splitTime = origStart + relX / pixelsPerSecond;
        const snapped = ev.altKey ? splitTime : snapToGrid(splitTime, bpm, 1);
        // Only split if within clip bounds (not at edges)
        if (snapped > origStart + 0.01 && snapped < origStart + origDuration - 0.01) {
          void splitClipAtZeroCrossing(clip.id, snapped);
        }
        return;
      }

      if (isSecondaryPress) {
        if (!secondaryMoved && !suppressContextMenuRef.current) {
          setCtxMenu({ x: ev.clientX, y: ev.clientY });
        }
        suppressContextMenuRef.current = false;
        return;
      }

      setDragGhost(null);
      endDrag();
      document.body.style.cursor = '';

      if ((mode === 'resize-left' || mode === 'resize-right') && dragRef.current && !ev.shiftKey) {
        const currentClip = useProjectStore.getState().getClipById(clip.id);
        if (currentClip) {
          if (mode === 'resize-left') {
            const trimmedAudioLeft = (currentClip.audioOffset ?? 0) > origAudioOffset + CLIP_DRAG_EPSILON;
            if (trimmedAudioLeft) {
              void snapClipEdgeToZeroCrossing(clip.id, 'left');
            }
          } else {
            const trimmedAudioRight = getClipAudibleSourceEnd(currentClip) < origAudibleSourceEnd - CLIP_DRAG_EPSILON;
            if (trimmedAudioRight) {
              void snapClipEdgeToZeroCrossing(clip.id, 'right');
            }
          }
        }
      }

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
    window.addEventListener('keydown', onKeyDown);
  }, [clip, pixelsPerSecond, project, updateClip, getDragMode, track.id, moveClipToTrack, duplicateClipToTrack, batchDuplicateClips, batchMoveClips, selectedClipIds, findClosestLane, beginDrag, endDrag, undo, snapClipEdgeToZeroCrossing, sliceClipToRange, splitClipAtZeroCrossing, selectClip]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current || rangePreviewCommittedRef.current) {
      rangePreviewCommittedRef.current = false;
      return;
    }
    setCtxMenu(null);
    const isMultiSelect = e.metaKey || e.ctrlKey;
    selectClip(clip.id, isMultiSelect);
    useUIStore.getState().selectTrack(track.id, isMultiSelect);
    if (!isMultiSelect) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const clickTime = clip.startTime + relX / pixelsPerSecond;
      useTransportStore.getState().seek(clickTime);
    }
  }, [clip.id, clip.startTime, track.id, selectClip, pixelsPerSecond]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current || rangePreviewCommittedRef.current) {
      rangePreviewCommittedRef.current = false;
      return;
    }
    if (isMidiClip) {
      setOpenPianoRoll(track.id, clip.id);
      return;
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [isMidiClip, setOpenPianoRoll, track.id, clip.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const setResizeCursor = useCallback((cursor: 'w-resize' | 'e-resize' | null) => {
    const nextCursor = cursor ?? '';
    if (clipBlockRef.current) {
      clipBlockRef.current.style.cursor = nextCursor;
    }
    document.body.style.cursor = nextCursor;
    document.documentElement.style.cursor = nextCursor;
  }, []);

  const syncHoverState = useCallback((clientX: number, clientY: number, altKey: boolean, currentTarget: HTMLElement) => {
    const rect = currentTarget.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    if (relX <= EDGE_HANDLE_PX || relX >= rect.width - EDGE_HANDLE_PX) {
      const edge = relX <= EDGE_HANDLE_PX ? 'left' : 'right';
      const cursor = edge === 'left' ? 'w-resize' : 'e-resize';
      setHoveredResizeEdge(edge);
      setHoverSeekX(null);
      setResizeCursor(cursor);
      currentTarget.style.cursor = cursor;
    } else {
      setHoveredResizeEdge(null);
      setResizeCursor(null);
      if (relY <= HEADER_RAIL_HEIGHT_PX) {
        setHoverSeekX(null);
        currentTarget.style.cursor = altKey ? 'ew-resize' : 'grab';
      } else {
        setHoverSeekX(relX);
        currentTarget.style.cursor = '';
      }
    }
  }, [setResizeCursor]);

  const handleMouseEnterLocal = useCallback((e: React.MouseEvent) => {
    syncHoverState(e.clientX, e.clientY, e.altKey, e.currentTarget as HTMLElement);
  }, [syncHoverState]);

  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    syncHoverState(e.clientX, e.clientY, e.altKey, e.currentTarget as HTMLElement);
  }, [syncHoverState]);

  const handleMouseLeaveLocal = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    setHoveredResizeEdge(null);
    setHoverSeekX(null);
    el.style.cursor = '';
    setResizeCursor(null);
  }, [setResizeCursor]);

  const handleResizeHandleEnter = useCallback((edge: 'left' | 'right') => () => {
    setHoveredResizeEdge(edge);
    setResizeCursor(edge === 'left' ? 'w-resize' : 'e-resize');
  }, [setResizeCursor]);

  const handleResizeHandleLeave = useCallback(() => {
    setHoveredResizeEdge(null);
    setResizeCursor(null);
  }, [setResizeCursor]);

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
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      endDrag();
      undo();
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      endDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }, [beginDrag, endDrag, undo, updateFadeFromPointer]);

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
  const contentOffset = getClipContentOffset(clip);
  const selectedActionClipIds = selectedClipIds.has(clip.id) ? [...selectedClipIds] : [clip.id];
  const selectedActionClips = selectedActionClipIds
    .map((clipId) => project?.tracks.flatMap((candidate) => candidate.clips).find((candidate) => candidate.id === clipId))
    .filter((candidate): candidate is Clip => Boolean(candidate));
  const canConsolidate = selectedActionClips.length === selectedActionClipIds.length
    && selectedActionClips.every((candidate) => candidate.trackId === track.id)
    && new Set(selectedActionClips.map((candidate) => Boolean(candidate.midiData))).size <= 1;
  const hasCustomColor = selectedActionClips.some((candidate) => Boolean(candidate.color));

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
          transition-[filter,box-shadow] duration-100
          hover:brightness-110 hover:ring-1 hover:ring-white/10
          active:brightness-95
          ${clip.muted ? 'opacity-40' : (statusStyles[clip.generationStatus] ?? '')}
          ${isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent' : ''}
          ${dragGhost && dragGhost.targetTrackId && !dragGhost.isShiftCopy ? 'opacity-0' : ''}
        `}
        style={{
          left,
          width: Math.max(width, 4),
          boxShadow: clipPresentation.containerShadow,
          ...(isSelected ? { '--tw-ring-color': clipPresentation.selectionRingColor } as React.CSSProperties : {}),
        }}
        data-clip-block
        data-clip-id={clip.id}
        data-testid={`clip-${clip.id}`}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnterLocal}
        onMouseMove={handleMouseMoveLocal}
        onMouseLeave={handleMouseLeaveLocal}
        onContextMenu={handleContextMenu}
        >
        <div
          data-clip-header-rail="true"
          data-testid="clip-header-rail"
          aria-label={`Move clip ${clip.id}`}
          className="absolute left-0 right-0 top-0 z-[6] flex items-center rounded-t-md border-b px-2"
          style={{
            height: HEADER_RAIL_HEIGHT_PX,
            background: clipPresentation.headerBackground,
            borderBottomColor: hexToRgba(clipColor, 0.38),
          }}
        />

        <div
          className="absolute left-0 right-0 bottom-0 rounded-b-md overflow-hidden"
          data-testid="clip-body-surface"
          style={{
            top: HEADER_RAIL_HEIGHT_PX,
            background: clipPresentation.bodyBackground,
            borderTop: `1px solid ${hexToRgba(clipColor, 0.08)}`,
            borderBottom: `1px solid ${clipPresentation.bodyBorderColor}`,
          }}
        />

        <div
          className="absolute top-0 bottom-0 left-0 w-[16px] cursor-w-resize z-10 group/resize-left"
          data-testid="resize-handle-left"
          style={{ cursor: 'w-resize' }}
          onMouseEnter={handleResizeHandleEnter('left')}
          onMouseLeave={handleResizeHandleLeave}
        >
          <div
            className="absolute inset-y-0 left-0 w-full transition-colors duration-100 pointer-events-none"
            style={{ background: hoveredResizeEdge === 'left' ? 'linear-gradient(90deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)' : 'transparent' }}
            data-testid="resize-hover-zone-left"
          />
          <div
            className="absolute top-0 bottom-0 left-0 w-[2px] transition-colors duration-100 pointer-events-none"
            style={{ backgroundColor: hoveredResizeEdge === 'left' ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0)' }}
            data-testid="resize-indicator-left"
          />
        </div>
        <div
          className="absolute top-0 bottom-0 right-0 w-[16px] cursor-e-resize z-10 group/resize-right"
          data-testid="resize-handle-right"
          style={{ cursor: 'e-resize' }}
          onMouseEnter={handleResizeHandleEnter('right')}
          onMouseLeave={handleResizeHandleLeave}
        >
          <div
            className="absolute inset-y-0 right-0 w-full transition-colors duration-100 pointer-events-none"
            style={{ background: hoveredResizeEdge === 'right' ? 'linear-gradient(270deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)' : 'transparent' }}
            data-testid="resize-hover-zone-right"
          />
          <div
            className="absolute top-0 bottom-0 right-0 w-[2px] transition-colors duration-100 pointer-events-none"
            style={{ backgroundColor: hoveredResizeEdge === 'right' ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0)' }}
            data-testid="resize-indicator-right"
          />
        </div>

        {/* Color strip — overlay instead of borderLeft to avoid shifting waveform content */}
        <div
          className="absolute top-0 bottom-0 left-0 w-[3px] rounded-l-md z-[5] pointer-events-none"
          style={{ backgroundColor: clipColor }}
        />

        <div
          className="absolute left-0 right-0 bottom-0 overflow-hidden"
          style={{ top: HEADER_RAIL_HEIGHT_PX }}
        >
          <ClipWaveform
            peaks={peaks}
            audioDuration={audioDuration}
            audioOffset={audioOffset}
            clipDuration={clip.duration}
            contentOffset={contentOffset}
            timeStretchRate={clip.timeStretchRate}
            stretchMode={clip.stretchMode}
            width={width}
            color={clipPresentation.waveformColor}
            opacityClassName={isSelected ? 'opacity-95' : 'opacity-90'}
          />
        </div>

        {!isMidiClip && hasAudioBody && (
          <>
            {fadeInWidth > 0 && (
              <div
                className="absolute left-0 bottom-0 pointer-events-none"
                data-testid="fade-in-overlay"
                style={{
                  top: HEADER_RAIL_HEIGHT_PX,
                  width: fadeInWidth,
                  background: 'linear-gradient(90deg, rgba(10, 12, 18, 0.35) 0%, rgba(10, 12, 18, 0.05) 100%)',
                  clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                }}
              />
            )}
            {fadeOutWidth > 0 && (
              <div
                className="absolute bottom-0 right-0 pointer-events-none"
                data-testid="fade-out-overlay"
                style={{
                  top: HEADER_RAIL_HEIGHT_PX,
                  width: fadeOutWidth,
                  background: 'linear-gradient(270deg, rgba(10, 12, 18, 0.35) 0%, rgba(10, 12, 18, 0.05) 100%)',
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
                }}
              />
            )}
            {showFadeInHandle && (
              <button
                type="button"
                role="slider"
                aria-label={`Fade in handle for clip ${clip.id}`}
                aria-valuemin={0}
                aria-valuemax={clip.duration}
                aria-valuenow={fadeInDuration}
                className="absolute z-20 rounded-full border border-white/40 bg-black/55 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-sky-400"
                style={{
                  top: HEADER_RAIL_HEIGHT_PX + 1,
                  bottom: 1,
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
            )}
            {showFadeOutHandle && (
              <button
                type="button"
                role="slider"
                aria-label={`Fade out handle for clip ${clip.id}`}
                aria-valuemin={0}
                aria-valuemax={clip.duration}
                aria-valuenow={fadeOutDuration}
                className="absolute z-20 rounded-full border border-white/40 bg-black/55 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-sky-400"
                style={{
                  top: HEADER_RAIL_HEIGHT_PX + 1,
                  bottom: 1,
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
            )}
          </>
        )}

        {clip.gainEnvelope && clip.gainEnvelope.length > 0 && (
          <ClipGainEnvelope
            clipId={clip.id}
            clipDuration={clip.duration}
            width={width}
            gainEnvelope={clip.gainEnvelope}
            color={clipColor}
          />
        )}

        {clip.warpMarkers && clip.warpMarkers.length > 0 && (
          <ClipWarpMarkers
            clipId={clip.id}
            clipDuration={clip.duration}
            width={width}
            markers={clip.warpMarkers}
          />
        )}

        {isMidiClip && clip.midiData && (
          <ClipMidiThumbnail
            midiData={clip.midiData}
            width={width}
            duration={clip.duration}
            bpm={project?.bpm ?? 120}
            color={clipPresentation.waveformColor}
          />
        )}

        <div
          className="absolute left-1.5 text-[10px] font-medium truncate leading-4 z-10 pointer-events-none"
          style={{
            top: 1,
            right: totalVersions >= 1 ? '52px' : '6px',
            color: clipPresentation.titleColor,
          }}
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
              className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
              style={{ color: clipPresentation.metaColor }}
              title="Previous version"
            >
              ◀
            </button>
            <span className="text-[8px] font-mono leading-4" style={{ color: clipPresentation.metaColor }}>
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
              className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
              style={{ color: clipPresentation.metaColor }}
              title={activeVersionIdx >= totalVersions - 1 ? 'Generate new version' : 'Next version'}
            >
              {clip.generationStatus === 'generating' || clip.generationStatus === 'queued'
                ? <span className="inline-block w-2 h-2 border border-white/80 border-t-transparent rounded-full animate-spin" />
                : '▶'}
            </button>
          </div>
        )}

        <ClipStatusOverlay clip={clip} generatingProgress={generatingProgress} isMidiClip={isMidiClip} />

        {clip.muted && (
          <div
            className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center"
            data-testid="clip-muted-overlay"
            style={{ background: 'rgba(0, 0, 0, 0.45)' }}
          >
            <span className="text-[9px] font-bold tracking-wider text-zinc-400 uppercase opacity-80">Muted</span>
          </div>
        )}

        {hoverSeekX !== null && (
          <div
            className="absolute bottom-0 pointer-events-none z-20"
            data-testid="hover-seek-line"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: hoverSeekX,
              width: 1,
              background: 'rgba(255, 255, 255, 0.18)',
              boxShadow: '0 0 3px rgba(255, 255, 255, 0.10), 0 0 8px rgba(255, 255, 255, 0.05)',
            }}
          />
        )}

        {scissorLine !== null && (
          <div
            className="absolute bottom-0 w-px pointer-events-none z-30"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: scissorLine,
              background: 'rgba(250, 204, 21, 0.9)',
              boxShadow: '0 0 4px rgba(250, 204, 21, 0.5)',
            }}
          >
            <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] border-2 border-yellow-400 bg-zinc-900 rounded-full" />
          </div>
        )}

        {rangePreview && (
          <div
            className="absolute bottom-0 pointer-events-none z-20"
            data-testid="clip-range-preview"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: rangePreview.left,
              width: rangePreview.width,
              background: 'rgba(255, 255, 255, 0.26)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)',
            }}
          />
        )}
      </div>

      {ctxMenu && (() => {
        const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
        const isReady = clip.generationStatus === 'ready';
        const isVocalTrack = track.trackName === 'vocals' || track.trackName === 'backing_vocals';
        const hasWarpMarkers = !!(clip.warpMarkers && clip.warpMarkers.length > 0);

        const clipAIContext = (!isMidiClip && isReady) ? {
          onRegenerate: () => { closeCtxMenu(); regenerateClip(clip.id); },
          hasPrompt: !!clip.prompt,
          isReady,
          onCreateCover: () => { closeCtxMenu(); useUIStore.getState().setMusicEnhancerOpen(true); },
          onRepaint: () => {
            closeCtxMenu();
            let range: { start: number; end: number } | null = null;
            if (selectWindow) {
              const rs = Math.max(selectWindow.startTime, clip.startTime);
              const re = Math.min(selectWindow.endTime, clip.startTime + clip.duration);
              if (re > rs) range = { start: rs, end: re };
            }
            setRepaintModal(clip.id, range);
          },
          ...(hasAudio ? { onSeparateStems: () => { closeCtxMenu(); setStemSeparationModal(clip.id); } } : {}),
          ...(isVocalTrack ? { onGenerateAccompaniment: () => { closeCtxMenu(); setVocal2BGMModal(clip.id); } } : {}),
          onAnalyze: () => { closeCtxMenu(); setAnalysisPanel(clip.id); },
          ...(hasAudio ? {
            onConvertToMidi: () => { closeCtxMenu(); setAudioToMidiModal(clip.id); },
            onCreateQuickSampler: () => {
              closeCtxMenu();
              const samplerTrack = createQuickSamplerFromClip(track.id, clip.id);
              if (samplerTrack) useUIStore.getState().setOpenPianoRoll(samplerTrack.id);
            },
            onQuantizeAudio: () => { closeCtxMenu(); applyAudioQuantize(clip.id); },
            ...(hasWarpMarkers ? { onClearAudioQuantize: () => { closeCtxMenu(); clearAudioQuantize(clip.id); } } : {}),
          } : {}),
        } : undefined;

        return (
          <ClipContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={closeCtxMenu}
            onInspireMe={() => { closeCtxMenu(); useUIStore.getState().setShowGenerationPanel(true); }}
            onAddLayer={() => { closeCtxMenu(); useUIStore.getState().setAddLayerOpen(true); }}
            onMusicEnhancer={() => { closeCtxMenu(); useUIStore.getState().setMusicEnhancerOpen(true); }}
            clipAIContext={clipAIContext}
            onOpenMidi={isMidiClip ? () => { closeCtxMenu(); setOpenPianoRoll(track.id, clip.id); } : undefined}
            onExportMidi={isMidiClip ? () => { closeCtxMenu(); exportMidiClip(clip.id); } : undefined}
            onEdit={() => { closeCtxMenu(); setEditModalOpen(true); }}
            onDuplicate={() => { closeCtxMenu(); duplicateClip(clip.id); }}
            onSplitAtPlayhead={() => {
              closeCtxMenu();
              const currentTime = useTransportStore.getState().currentTime;
              if (currentTime > clip.startTime + 0.01 && currentTime < clip.startTime + clip.duration - 0.01) {
                void splitClipAtZeroCrossing(clip.id, currentTime);
              }
            }}
            onConsolidate={() => { void handleConsolidate(); }}
            onDelete={() => { closeCtxMenu(); removeClip(clip.id); }}
            onSelectAll={() => {
              closeCtxMenu();
              const p = useProjectStore.getState().project;
              if (p) {
                const allClipIds = p.tracks.flatMap((t) => t.clips.map((c) => c.id));
                useUIStore.getState().selectClips(allClipIds);
              }
            }}
            onLoopSelection={() => {
              closeCtxMenu();
              const sw = useUIStore.getState().selectWindow;
              if (sw) {
                useTransportStore.getState().setLoopRegion(sw.startTime, sw.endTime);
                if (!useTransportStore.getState().loopEnabled) {
                  useTransportStore.getState().toggleLoop();
                }
              }
            }}
            onToggleMute={() => {
              closeCtxMenu();
              useProjectStore.getState().toggleClipMuted(selectedActionClipIds);
            }}
            isMuted={selectedActionClipIds.length > 1
              ? selectedActionClipIds.every((id) => {
                  const c = project?.tracks.flatMap((t) => t.clips).find((cl) => cl.id === id);
                  return c?.muted;
                })
              : !!clip.muted
            }
            onAssignColor={(color) => { closeCtxMenu(); updateClipColors(selectedActionClipIds, color); }}
            onResetColor={() => { closeCtxMenu(); updateClipColors(selectedActionClipIds, undefined); }}
            hasCustomColor={hasCustomColor}
            canConsolidate={canConsolidate}
            isMidiClip={isMidiClip}
          />
        );
      })()}

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
              className="fixed pointer-events-none"
              data-layer="drag-ghost-source"
              style={{
                zIndex: Z.dragGhost,
                left: left,
                top: dragGhost.sourceLaneRect.top + 4,
                width,
                height: dragGhost.sourceLaneRect.height - 8,
                border: `1.5px dashed ${hexToRgba(clipColor, 0.4)}`,
                borderRadius: 2,
                backgroundColor: hexToRgba(clipColor, dragGhost.isShiftCopy ? 0.15 : 0.04),
              }}
            />
          )}

          <div
            className="fixed pointer-events-none rounded-sm overflow-hidden"
            style={{
              zIndex: Z.tooltip,
              left: dragGhost.x,
              top: dragGhost.y,
              width: dragGhost.width,
              height: dragGhost.targetLaneRect
                ? dragGhost.targetLaneRect.height - 8
                : dragGhost.height,
              background: clipPresentation.bodyBackground,
              borderLeft: `2px solid ${clipColor}`,
              boxShadow: `0 4px 20px ${hexToRgba(clipColor, 0.3)}, 0 0 0 1px ${clipPresentation.bodyBorderColor}`,
              transition: 'top 80ms ease-out',
            }}
          >
            <div
              className="absolute left-0 right-0 top-0"
              style={{
                height: HEADER_RAIL_HEIGHT_PX,
                background: clipPresentation.headerBackground,
                borderBottom: `1px solid ${hexToRgba(clipColor, 0.38)}`,
              }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 overflow-hidden"
              style={{ top: HEADER_RAIL_HEIGHT_PX }}
            >
              <ClipWaveform
                peaks={peaks}
                audioDuration={audioDuration}
                audioOffset={audioOffset}
                clipDuration={clip.duration}
                contentOffset={contentOffset}
                timeStretchRate={clip.timeStretchRate}
                stretchMode={clip.stretchMode}
                width={width}
                color={clipPresentation.waveformColor}
                opacityClassName="opacity-85"
              />
            </div>
            <div
              className="absolute left-1.5 right-1.5 text-[10px] font-medium truncate leading-4 z-10"
              style={{ top: 1, color: clipPresentation.titleColor }}
            >
              {clip.prompt || track.displayName}
            </div>
            {dragGhost.isShiftCopy && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow z-20">
                +
              </div>
            )}
          </div>

          {dragGhost.targetLaneRect && (
            <div
              className="fixed pointer-events-none"
              style={{
                zIndex: Z.dragGhost + 1,
                left: 0,
                top: dragGhost.targetLaneRect.top,
                width: '100vw',
                height: dragGhost.targetLaneRect.height,
                backgroundColor: hexToRgba(clipColor, 0.06),
                borderTop: `1px solid ${hexToRgba(clipColor, 0.35)}`,
                borderBottom: `1px solid ${hexToRgba(clipColor, 0.35)}`,
                transition: 'top 80ms ease-out',
              }}
            />
          )}
        </>
      )}
    </>
  );
}

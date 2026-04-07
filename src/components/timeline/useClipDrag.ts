import { useRef, useCallback } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { snapToGrid } from '../../utils/time';
import {
  getClipAudibleSourceEnd,
  getClipContentOffset,
  getClipSourceSpan,
} from '../../utils/clipAudio';
import { ARRANGEMENT_EMPTY_TRACK_ID_PREFIX, parseArrangementEmptyTrackSlotIndex } from '../arrangement/trackSlotLayout';
import { getAudioEngine } from '../../hooks/useAudioEngine';

export type DragMode = 'move' | 'resize-left' | 'resize-right' | 'slip';

export interface DragGhostInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  targetTrackId: string | null;
  targetLaneRect: { top: number; height: number } | null;
  sourceLaneRect: { top: number; height: number } | null;
  isShiftCopy?: boolean;
  /** Whether the current drop target is valid (false when hovering outside lanes or on group tracks). */
  isValidDrop?: boolean;
}

export const EDGE_HANDLE_PX = 16;
const MIN_CLIP_DURATION = 0.5;
const CLIP_DRAG_EPSILON = 0.0001;
export const HEADER_RAIL_HEIGHT_PX = 20;

interface UseClipDragParams {
  clip: Clip;
  track: Track;
  clipBlockRef: React.RefObject<HTMLDivElement | null>;
  pixelsPerSecond: number;
  bpm: number;
  totalDuration: number;
  onDragGhostChange: (ghost: DragGhostInfo | null) => void;
  onGhostLanding: () => void;
  onScissorLineChange: (line: number | null) => void;
  onRangePreviewChange: (preview: { left: number; width: number } | null) => void;
  onCtxMenuChange: (pos: { x: number; y: number } | null) => void;
}

export function useClipDrag({
  clip,
  track,
  clipBlockRef,
  pixelsPerSecond,
  bpm,
  totalDuration,
  onDragGhostChange,
  onGhostLanding,
  onScissorLineChange,
  onRangePreviewChange,
  onCtxMenuChange,
}: UseClipDragParams) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack);
  const duplicateClipToTrack = useProjectStore((s) => s.duplicateClipToTrack);
  const addTrack = useProjectStore((s) => s.addTrack);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);
  const snapClipEdgeToZeroCrossing = useProjectStore((s) => s.snapClipEdgeToZeroCrossing);
  const splitClipAtZeroCrossing = useProjectStore((s) => s.splitClipAtZeroCrossing);
  const batchDuplicateClips = useProjectStore((s) => s.batchDuplicateClips);
  const batchMoveClips = useProjectStore((s) => s.batchMoveClips);
  const sliceClipToRange = useProjectStore((s) => s.sliceClipToRange);
  const selectClip = useUIStore((s) => s.selectClip);

  const dragRef = useRef(false);
  const scissorRef = useRef(false);
  const suppressContextMenuRef = useRef(false);
  const rangePreviewCommittedRef = useRef(false);

  const getDragMode = useCallback((e: React.MouseEvent): DragMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    // Shift+edge drag = time-stretch from full clip height, with wider edge zone (32px)
    if (e.shiftKey) {
      const stretchEdgePx = 32;
      if (relX <= stretchEdgePx) return 'resize-left';
      if (relX >= rect.width - stretchEdgePx) return 'resize-right';
    }
    // Normal edge drag = resize from header rail only (16px)
    if (relY <= HEADER_RAIL_HEIGHT_PX) {
      if (relX <= EDGE_HANDLE_PX) return 'resize-left';
      if (relX >= rect.width - EDGE_HANDLE_PX) return 'resize-right';
    }
    if (e.altKey) return 'slip';
    return 'move';
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
        onRangePreviewChange(widthPx > 0 ? { left: leftPx, width: widthPx } : null);
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
        onRangePreviewChange(null);

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
        }).catch((error) => {
          console.error('Failed to slice clip to selected range', {
            clipId: clip.id,
            trackId: track.id,
            previewStartTime,
            previewEndTime,
            error,
          });
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
    dragRef.current = false;
    scissorRef.current = false;
    let isShiftCopy = e.shiftKey;
    const isShiftStretch = e.shiftKey && (mode === 'resize-left' || mode === 'resize-right');

    const currentSelectedClipIds = useUIStore.getState().selectedClipIds;
    const isMultiSelected = currentSelectedClipIds.size > 1 && currentSelectedClipIds.has(clip.id);
    let lastBatchOffset = 0;

    const clipW = clip.duration * pixelsPerSecond;
    const clipH = clipBlockRef.current?.offsetHeight ?? 48;
    const clipRect = clipBlockRef.current?.getBoundingClientRect();
    const clickOffsetPx = clipRect ? startX - clipRect.left : 0;
    const supportsScissor = clip.generationStatus === 'ready' || Boolean(clip.midiData);
    const canStartLongPressScissor = supportsScissor && isSecondaryPress && mode === 'move';
    let secondaryMoved = false;
    let pendingGhost: DragGhostInfo | null = null;
    let ghostRafId = 0;
    let pendingStoreUpdate: (() => void) | null = null;
    let storeRafId = 0;
    const scheduleStoreUpdate = (fn: () => void) => {
      pendingStoreUpdate = fn;
      if (!storeRafId) {
        storeRafId = requestAnimationFrame(() => {
          if (pendingStoreUpdate) pendingStoreUpdate();
          pendingStoreUpdate = null;
          storeRafId = 0;
        });
      }
    };
    const flushStoreUpdate = () => {
      if (storeRafId) { cancelAnimationFrame(storeRafId); storeRafId = 0; }
      if (pendingStoreUpdate) { pendingStoreUpdate(); pendingStoreUpdate = null; }
    };

    // Cache lane rects at drag start to avoid repeated DOM queries during drag
    const laneElements = document.querySelectorAll<HTMLElement>('[data-timeline-lane][data-track-id]');
    const cachedLaneRects = new Map<string, DOMRect>();
    laneElements.forEach(el => {
      const trackId = el.getAttribute('data-track-id');
      if (trackId) cachedLaneRects.set(trackId, el.getBoundingClientRect());
    });
    const findClosestLaneCached = (clientY: number): { trackId: string; rect: DOMRect } | null => {
      let best: { trackId: string; rect: DOMRect; dist: number } | null = null;
      for (const [tid, r] of cachedLaneRects) {
        const centerY = r.top + r.height / 2;
        const dist = Math.abs(clientY - centerY);
        if (!best || dist < best.dist) {
          best = { trackId: tid, rect: r, dist };
        }
      }
      return best ? { trackId: best.trackId, rect: best.rect } : null;
    };
    const sourceLane = findClosestLaneCached(startY);

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
          onScissorLineChange(Math.max(0, Math.min(snappedPx, clipW)));
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
        onScissorLineChange(Math.max(0, Math.min(snappedPx, clipW)));
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

        const closest = findClosestLaneCached(ev.clientY);

        // Never move the original clip during drag — the ghost alone shows
        // the preview position. Store is only committed on mouseup.
        // Revert any offset that may have been applied in earlier frames.
        if (lastBatchOffset !== 0 && isMultiSelected) {
          batchMoveClips([...currentSelectedClipIds], -lastBatchOffset);
          lastBatchOffset = 0;
        }

        if (closest) {
          const ghostLeftVp = ev.clientX - clickOffsetPx;
          const clickOffsetY = clipRect ? startY - clipRect.top : 0;
          const crossingTrack = closest.trackId !== track.id;
          // Determine drop validity
          const isEmptySlot = closest.trackId.startsWith(ARRANGEMENT_EMPTY_TRACK_ID_PREFIX);
          const targetTrack = isEmptySlot ? null : useProjectStore.getState().project?.tracks.find((t) => t.id === closest.trackId);
          const isGroupTarget = targetTrack?.isGroup === true;
          const isMultiCrossTrack = isMultiSelected && crossingTrack && !isShiftCopy;
          const isValidDrop = !isGroupTarget && !isMultiCrossTrack;
          pendingGhost = {
            x: ghostLeftVp,
            y: ev.clientY - clickOffsetY,
            width: clipW,
            height: clipH,
            targetTrackId: closest.trackId,
            targetLaneRect: (crossingTrack || isShiftCopy)
              ? { top: closest.rect.top, height: closest.rect.height }
              : null,
            sourceLaneRect: (crossingTrack || isShiftCopy) && sourceLane
              ? { top: sourceLane.rect.top, height: sourceLane.rect.height }
              : null,
            isShiftCopy,
            isValidDrop,
          };
          if (!ghostRafId) {
            ghostRafId = requestAnimationFrame(() => {
              if (pendingGhost) onDragGhostChange(pendingGhost);
              ghostRafId = 0;
            });
          }
        }
      } else if (mode === 'resize-left') {
        let newStart = ev.altKey ? origStart + deltaSec : snapToGrid(origStart + deltaSec, bpm, 1);
        newStart = Math.max(0, newStart);
        const maxStart = origStart + origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);

        const newDuration = origDuration + (origStart - newStart);
        if (isShiftStretch) {
          // Shift+drag = time-stretch: use clip's current mode or default to complexPro
          const effectiveMode = origStretchMode && origStretchMode !== 'repitch' ? origStretchMode : 'complexPro';
          scheduleStoreUpdate(() => updateClip(clip.id, {
            startTime: newStart,
            duration: newDuration,
            contentOffset: undefined,
            timeStretchRate: Math.max(CLIP_DRAG_EPSILON, origSourceSpan / newDuration),
            stretchMode: effectiveMode,
          }));
          return;
        }

        if (newStart < origStart) {
          const extension = origStart - newStart;
          scheduleStoreUpdate(() => updateClip(clip.id, {
            startTime: newStart,
            duration: newDuration,
            contentOffset: origContentOffset + extension,
            timeStretchRate: undefined,
            stretchMode: undefined,
          }));
          return;
        }

        const trimAmount = newStart - origStart;
        const silenceTrim = Math.min(origContentOffset, trimAmount);
        const audioTrim = trimAmount - silenceTrim;
        scheduleStoreUpdate(() => updateClip(clip.id, {
          startTime: newStart,
          duration: newDuration,
          contentOffset: Math.max(0, origContentOffset - silenceTrim) || undefined,
          audioOffset: Math.min(origAudioDuration, origAudioOffset + audioTrim),
          timeStretchRate: undefined,
          stretchMode: undefined,
        }));
      } else if (mode === 'slip') {
        document.body.style.cursor = 'ew-resize';
        const maxOffset = Math.max(0, origAudioDuration - origDuration);
        if (maxOffset > 0) {
          const newOffset = Math.max(0, Math.min(origAudioOffset + deltaSec, maxOffset));
          scheduleStoreUpdate(() => updateClip(clip.id, { audioOffset: newOffset }));
        }
      } else {
        let newDuration = ev.altKey ? origDuration + deltaSec : snapToGrid(origDuration + deltaSec, bpm, 1);
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration);
        newDuration = Math.min(newDuration, totalDuration - origStart);
        if (isShiftStretch) {
          // Shift+drag = time-stretch: use clip's current mode or default to complexPro
          const effectiveMode = origStretchMode && origStretchMode !== 'repitch' ? origStretchMode : 'complexPro';
          const rate = Math.max(CLIP_DRAG_EPSILON, origSourceSpan / newDuration);
          scheduleStoreUpdate(() => updateClip(clip.id, {
            duration: newDuration,
            contentOffset: undefined,
            timeStretchRate: rate,
            stretchMode: effectiveMode,
          }));
          return;
        }
        scheduleStoreUpdate(() => updateClip(clip.id, {
          duration: newDuration,
          contentOffset: Math.min(origContentOffset, newDuration) || undefined,
          timeStretchRate: undefined,
          stretchMode: undefined,
        }));
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(ghostRafId);
      // Cancel any pending batched store update (escape reverts, so discard it)
      if (storeRafId) { cancelAnimationFrame(storeRafId); storeRafId = 0; }
      pendingStoreUpdate = null;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      // Cancel scissor mode
      if (scissorRef.current) {
        scissorRef.current = false;
        onScissorLineChange(null);
        document.body.style.cursor = '';
        return;
      }
      onDragGhostChange(null);
      document.body.style.cursor = '';
      if (dragRef.current) {
        // Restore original state for multi-select batch moves
        if (isMultiSelected && lastBatchOffset !== 0) {
          batchMoveClips([...currentSelectedClipIds], -lastBatchOffset);
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
      cancelAnimationFrame(ghostRafId);
      // Flush any pending batched store update so the final position is committed
      flushStoreUpdate();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      // Execute scissor split
      if (scissorRef.current) {
        scissorRef.current = false;
        onScissorLineChange(null);
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
          onCtxMenuChange({ x: ev.clientX, y: ev.clientY });
        }
        suppressContextMenuRef.current = false;
        return;
      }

      // Trigger ghost "landing" animation
      if (pendingGhost || ghostRafId) {
        onGhostLanding();
      } else {
        onDragGhostChange(null);
      }
      endDrag();
      document.body.style.cursor = '';

      // After Shift+drag stretch: trigger Rubber Band pre-processing in background
      if (isShiftStretch && dragRef.current) {
        const currentClip = useProjectStore.getState().getClipById(clip.id);
        if (currentClip) {
          try {
            const engine = getAudioEngine();
            const audioKey = currentClip.isolatedAudioKey ?? currentClip.cumulativeMixKey;
            if (audioKey) {
              // Show processing indicator on clip
              useProjectStore.getState().updateClipStatus(clip.id, 'processing');
              void engine.preProcessClipStretchByKey(
                currentClip.id, audioKey,
                currentClip.duration, currentClip.timeStretchRate,
                currentClip.stretchMode, currentClip.pitchShift,
              ).finally(() => {
                useProjectStore.getState().updateClipStatus(clip.id, 'ready');
              });
            }
          } catch { /* engine not ready */ }
        }
      }

      if ((mode === 'resize-left' || mode === 'resize-right') && dragRef.current && !isShiftStretch) {
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
        const closest = findClosestLaneCached(ev.clientY);
        const deltaSec = (ev.clientX - startX) / pixelsPerSecond;
        const isFineMove = ev.metaKey || ev.ctrlKey;
        const dropStart = Math.max(0, isFineMove
          ? Math.round((origStart + deltaSec) * 100) / 100
          : snapToGrid(origStart + deltaSec, bpm, 1));

        // Resolve target trackId — if dropping on an empty slot, create a new
        // track that inherits the source track's color and display name prefix
        let resolvedTargetId = closest?.trackId;
        if (resolvedTargetId) {
          const emptySlotIndex = parseArrangementEmptyTrackSlotIndex(resolvedTargetId);
          if (emptySlotIndex !== null) {
            const newTrack = addTrack(track.trackName, track.trackType, {
              order: emptySlotIndex + 1,
              color: track.color,
              displayName: track.displayName,
            });
            resolvedTargetId = newTrack.id;
          }
        }

        if (ev.shiftKey && closest && resolvedTargetId) {
          // Shift+drag = duplicate
          const timeOffset = dropStart - origStart;
          if (isMultiSelected) {
            batchDuplicateClips([...currentSelectedClipIds], timeOffset);
          } else {
            duplicateClipToTrack(clip.id, resolvedTargetId, dropStart);
          }
        } else if (resolvedTargetId && resolvedTargetId !== track.id && !isMultiSelected) {
          // Cross-track move
          moveClipToTrack(clip.id, resolvedTargetId, dropStart);
        } else if (!isMultiSelected) {
          // Same-track move — commit final position
          updateClip(clip.id, { startTime: dropStart });
        } else {
          // Same-track multi-select move — commit final offset
          const timeOffset = dropStart - origStart;
          if (timeOffset !== 0) {
            batchMoveClips([...currentSelectedClipIds], timeOffset);
          }
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }, [addTrack, batchDuplicateClips, batchMoveClips, beginDrag, bpm, clip, duplicateClipToTrack, endDrag, getDragMode, moveClipToTrack, pixelsPerSecond, selectClip, sliceClipToRange, snapClipEdgeToZeroCrossing, splitClipAtZeroCrossing, totalDuration, track.id, track.trackName, track.trackType, undo, updateClip, clipBlockRef, onDragGhostChange, onGhostLanding, onScissorLineChange, onRangePreviewChange, onCtxMenuChange, track.color, track.displayName]);

  return {
    handleMouseDown,
    getDragMode,
    dragRef,
    scissorRef,
    suppressContextMenuRef,
    rangePreviewCommittedRef,
  };
}

import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../store/projectStore';

/** Minimum pixel movement before drag starts. */
const DRAG_THRESHOLD = 5;

export type SessionDragType = 'clip' | 'scene';

export interface SessionDragState {
  type: SessionDragType;
  /** Slot ID being dragged (for clip drags). */
  sourceSlotId?: string;
  /** Scene index being dragged (for scene drags). */
  sourceSceneIndex?: number;
  /** Current ghost position in viewport coordinates. */
  ghostX: number;
  ghostY: number;
  /** Label shown on the ghost element. */
  label: string;
  /** Color for the ghost element. */
  color: string;
}

export interface SessionDropTarget {
  /** Slot ID of the drop target cell. */
  slotId?: string;
  /** Track ID of the hovered cell. */
  trackId?: string;
  /** Scene index of the hovered cell or header. */
  sceneIndex?: number;
  /** Whether this is a valid drop target. */
  valid: boolean;
}

interface PointerOrigin {
  x: number;
  y: number;
  type: SessionDragType;
  sourceSlotId?: string;
  sourceSceneIndex?: number;
  label: string;
  color: string;
}

/**
 * Hook for managing drag-and-drop in the Session View grid.
 * Supports clip slot moves (same/cross-track) and scene reordering.
 */
export function useSessionDragDrop() {
  const moveSessionSlotClip = useProjectStore((s) => s.moveSessionSlotClip);
  const reorderSessionScenes = useProjectStore((s) => s.reorderSessionScenes);

  const [dragState, setDragState] = useState<SessionDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<SessionDropTarget | null>(null);
  const originRef = useRef<PointerOrigin | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((
    e: React.PointerEvent,
    type: SessionDragType,
    opts: {
      sourceSlotId?: string;
      sourceSceneIndex?: number;
      label: string;
      color: string;
    },
  ) => {
    // Only handle primary button
    if (e.button !== 0) return;
    e.preventDefault();
    originRef.current = {
      x: e.clientX,
      y: e.clientY,
      type,
      sourceSlotId: opts.sourceSlotId,
      sourceSceneIndex: opts.sourceSceneIndex,
      label: opts.label,
      color: opts.color,
    };
    isDraggingRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const findDropTarget = useCallback((clientX: number, clientY: number, dragType: SessionDragType): SessionDropTarget | null => {
    // Temporarily hide ghost to find element underneath
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      if (dragType === 'clip') {
        const slotId = htmlEl.dataset?.slotId;
        const trackId = htmlEl.dataset?.trackId;
        const sceneIndexStr = htmlEl.dataset?.sceneIndex;
        if (trackId && sceneIndexStr !== undefined) {
          return {
            slotId: slotId || undefined,
            trackId,
            sceneIndex: parseInt(sceneIndexStr, 10),
            valid: true,
          };
        }
      } else if (dragType === 'scene') {
        const sceneIndexStr = htmlEl.dataset?.sceneIndex;
        if (sceneIndexStr !== undefined && htmlEl.dataset?.sceneHeader !== undefined) {
          return {
            sceneIndex: parseInt(sceneIndexStr, 10),
            valid: true,
          };
        }
      }
    }
    return null;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;

    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;

    if (!isDraggingRef.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      isDraggingRef.current = true;
      setDragState({
        type: origin.type,
        sourceSlotId: origin.sourceSlotId,
        sourceSceneIndex: origin.sourceSceneIndex,
        ghostX: e.clientX,
        ghostY: e.clientY,
        label: origin.label,
        color: origin.color,
      });
    }

    setDragState((prev) => prev ? { ...prev, ghostX: e.clientX, ghostY: e.clientY } : null);

    const target = findDropTarget(e.clientX, e.clientY, origin.type);
    setDropTarget(target);
  }, [findDropTarget]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const origin = originRef.current;
    const wasDragging = isDraggingRef.current;
    originRef.current = null;
    isDraggingRef.current = false;

    if (!wasDragging || !origin) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    const target = findDropTarget(e.clientX, e.clientY, origin.type);

    if (target?.valid) {
      if (origin.type === 'clip' && origin.sourceSlotId && target.slotId) {
        moveSessionSlotClip(origin.sourceSlotId, target.slotId);
      } else if (origin.type === 'scene' && origin.sourceSceneIndex !== undefined && target.sceneIndex !== undefined) {
        reorderSessionScenes(origin.sourceSceneIndex, target.sceneIndex);
      }
    }

    setDragState(null);
    setDropTarget(null);
  }, [findDropTarget, moveSessionSlotClip, reorderSessionScenes]);

  const cancelDrag = useCallback(() => {
    originRef.current = null;
    isDraggingRef.current = false;
    setDragState(null);
    setDropTarget(null);
  }, []);

  return {
    dragState,
    dropTarget,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelDrag,
  };
}

import React, { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { FADE_HANDLE_KEYBOARD_STEP } from '../../utils/clipFade';
import { EDGE_HANDLE_PX, HEADER_RAIL_HEIGHT_PX } from './useClipDrag';

const FADE_HANDLE_HIT_TARGET_PX = 14;

interface ClipFadeHandlesProps {
  clipId: string;
  clipDuration: number;
  width: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeInWidth: number;
  fadeOutWidth: number;
  showFadeInHandle: boolean;
  showFadeOutHandle: boolean;
  pixelsPerSecond: number;
  clipBlockRef: React.RefObject<HTMLDivElement | null>;
}

export function ClipFadeHandles({
  clipId,
  clipDuration,
  width,
  fadeInDuration,
  fadeOutDuration,
  fadeInWidth,
  fadeOutWidth,
  showFadeInHandle,
  showFadeOutHandle,
  pixelsPerSecond,
  clipBlockRef,
}: ClipFadeHandlesProps) {
  const setClipFade = useProjectStore((s) => s.setClipFade);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);

  const updateFadeFromPointer = useCallback((edge: 'in' | 'out', clientX: number) => {
    const rect = clipBlockRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (edge === 'in') {
      const nextFade = Math.max(0, Math.min((clientX - rect.left) / pixelsPerSecond, clipDuration));
      setClipFade(clipId, { fadeInDuration: nextFade });
      return;
    }

    const nextFade = Math.max(0, Math.min((rect.right - clientX) / pixelsPerSecond, clipDuration));
    setClipFade(clipId, { fadeOutDuration: nextFade });
  }, [clipDuration, clipId, pixelsPerSecond, setClipFade, clipBlockRef]);

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
      setClipFade(clipId, edge === 'in' ? { fadeInDuration: 0 } : { fadeOutDuration: 0 });
      return;
    }

    if (e.key !== growKey && e.key !== shrinkKey) return;

    e.preventDefault();
    const delta = (e.shiftKey ? FADE_HANDLE_KEYBOARD_STEP * 5 : FADE_HANDLE_KEYBOARD_STEP) * (e.key === growKey ? 1 : -1);
    if (edge === 'in') {
      setClipFade(clipId, { fadeInDuration: fadeInDuration + delta });
      return;
    }
    setClipFade(clipId, { fadeOutDuration: fadeOutDuration + delta });
  }, [clipId, fadeInDuration, fadeOutDuration, setClipFade]);

  const handleFadeReset = useCallback((edge: 'in' | 'out') => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setClipFade(clipId, edge === 'in' ? { fadeInDuration: 0 } : { fadeOutDuration: 0 });
  }, [clipId, setClipFade]);

  return (
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
          aria-label={`Fade in handle for clip ${clipId}`}
          aria-valuemin={0}
          aria-valuemax={clipDuration}
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
          aria-label={`Fade out handle for clip ${clipId}`}
          aria-valuemin={0}
          aria-valuemax={clipDuration}
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
  );
}

import React, { useCallback, useMemo, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  FADE_HANDLE_KEYBOARD_STEP,
  computeFadeFromPointer,
} from '../../utils/clipFade';
import { HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import type { Clip } from '../../types/project';

const FADE_HANDLE_SIZE_PX = 8;
const FADE_CURVE_LINE_COLOR = '#000';
const FADE_CURVE_LINE_WIDTH = 0.5;
const FADE_MASK_FILL = 'rgba(0, 0, 0, 0.22)';

type FadeEdge = 'in' | 'out';

interface ClipFadeHandlesProps {
  clipId: string;
  clipDuration: number;
  clipStartTime: number;
  width: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeInCurve?: Clip['fadeInCurve'];
  fadeOutCurve?: Clip['fadeOutCurve'];
  showFadeInHandle: boolean;
  showFadeOutHandle: boolean;
  pixelsPerSecond: number;
  clipBlockRef: React.RefObject<HTMLDivElement | null>;
  /** Hex color of the clip body — used as the handle fill. */
  clipColor: string;
  /** Live update callback fired on every drag frame. The receiver should hold
   *  this value in local state (not in the global store) for snappy feedback. */
  onFadeDragLive: (edge: FadeEdge, valueSeconds: number) => void;
  /** Commit callback fired on mouseup — write the final value to the store. */
  onFadeDragCommit: (edge: FadeEdge, valueSeconds: number) => void;
  /** Cancel callback fired on Escape — discard any live override. */
  onFadeDragCancel: (edge: FadeEdge) => void;
}

export function ClipFadeHandles({
  clipId,
  clipDuration,
  clipStartTime,
  width,
  fadeInDuration,
  fadeOutDuration,
  fadeInCurve,
  fadeOutCurve,
  showFadeInHandle,
  showFadeOutHandle,
  pixelsPerSecond,
  clipBlockRef,
  clipColor,
  onFadeDragLive,
  onFadeDragCommit,
  onFadeDragCancel,
}: ClipFadeHandlesProps) {
  const setClipFade = useProjectStore((s) => s.setClipFade);

  // The most recent value computed from the pointer. We recompute every frame
  // and forward it to the parent via onFadeDragLive — no Zustand mutation
  // happens until mouseup, so re-renders during drag are limited to ClipBlock.
  const liveValueRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; altKey: boolean } | null>(null);

  const computeNext = useCallback((edge: FadeEdge, clientX: number): number => {
    const rect = clipBlockRef.current?.getBoundingClientRect();
    if (!rect) return liveValueRef.current;
    return computeFadeFromPointer({
      edge,
      pointerX: clientX,
      clipRect: { left: rect.left, right: rect.right },
      pixelsPerSecond,
      clip: {
        startTime: clipStartTime,
        duration: clipDuration,
        fadeInDuration,
        fadeOutDuration,
      },
    });
  }, [clipBlockRef, clipDuration, clipStartTime, fadeInDuration, fadeOutDuration, pixelsPerSecond]);

  const handleFadeMouseDown = useCallback((edge: FadeEdge) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Apply the click position immediately so a click-without-movement still works.
    const initial = computeNext(edge, e.clientX);
    liveValueRef.current = initial;
    onFadeDragLive(edge, initial);

    pendingPointerRef.current = { clientX: e.clientX, altKey: e.altKey };

    const flush = () => {
      rafIdRef.current = null;
      const pending = pendingPointerRef.current;
      if (!pending) return;
      const next = computeNext(edge, pending.clientX);
      if (next !== liveValueRef.current) {
        liveValueRef.current = next;
        onFadeDragLive(edge, next);
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      pendingPointerRef.current = { clientX: ev.clientX, altKey: ev.altKey };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flush);
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingPointerRef.current = null;
    };

    const onMouseUp = () => {
      // Final flush in case rAF didn't run between the last mousemove and mouseup
      const pending = pendingPointerRef.current;
      if (pending) {
        const finalValue = computeNext(edge, pending.clientX);
        liveValueRef.current = finalValue;
      }
      cleanup();
      onFadeDragCommit(edge, liveValueRef.current);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      cleanup();
      onFadeDragCancel(edge);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }, [computeNext, onFadeDragLive, onFadeDragCommit, onFadeDragCancel]);

  const handleFadeKeyDown = useCallback((edge: FadeEdge) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
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

  const handleFadeReset = useCallback((edge: FadeEdge) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setClipFade(clipId, edge === 'in' ? { fadeInDuration: 0 } : { fadeOutDuration: 0 });
  }, [clipId, setClipFade]);

  // Handle X position: the box's LEFT edge sits at the fade endpoint pixel,
  // so at fade=0 the fade-in handle is flush with the clip's left edge and
  // the fade-out handle's right edge is flush with the clip's right edge.
  const fadeInWidthPx = Math.min(width, fadeInDuration * pixelsPerSecond);
  const fadeOutWidthPx = Math.min(width, fadeOutDuration * pixelsPerSecond);
  const inLeftPx = Math.max(0, Math.min(width - FADE_HANDLE_SIZE_PX, fadeInWidthPx));
  const outLeftPx = Math.max(0, Math.min(width - FADE_HANDLE_SIZE_PX, width - fadeOutWidthPx - FADE_HANDLE_SIZE_PX));

  // Sample the gain envelope to build SVG paths for the visible curve line
  // and the translucent dark mask. The curve always matches the actual fade
  // curve type (linear / exponential / equal-power) used by the audio engine.
  const fadeInPaths = useMemo(() => {
    if (fadeInWidthPx <= 0) return null;
    return buildFadePaths('in', fadeInWidthPx, fadeInCurve ?? 'linear');
  }, [fadeInWidthPx, fadeInCurve]);

  const fadeOutPaths = useMemo(() => {
    if (fadeOutWidthPx <= 0) return null;
    return buildFadePaths('out', fadeOutWidthPx, fadeOutCurve ?? 'linear');
  }, [fadeOutWidthPx, fadeOutCurve]);

  return (
    <>
      {fadeInPaths && (
        <FadeCurveLayer
          testId="fade-in-overlay"
          left={0}
          width={fadeInWidthPx}
          maskPath={fadeInPaths.maskPath}
          linePath={fadeInPaths.linePath}
          showLine={showFadeInHandle}
        />
      )}
      {fadeOutPaths && (
        <FadeCurveLayer
          testId="fade-out-overlay"
          left={width - fadeOutWidthPx}
          width={fadeOutWidthPx}
          maskPath={fadeOutPaths.maskPath}
          linePath={fadeOutPaths.linePath}
          showLine={showFadeOutHandle}
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
          className="absolute z-20 cursor-ew-resize focus:outline-none"
          style={{
            top: HEADER_RAIL_HEIGHT_PX,
            width: FADE_HANDLE_SIZE_PX,
            height: FADE_HANDLE_SIZE_PX,
            left: inLeftPx,
            backgroundColor: clipColor,
            border: '1px solid #000',
            boxSizing: 'border-box',
          }}
          data-fade-handle="in"
          onMouseDown={handleFadeMouseDown('in')}
          onKeyDown={handleFadeKeyDown('in')}
          onDoubleClick={handleFadeReset('in')}
        />
      )}
      {showFadeOutHandle && (
        <button
          type="button"
          role="slider"
          aria-label={`Fade out handle for clip ${clipId}`}
          aria-valuemin={0}
          aria-valuemax={clipDuration}
          aria-valuenow={fadeOutDuration}
          className="absolute z-20 cursor-ew-resize focus:outline-none"
          style={{
            top: HEADER_RAIL_HEIGHT_PX,
            width: FADE_HANDLE_SIZE_PX,
            height: FADE_HANDLE_SIZE_PX,
            left: outLeftPx,
            backgroundColor: clipColor,
            border: '1px solid #000',
            boxSizing: 'border-box',
          }}
          data-fade-handle="out"
          onMouseDown={handleFadeMouseDown('out')}
          onKeyDown={handleFadeKeyDown('out')}
          onDoubleClick={handleFadeReset('out')}
        />
      )}
    </>
  );
}

interface FadeCurveLayerProps {
  testId: string;
  left: number;
  width: number;
  maskPath: string;
  linePath: string;
  showLine: boolean;
}

/**
 * SVG layer rendered over the clip body for one fade region. The translucent
 * mask is always painted (it's the persistent fade affordance), the black
 * curve line only paints when the parent shows the handle (hover state).
 */
function FadeCurveLayer({ testId, left, width, maskPath, linePath, showLine }: FadeCurveLayerProps) {
  const VIEWBOX_HEIGHT = 100;
  // SVG default height is 150px, so we must wrap in a sized div and use
  // w-full/h-full on the SVG itself. Without this, the viewBox bottom maps
  // to a y-coordinate outside the clip body and the visible line appears
  // to start halfway up the body.
  return (
    <div
      data-testid={testId}
      className="absolute pointer-events-none"
      style={{
        left,
        width,
        top: HEADER_RAIL_HEIGHT_PX,
        bottom: 0,
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <path d={maskPath} fill={FADE_MASK_FILL} />
        {showLine && (
          <path
            d={linePath}
            fill="none"
            stroke={FADE_CURVE_LINE_COLOR}
            strokeWidth={FADE_CURVE_LINE_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

/**
 * Build the line + mask SVG paths for a fade region.
 *
 * Each curve is emitted as a **single SVG path command** — a straight line
 * for linear or one quadratic bezier for exponential / equal-power. This
 * avoids the polyline jaggies you'd see if we sampled the gain envelope into
 * many short `L` segments: SVG rasterizes a real bezier at sub-pixel
 * precision regardless of how the parent stretches it.
 *
 * The y axis uses a 0-100 viewBox unit and the parent SVG scales to fit the
 * body height via `preserveAspectRatio="none"`. The visible curve shape is
 * the same family used by the audio engine; for linear (the default and most
 * common case) the line and the gain envelope match exactly.
 */
function buildFadePaths(
  direction: 'in' | 'out',
  widthPx: number,
  curve: NonNullable<Clip['fadeInCurve']>,
): { linePath: string; maskPath: string } {
  const VIEWBOX_HEIGHT = 100;
  const w = widthPx;
  const h = VIEWBOX_HEIGHT;

  const cp = direction === 'in'
    ? controlPointForFadeIn(curve, w, h)
    : controlPointForFadeOut(curve, w, h);

  let linePath: string;
  let maskPath: string;

  if (direction === 'in') {
    // Line: from silenced corner (0, h) up to unity corner (w, 0)
    if (curve === 'linear') {
      linePath = `M 0,${fmt(h)} L ${fmt(w)},0`;
    } else {
      linePath = `M 0,${fmt(h)} Q ${fmt(cp.cx)},${fmt(cp.cy)} ${fmt(w)},0`;
    }
    // Mask: close back across the top edge, then bezier from (w,0) to (0,h)
    if (curve === 'linear') {
      maskPath = `M 0,0 L ${fmt(w)},0 L 0,${fmt(h)} Z`;
    } else {
      maskPath = `M 0,0 L ${fmt(w)},0 Q ${fmt(cp.cx)},${fmt(cp.cy)} 0,${fmt(h)} Z`;
    }
  } else {
    // Fade-out: from (0, 0) unity down to (w, h) silenced
    if (curve === 'linear') {
      linePath = `M 0,0 L ${fmt(w)},${fmt(h)}`;
    } else {
      linePath = `M 0,0 Q ${fmt(cp.cx)},${fmt(cp.cy)} ${fmt(w)},${fmt(h)}`;
    }
    if (curve === 'linear') {
      maskPath = `M 0,0 L ${fmt(w)},${fmt(h)} L ${fmt(w)},0 Z`;
    } else {
      maskPath = `M 0,0 Q ${fmt(cp.cx)},${fmt(cp.cy)} ${fmt(w)},${fmt(h)} L ${fmt(w)},0 Z`;
    }
  }

  return { linePath, maskPath };
}

function controlPointForFadeIn(curve: NonNullable<Clip['fadeInCurve']>, w: number, h: number) {
  switch (curve) {
    case 'exponential':
      // Slow start → bow toward bottom-right (silenced corner)
      return { cx: w * 0.7, cy: h * 0.7 };
    case 'equal-power':
      // Fast start → bow toward top-left (unity corner)
      return { cx: w * 0.3, cy: h * 0.3 };
    case 'linear':
    default:
      return { cx: w * 0.5, cy: h * 0.5 };
  }
}

function controlPointForFadeOut(curve: NonNullable<Clip['fadeInCurve']>, w: number, h: number) {
  switch (curve) {
    case 'exponential':
      return { cx: w * 0.3, cy: h * 0.7 };
    case 'equal-power':
      return { cx: w * 0.7, cy: h * 0.3 };
    case 'linear':
    default:
      return { cx: w * 0.5, cy: h * 0.5 };
  }
}

function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

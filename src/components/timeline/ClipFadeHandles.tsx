import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  FADE_HANDLE_KEYBOARD_STEP,
  computeFadeFromPointer,
  evaluateBezierFadeGain,
} from '../../utils/clipFade';
import { HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import type { Clip } from '../../types/project';

const FADE_HANDLE_SIZE_PX = 8;
const FADE_CURVE_LINE_COLOR = '#000';
const FADE_CURVE_LINE_WIDTH = 1;
const FADE_MASK_FILL = 'rgba(0, 0, 0, 0.22)';
const CURVE_POINT_HIT_TARGET_PX = 14;
const CURVE_POINT_VISUAL_RADIUS_PX = 3;
/** Sub-pixel margin so s₁ / s₂ in the Hermite don't blow up when the dot is
 *  dragged right onto a corner. The user's effective drag area is still the
 *  full fade region — 1e-4 is well below any realistic pixel size. */
const CURVE_POINT_X_MIN = 1e-4;
const CURVE_POINT_X_MAX = 1 - 1e-4;
const CURVE_POINT_Y_MIN = 1e-4;
const CURVE_POINT_Y_MAX = 1 - 1e-4;

type FadeEdge = 'in' | 'out';
type CurvePoint = { x: number; y: number };

interface ClipFadeHandlesProps {
  clipId: string;
  clipDuration: number;
  clipStartTime: number;
  width: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeInCurve?: Clip['fadeInCurve'];
  fadeOutCurve?: Clip['fadeOutCurve'];
  fadeInCurvePoint?: Clip['fadeInCurvePoint'];
  fadeOutCurvePoint?: Clip['fadeOutCurvePoint'];
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
  /** Live + commit + cancel for the bezier curve point on the fade. */
  onCurvePointDragLive: (edge: FadeEdge, point: CurvePoint) => void;
  onCurvePointDragCommit: (edge: FadeEdge, point: CurvePoint) => void;
  onCurvePointDragCancel: (edge: FadeEdge) => void;
  /** Reset the curve point to undefined (return to preset shape). */
  onCurvePointReset: (edge: FadeEdge) => void;
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
  fadeInCurvePoint,
  fadeOutCurvePoint,
  showFadeInHandle,
  showFadeOutHandle,
  pixelsPerSecond,
  clipBlockRef,
  clipColor,
  onFadeDragLive,
  onFadeDragCommit,
  onFadeDragCancel,
  onCurvePointDragLive,
  onCurvePointDragCommit,
  onCurvePointDragCancel,
  onCurvePointReset,
}: ClipFadeHandlesProps) {
  const setClipFade = useProjectStore((s) => s.setClipFade);
  // The black curve line should only appear during an active drag (either of
  // a fade box or the curve point). At rest we only show the translucent mask
  // — the mask alone tells the user a fade exists.
  const [draggingEdges, setDraggingEdges] = useState<{ in: boolean; out: boolean }>({ in: false, out: false });
  const setDragging = useCallback((edge: FadeEdge, value: boolean) => {
    setDraggingEdges((prev) => (prev[edge] === value ? prev : { ...prev, [edge]: value }));
  }, []);

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
    setDragging(edge, true);

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
      setDragging(edge, false);
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
  }, [computeNext, onFadeDragLive, onFadeDragCommit, onFadeDragCancel, setDragging]);

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
  // curve type (preset OR user-dragged bezier point) used by the audio engine.
  const fadeInPaths = useMemo(() => {
    if (fadeInWidthPx <= 0) return null;
    return buildFadePaths('in', fadeInWidthPx, fadeInCurve ?? 'linear', fadeInCurvePoint ?? undefined);
  }, [fadeInWidthPx, fadeInCurve, fadeInCurvePoint]);

  const fadeOutPaths = useMemo(() => {
    if (fadeOutWidthPx <= 0) return null;
    return buildFadePaths('out', fadeOutWidthPx, fadeOutCurve ?? 'linear', fadeOutCurvePoint ?? undefined);
  }, [fadeOutWidthPx, fadeOutCurve, fadeOutCurvePoint]);

  // Curve point drag uses the same store-bypass pattern as fade duration:
  // a ref holds the latest value, rAF coalesces mousemove updates, and the
  // parent receives onCurvePointDragLive so only the local clip re-renders
  // per frame. Final commit on mouseup is a single setClipFade.
  const livePointRef = useRef<CurvePoint>({ x: 0.5, y: 0.5 });
  const cpPendingRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const cpRafIdRef = useRef<number | null>(null);

  const computeCurvePoint = useCallback((edge: FadeEdge, clientX: number, clientY: number): CurvePoint => {
    const rect = clipBlockRef.current?.getBoundingClientRect();
    if (!rect) return livePointRef.current;
    const fadePx = edge === 'in' ? fadeInWidthPx : fadeOutWidthPx;
    if (fadePx <= 0) return livePointRef.current;
    // Convert pointer to fade-region-local pixels (top of body, not top of clip).
    const regionLeft = edge === 'in' ? rect.left : rect.right - fadePx;
    const regionTop = rect.top + HEADER_RAIL_HEIGHT_PX;
    const regionBottom = rect.bottom;
    const regionH = Math.max(1, regionBottom - regionTop);
    const localX = clientX - regionLeft;
    const localY = clientY - regionTop;
    // The dot follows the mouse anywhere inside the fade region (with a tiny
    // margin from the corners so the power-curve exponent is well defined).
    // The curve adapts to pass through the dot exactly.
    const x = clampNumber(localX / fadePx, CURVE_POINT_X_MIN, CURVE_POINT_X_MAX);
    const y = clampNumber(1 - localY / regionH, CURVE_POINT_Y_MIN, CURVE_POINT_Y_MAX);
    return { x, y };
  }, [clipBlockRef, fadeInWidthPx, fadeOutWidthPx]);

  const handleCurvePointMouseDown = useCallback((edge: FadeEdge) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(edge, true);

    const initial = computeCurvePoint(edge, e.clientX, e.clientY);
    livePointRef.current = initial;
    onCurvePointDragLive(edge, initial);
    cpPendingRef.current = { clientX: e.clientX, clientY: e.clientY };

    const flush = () => {
      cpRafIdRef.current = null;
      const pending = cpPendingRef.current;
      if (!pending) return;
      const next = computeCurvePoint(edge, pending.clientX, pending.clientY);
      if (next.x !== livePointRef.current.x || next.y !== livePointRef.current.y) {
        livePointRef.current = next;
        onCurvePointDragLive(edge, next);
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      cpPendingRef.current = { clientX: ev.clientX, clientY: ev.clientY };
      if (cpRafIdRef.current === null) {
        cpRafIdRef.current = requestAnimationFrame(flush);
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (cpRafIdRef.current !== null) {
        cancelAnimationFrame(cpRafIdRef.current);
        cpRafIdRef.current = null;
      }
      cpPendingRef.current = null;
      setDragging(edge, false);
    };

    const onMouseUp = () => {
      const pending = cpPendingRef.current;
      if (pending) {
        livePointRef.current = computeCurvePoint(edge, pending.clientX, pending.clientY);
      }
      cleanup();
      onCurvePointDragCommit(edge, livePointRef.current);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      cleanup();
      onCurvePointDragCancel(edge);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }, [computeCurvePoint, onCurvePointDragLive, onCurvePointDragCommit, onCurvePointDragCancel, setDragging]);

  const handleCurvePointDoubleClick = useCallback((edge: FadeEdge) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onCurvePointReset(edge);
  }, [onCurvePointReset]);

  return (
    <>
      {fadeInPaths && (
        <FadeCurveLayer
          testId="fade-in-overlay"
          left={0}
          width={fadeInWidthPx}
          maskPath={fadeInPaths.maskPath}
          linePath={fadeInPaths.linePath}
          showLine={draggingEdges.in}
        />
      )}
      {fadeOutPaths && (
        <FadeCurveLayer
          testId="fade-out-overlay"
          left={width - fadeOutWidthPx}
          width={fadeOutWidthPx}
          maskPath={fadeOutPaths.maskPath}
          linePath={fadeOutPaths.linePath}
          showLine={draggingEdges.out}
        />
      )}
      {fadeInPaths && showFadeInHandle && (
        <CurvePointHandle
          edge="in"
          clipId={clipId}
          regionLeft={0}
          regionWidthPx={fadeInWidthPx}
          midpointFraction={{
            x: fadeInPaths.midpointCx / Math.max(1, fadeInWidthPx),
            // y in viewBox space: 0 = top (unity), 100 = bottom (silence). Convert to fraction-from-top.
            y: fadeInPaths.midpointCy / 100,
          }}
          fillColor={clipColor}
          onMouseDown={handleCurvePointMouseDown('in')}
          onDoubleClick={handleCurvePointDoubleClick('in')}
        />
      )}
      {fadeOutPaths && showFadeOutHandle && (
        <CurvePointHandle
          edge="out"
          clipId={clipId}
          regionLeft={width - fadeOutWidthPx}
          regionWidthPx={fadeOutWidthPx}
          midpointFraction={{
            x: fadeOutPaths.midpointCx / Math.max(1, fadeOutWidthPx),
            y: fadeOutPaths.midpointCy / 100,
          }}
          fillColor={clipColor}
          onMouseDown={handleCurvePointMouseDown('out')}
          onDoubleClick={handleCurvePointDoubleClick('out')}
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
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

/**
 * Build SVG paths for the fade region.
 *
 * The gain envelope is the **Fritsch–Carlson monotone cubic Hermite** curve
 * through (0,0), the user-dragged dot, and (1,1) (mirrored for fade-out).
 * `evaluateBezierFadeGain` in `clipFade.ts` is the single source of truth —
 * both the audio engine and this renderer call into it, so the visible line
 * always matches what will actually play.
 *
 * We sample the curve at 64 uniform t values with the dot's exact t injected
 * as an additional sample, so the polyline visits the dragged dot pixel-
 * perfectly. Rendering as a polyline (M + L) avoids spline-interpolation
 * overshoot near steep curvature.
 */
function buildFadePaths(
  direction: 'in' | 'out',
  widthPx: number,
  curve: NonNullable<Clip['fadeInCurve']>,
  curvePoint: CurvePoint | undefined,
): { linePath: string; maskPath: string; midpointCx: number; midpointCy: number } {
  const VIEWBOX_HEIGHT = 100;
  const w = widthPx;
  const h = VIEWBOX_HEIGHT;

  // Determine where the dot sits. For preset curves with no explicit point,
  // synthesize one on the preset's natural midpoint so the dot still appears
  // at a sensible spot when the user hasn't dragged anything yet.
  let dotNormX: number;
  let dotNormY: number; // y in [0,1] where 1 = unity (gain), 0 = silence
  if (curvePoint) {
    dotNormX = clampNumber(curvePoint.x, CURVE_POINT_X_MIN, CURVE_POINT_X_MAX);
    dotNormY = clampNumber(curvePoint.y, CURVE_POINT_Y_MIN, CURVE_POINT_Y_MAX);
  } else {
    dotNormX = 0.5;
    dotNormY = presetMidGain(curve, direction);
  }

  // Fade-in: from=0, to=1; fade-out: from=1, to=0. `evaluateBezierFadeGain`
  // handles both directions and keeps the dot exactly on the curve by
  // construction — we still inject dotNormX as an explicit sample so the
  // rendered polyline is guaranteed to visit the dot pixel for pixel.
  const from = direction === 'in' ? 0 : 1;
  const to = direction === 'in' ? 1 : 0;
  const dot = { x: dotNormX, y: dotNormY };

  const SAMPLES = 64;
  const tValues = new Set<number>();
  tValues.add(0);
  tValues.add(1);
  tValues.add(dotNormX);
  for (let i = 1; i < SAMPLES - 1; i++) tValues.add(i / (SAMPLES - 1));
  const sortedTs = Array.from(tValues).sort((a, b) => a - b);

  const points: Array<{ x: number; y: number }> = sortedTs.map((t) => {
    const gain = evaluateBezierFadeGain(dot, from, to, t);
    return { x: t * w, y: h * (1 - gain) };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${fmt(pt.x)},${fmt(pt.y)}`)
    .join(' ');

  // Mask closes back along the top edge of the body so it covers the area
  // above the gain curve (where audio is being attenuated).
  const maskPath = `${linePath} L ${fmt(w)},0 L 0,0 Z`;

  // The dot's screen position is just the dragged location — the Hermite
  // passes through it by construction, so midpointCx/Cy match the stored
  // curve point exactly.
  const midpointCx = dotNormX * w;
  const midpointCy = (1 - dotNormY) * h;

  return { linePath, maskPath, midpointCx, midpointCy };
}

/** The gain at the geometric midpoint of each preset curve, used to place
 *  the dot when the user hasn't dragged it yet. Linear is exactly 0.5;
 *  exponential is 0.25 (slow start); equal-power is sin(π/4) ≈ 0.707. */
function presetMidGain(curve: NonNullable<Clip['fadeInCurve']>, _direction: 'in' | 'out'): number {
  switch (curve) {
    case 'exponential':
      return 0.25;
    case 'equal-power':
      return Math.SQRT1_2;
    case 'linear':
    default:
      return 0.5;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface CurvePointHandleProps {
  edge: FadeEdge;
  clipId: string;
  regionLeft: number;
  regionWidthPx: number;
  /** Position on the curve as a fraction of the fade region: x in [0,1] of
   *  width, y in [0,1] of body height (0 = top = unity, 1 = bottom = silence). */
  midpointFraction: { x: number; y: number };
  fillColor: string;
  onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Small draggable circle sitting on the fade curve at its geometric midpoint.
 * Dragging it bends the bezier; double-click resets to the preset shape.
 *
 * Positioned via CSS (not SVG) because the parent SVG uses
 * `preserveAspectRatio="none"` which would distort a circle drawn inside it.
 * Hit target is 14×14 with a 4px-radius visible dot centered inside.
 */
function CurvePointHandle({
  edge,
  clipId,
  regionLeft,
  regionWidthPx,
  midpointFraction,
  fillColor,
  onMouseDown,
  onDoubleClick,
}: CurvePointHandleProps) {
  const xPx = regionLeft + clampNumber(midpointFraction.x, 0, 1) * regionWidthPx;
  // The body height isn't known at JSX time; the handle is positioned with
  // top: HEADER_RAIL + (yFraction * 100%) by stacking absolute insets.
  const yPercent = clampNumber(midpointFraction.y, 0, 1) * 100;
  return (
    <button
      type="button"
      role="slider"
      aria-label={`Fade ${edge} curve shape for clip ${clipId}`}
      aria-valuetext={`x ${midpointFraction.x.toFixed(2)} y ${(1 - midpointFraction.y).toFixed(2)}`}
      data-fade-curve-point={edge}
      className="absolute z-30 cursor-grab active:cursor-grabbing focus:outline-none"
      style={{
        left: xPx - CURVE_POINT_HIT_TARGET_PX / 2,
        top: `calc(${HEADER_RAIL_HEIGHT_PX}px + (100% - ${HEADER_RAIL_HEIGHT_PX}px) * ${yPercent / 100} - ${CURVE_POINT_HIT_TARGET_PX / 2}px)`,
        width: CURVE_POINT_HIT_TARGET_PX,
        height: CURVE_POINT_HIT_TARGET_PX,
        background: 'transparent',
        border: 'none',
        padding: 0,
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <span
        aria-hidden
        className="block rounded-full"
        style={{
          width: CURVE_POINT_VISUAL_RADIUS_PX * 2,
          height: CURVE_POINT_VISUAL_RADIUS_PX * 2,
          marginLeft: CURVE_POINT_HIT_TARGET_PX / 2 - CURVE_POINT_VISUAL_RADIUS_PX,
          marginTop: CURVE_POINT_HIT_TARGET_PX / 2 - CURVE_POINT_VISUAL_RADIUS_PX,
          backgroundColor: fillColor,
          border: '1px solid #000',
          boxSizing: 'border-box',
        }}
      />
    </button>
  );
}

function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

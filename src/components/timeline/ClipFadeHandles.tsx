import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  FADE_HANDLE_KEYBOARD_STEP,
  computeFadeFromPointer,
} from '../../utils/clipFade';
import { HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import type { Clip } from '../../types/project';

const FADE_HANDLE_SIZE_PX = 8;
const FADE_CURVE_LINE_COLOR = '#000';
const FADE_CURVE_LINE_WIDTH = 1;
const FADE_MASK_FILL = 'rgba(0, 0, 0, 0.22)';
const CURVE_POINT_HIT_TARGET_PX = 14;
const CURVE_POINT_VISUAL_RADIUS_PX = 4;
/** Constrain how far the curve can bow (clamps the normalized {x,y}). */
const CURVE_POINT_X_MIN = 0.05;
const CURVE_POINT_X_MAX = 0.95;
const CURVE_POINT_Y_MIN = 0;
const CURVE_POINT_Y_MAX = 1;

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
    const rawX = clampNumber(localX / fadePx, 0, 1);
    // y = 1 at top (unity), 0 at bottom (silence) — same semantics as the stored field.
    const rawY = clampNumber(1 - localY / regionH, 0, 1);

    // Snap the dot to the actual bezier midpoint after the control point is
    // clamped to [0, 1] × [0, 1]. Without this, when the user drags the mouse
    // toward a corner the bezier control point ends up outside the body, the
    // curve is forced toward a straight line via clamping (good — keeps the
    // line in bounds), but the dot stays at the raw drag position and ends up
    // floating off the curve. Snapping the dot to the actual bezier midpoint
    // restricts the dot to the central [0.25, 0.75]² of the fade region, which
    // is the set of midpoints achievable while keeping the control point in
    // bounds, and the dot is always on the curve.
    //
    // Math (normalized 0..1 coords, y=0 top, y=1 bottom):
    //   P0_in  = (0, 1) silenced bottom-left   P2_in  = (1, 0) unity top-right
    //   P0_out = (0, 0) unity top-left          P2_out = (1, 1) silenced bottom-right
    //   M screen = (rawX, 1 − rawY)
    //   raw P1   = 2·M − 0.5·(P0 + P2)
    //   clamped  = clamp(raw P1, [0,1]²)
    //   snapped M = 0.25·P0 + 0.5·clamped + 0.25·P2
    const p0 = edge === 'in' ? { x: 0, y: 1 } : { x: 0, y: 0 };
    const p2 = edge === 'in' ? { x: 1, y: 0 } : { x: 1, y: 1 };
    const userMidScreenX = rawX;
    const userMidScreenY = 1 - rawY; // convert gain → "y from top"
    const rawP1x = 2 * userMidScreenX - 0.5 * (p0.x + p2.x);
    const rawP1y = 2 * userMidScreenY - 0.5 * (p0.y + p2.y);
    const p1x = clampNumber(rawP1x, 0, 1);
    const p1y = clampNumber(rawP1y, 0, 1);
    const snappedScreenX = 0.25 * p0.x + 0.5 * p1x + 0.25 * p2.x;
    const snappedScreenY = 0.25 * p0.y + 0.5 * p1y + 0.25 * p2.y;

    return { x: snappedScreenX, y: 1 - snappedScreenY };
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
  curvePoint: CurvePoint | undefined,
): { linePath: string; maskPath: string; midpointCx: number; midpointCy: number } {
  const VIEWBOX_HEIGHT = 100;
  const w = widthPx;
  const h = VIEWBOX_HEIGHT;

  // Endpoints depend on direction. For both we trace the visible curve from
  // the silenced corner to the unity corner; the mask is the same path
  // closed back along the top edge.
  const start = direction === 'in' ? { x: 0, y: h } : { x: 0, y: 0 };
  const end = direction === 'in' ? { x: w, y: 0 } : { x: w, y: h };

  // Where the orange dot sits on the curve. Defaults to the visual midpoint
  // of a straight line for unset curves; for preset curves we move it so
  // the dot lies on the preset bezier; for user-dragged curves we use the
  // explicit midpoint.
  let midpointCx: number;
  let midpointCy: number;

  if (curvePoint) {
    midpointCx = clampNumber(curvePoint.x, 0, 1) * w;
    midpointCy = (1 - clampNumber(curvePoint.y, 0, 1)) * h;
  } else {
    const presetCp = direction === 'in'
      ? controlPointForFadeIn(curve, w, h)
      : controlPointForFadeOut(curve, w, h);
    // Geometric midpoint of a quadratic bezier P0, P1, P2 is at t=0.5:
    //   B(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2
    midpointCx = 0.25 * start.x + 0.5 * presetCp.cx + 0.25 * end.x;
    midpointCy = 0.25 * start.y + 0.5 * presetCp.cy + 0.25 * end.y;
  }

  // ONE smooth quadratic bezier from corner to corner. We solve for the
  // control point P1 such that the bezier passes through the user-dragged
  // midpoint at its geometric center (t = 0.5):
  //
  //   B(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midpoint
  //   →  P1 = 2·midpoint − 0.5·(P0 + P2)
  //
  // A single quadratic is C∞ smooth — there is no joint, no kink, and the
  // dot sits naturally on the curve.
  //
  // Edge handling: when the dot is dragged near a corner, the unclamped P1
  // swings outside the body rectangle and the bezier between the dot and
  // the box exits the SVG bounds, getting clipped by the parent's
  // overflow:hidden. Clamping P1 to [0, w] × [0, h] guarantees the entire
  // curve stays inside (a quadratic bezier always lies within the convex
  // hull of its three control points). At extreme dot positions the curve
  // gracefully degrades toward a straight line (P1 collapses toward an
  // endpoint), which matches the user's stated preference of "the curve
  // should approach a straight line near the corners". The dot may then
  // sit slightly off the curve, but the curve always visually connects
  // both endpoints with no truncation.
  const rawCpx = 2 * midpointCx - 0.5 * (start.x + end.x);
  const rawCpy = 2 * midpointCy - 0.5 * (start.y + end.y);
  const cpx = clampNumber(rawCpx, 0, w);
  const cpy = clampNumber(rawCpy, 0, h);

  const lineSpline = `M ${fmt(start.x)},${fmt(start.y)}`
    + ` Q ${fmt(cpx)},${fmt(cpy)} ${fmt(end.x)},${fmt(end.y)}`;

  const linePath = lineSpline;

  // Mask closes back along the top edge so it covers the area above the
  // gain curve (where audio is being attenuated).
  const maskPath = `${lineSpline} L ${fmt(w)},0 L 0,0 Z`;

  return { linePath, maskPath, midpointCx, midpointCy };
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

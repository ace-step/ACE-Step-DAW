import type { Clip } from '../types/project';

export const MIN_FADE_SECONDS = 0;
export const FADE_HANDLE_KEYBOARD_STEP = 0.1;

type FadeCurve = NonNullable<Clip['fadeInCurve']>;
type FadeDirection = 'in' | 'out';
type FadeCurvePoint = NonNullable<Clip['fadeInCurvePoint']>;

interface FadeInput {
  clipDuration: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

interface FadeShape {
  startTime: number;
  duration: number;
  from: number;
  to: number;
  curve: FadeCurve;
}

interface AudioParamLike {
  setValueAtTime: (value: number, time: number) => unknown;
  linearRampToValueAtTime?: (value: number, endTime: number) => unknown;
  exponentialRampToValueAtTime?: (value: number, endTime: number) => unknown;
  setValueCurveAtTime?: (values: number[] | Float32Array, startTime: number, duration: number) => unknown;
}

export function clampClipFadeDurations({
  clipDuration,
  fadeInDuration = 0,
  fadeOutDuration = 0,
}: FadeInput) {
  const maxDuration = Math.max(0, clipDuration);
  const clampedIn = clampNumber(fadeInDuration, MIN_FADE_SECONDS, maxDuration);
  const clampedOut = clampNumber(fadeOutDuration, MIN_FADE_SECONDS, maxDuration);

  if (clampedIn + clampedOut <= maxDuration) {
    return {
      fadeInDuration: roundFadeSeconds(clampedIn),
      fadeOutDuration: roundFadeSeconds(clampedOut),
    };
  }

  if (clampedIn >= clampedOut) {
    return {
      fadeInDuration: roundFadeSeconds(Math.max(0, maxDuration - clampedOut)),
      fadeOutDuration: roundFadeSeconds(clampedOut),
    };
  }

  return {
    fadeInDuration: roundFadeSeconds(clampedIn),
    fadeOutDuration: roundFadeSeconds(Math.max(0, maxDuration - clampedIn)),
  };
}

export function getClipFadeBounds(clip: Pick<Clip, 'duration' | 'fadeInDuration' | 'fadeOutDuration'>) {
  return clampClipFadeDurations({
    clipDuration: clip.duration,
    fadeInDuration: clip.fadeInDuration,
    fadeOutDuration: clip.fadeOutDuration,
  });
}

export function applyClipFadeAutomation(
  param: AudioParamLike,
  clip: Pick<Clip, 'startTime' | 'duration' | 'fadeInDuration' | 'fadeOutDuration' | 'fadeInCurve' | 'fadeOutCurve' | 'fadeInCurvePoint' | 'fadeOutCurvePoint'>,
  contextNow: number,
  fromTime: number,
) {
  const { fadeInDuration, fadeOutDuration } = getClipFadeBounds(clip);
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  const playStart = Math.max(fromTime, clipStart);
  const playEnd = clipEnd;

  param.setValueAtTime(getClipFadeGainAtTime(clip, playStart), contextNow);

  interface ShapeWithPoint extends FadeShape {
    curvePoint?: FadeCurvePoint;
  }
  const shapes: ShapeWithPoint[] = [];
  if (fadeInDuration > 0) {
    shapes.push({
      startTime: clipStart,
      duration: fadeInDuration,
      from: 0,
      to: 1,
      curve: clip.fadeInCurve ?? 'linear',
      curvePoint: clip.fadeInCurvePoint,
    });
  }
  if (fadeOutDuration > 0) {
    shapes.push({
      startTime: clipEnd - fadeOutDuration,
      duration: fadeOutDuration,
      from: 1,
      to: 0,
      curve: clip.fadeOutCurve ?? 'linear',
      curvePoint: clip.fadeOutCurvePoint,
    });
  }

  for (const shape of shapes) {
    const shapeStart = shape.startTime;
    const shapeEnd = shape.startTime + shape.duration;
    const segmentStart = Math.max(shapeStart, playStart);
    const segmentEnd = Math.min(shapeEnd, playEnd);
    if (segmentEnd <= segmentStart) continue;

    const segmentOffset = segmentStart - playStart;
    const automationStart = contextNow + segmentOffset;
    const startProgress = (segmentStart - shapeStart) / shape.duration;
    const endProgress = (segmentEnd - shapeStart) / shape.duration;
    const startValue = evaluateFadeShape(shape, startProgress);
    const endValue = evaluateFadeShape(shape, endProgress);

    param.setValueAtTime(startValue, automationStart);

    // Bezier curve point: rasterize and use setValueCurveAtTime so any
    // user-shaped curve is reproduced faithfully on playback.
    if (shape.curvePoint && param.setValueCurveAtTime) {
      const values = sampleBezierFadeCurve(shape.curvePoint, shape.from, shape.to, startProgress, endProgress);
      param.setValueCurveAtTime(values, automationStart, segmentEnd - segmentStart);
      continue;
    }

    if (shape.curve === 'equal-power' && param.setValueCurveAtTime) {
      const values = buildEqualPowerCurve(
        shape.from,
        shape.to,
        startProgress,
        endProgress,
      );
      param.setValueCurveAtTime(values, automationStart, segmentEnd - segmentStart);
      continue;
    }

    if (shape.curve === 'exponential' && param.exponentialRampToValueAtTime) {
      param.exponentialRampToValueAtTime(sanitizeExponentialTarget(endValue), automationStart + (segmentEnd - segmentStart));
      if (endValue === 0) {
        param.setValueAtTime(0, automationStart + (segmentEnd - segmentStart));
      }
      continue;
    }

    param.linearRampToValueAtTime?.(endValue, automationStart + (segmentEnd - segmentStart));
  }

  param.setValueAtTime(getClipFadeGainAtTime(clip, playEnd), contextNow + Math.max(0, playEnd - playStart));
}

export function getClipFadeGainAtTime(
  clip: Pick<Clip, 'startTime' | 'duration' | 'fadeInDuration' | 'fadeOutDuration' | 'fadeInCurve' | 'fadeOutCurve' | 'fadeInCurvePoint' | 'fadeOutCurvePoint'>,
  time: number,
) {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  if (time <= clipStart || time >= clipEnd) {
    return 0;
  }

  const { fadeInDuration, fadeOutDuration } = getClipFadeBounds(clip);
  let gain = 1;

  if (fadeInDuration > 0 && time < clipStart + fadeInDuration) {
    const progress = clampNumber((time - clipStart) / fadeInDuration, 0, 1);
    gain *= clip.fadeInCurvePoint
      ? evaluateBezierFadeGain(clip.fadeInCurvePoint, 0, 1, progress)
      : getCurveValue(clip.fadeInCurve ?? 'linear', 0, 1, progress);
  }

  if (fadeOutDuration > 0 && time > clipEnd - fadeOutDuration) {
    const progress = clampNumber((time - (clipEnd - fadeOutDuration)) / fadeOutDuration, 0, 1);
    gain *= clip.fadeOutCurvePoint
      ? evaluateBezierFadeGain(clip.fadeOutCurvePoint, 1, 0, progress)
      : getCurveValue(clip.fadeOutCurve ?? 'linear', 1, 0, progress);
  }

  return gain;
}

/**
 * Evaluate a fade shape (preset OR bezier control point) at a given progress.
 * Used internally to compute start/end values for the engine automation calls.
 */
function evaluateFadeShape(
  shape: { from: number; to: number; curve: FadeCurve; curvePoint?: FadeCurvePoint },
  progress: number,
): number {
  if (shape.curvePoint) {
    return evaluateBezierFadeGain(shape.curvePoint, shape.from, shape.to, progress);
  }
  return getCurveValue(shape.curve, shape.from, shape.to, progress);
}

/**
 * Evaluate a quadratic bezier fade curve at a given progress (0..1).
 *
 * The bezier's "midpoint" lives at the user-dragged control point, which is
 * stored in normalized {x, y} space where x runs along the fade duration and
 * y is the normalized gain (0 = silence, 1 = unity). For fade-in the curve
 * goes from gain 0 → 1; for fade-out from 1 → 0.
 *
 * Internally we convert the user's "midpoint at (x, y)" intent into a bezier
 * control point P1, then solve the quadratic x(t) = progress for t and
 * evaluate y(t). The control point is offset so that B(0.5) lands exactly on
 * the user-dragged position — this matches the standard DAW UX where the
 * dragged dot lies on the curve, not above it.
 */
export function evaluateBezierFadeGain(
  midpoint: FadeCurvePoint,
  from: number,
  to: number,
  progress: number,
): number {
  const t = clampNumber(progress, 0, 1);
  const isFadeIn = from < to;

  // Both fade-in and fade-out use a bezier whose x runs along [0, 1] of the
  // fade duration; only the y endpoints differ. The control point P1 is
  // derived so that the bezier passes through `midpoint` at parameter t=0.5
  // — that's the standard "drag the midpoint" UX. The x formula is the same
  // for both directions:
  //   B(0.5).x = 0.5·cpx + 0.25 = midpoint.x  →  cpx = 2·midpoint.x − 0.5
  const cpx = 2 * midpoint.x - 0.5;

  // Invert x(t) = (1 − 2cpx)·t² + 2cpx·t for t. When cpx ≈ 0.5 the quadratic
  // degenerates to x(t) = t (linear in t).
  let bezierT: number;
  if (Math.abs(1 - 2 * cpx) < 1e-9) {
    bezierT = t;
  } else {
    const a = 1 - 2 * cpx;
    const b = 2 * cpx;
    const c = -t;
    const disc = Math.max(0, b * b - 4 * a * c);
    bezierT = clampNumber((-b + Math.sqrt(disc)) / (2 * a), 0, 1);
  }

  // y(t) depends on direction. For fade-in (P0.y=0, P2.y=1):
  //   B(0.5).y = 0.5·cpy + 0.25 = midpoint.y  →  cpy = 2·midpoint.y − 0.5
  //   y(t) = 2(1−t)t·cpy + t²
  // For fade-out (P0.y=1, P2.y=0):
  //   B(0.5).y = 0.25 + 0.5·cpy = midpoint.y  →  cpy = 2·midpoint.y − 0.5
  //   y(t) = (1−t)² + 2(1−t)t·cpy
  // The control-point formula collapses to the same expression in both cases.
  const cpy = 2 * midpoint.y - 0.5;
  const oneMinusT = 1 - bezierT;

  let gain: number;
  if (isFadeIn) {
    gain = 2 * oneMinusT * bezierT * cpy + bezierT * bezierT;
  } else {
    gain = oneMinusT * oneMinusT + 2 * oneMinusT * bezierT * cpy;
  }

  return clampNumber(gain, 0, 1);
}

/**
 * Sample the bezier fade curve into an evenly-spaced gain array suitable for
 * `AudioParam.setValueCurveAtTime`. `startProgress` and `endProgress` are
 * the normalized fraction of the *full* fade region — we sample only that
 * sub-range so partial-playback (when the cursor starts inside the fade)
 * still lines up correctly.
 */
export function sampleBezierFadeCurve(
  midpoint: FadeCurvePoint,
  from: number,
  to: number,
  startProgress: number,
  endProgress: number,
  samples: number = 64,
): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = samples > 1 ? i / (samples - 1) : 0;
    const progress = startProgress + (endProgress - startProgress) * t;
    out[i] = evaluateBezierFadeGain(midpoint, from, to, progress);
  }
  return out;
}

function getCurveValue(curve: FadeCurve, from: number, to: number, progress: number) {
  const t = clampNumber(progress, 0, 1);
  if (curve === 'equal-power') {
    if (from < to) {
      return Math.sin((t * Math.PI) / 2);
    }
    return Math.cos((t * Math.PI) / 2);
  }
  if (curve === 'exponential') {
    if (from < to) {
      return t === 0 ? 0 : Math.pow(t, 2);
    }
    return t === 1 ? 0 : Math.pow(1 - t, 2);
  }
  return from + (to - from) * t;
}

function buildEqualPowerCurve(from: number, to: number, startProgress: number, endProgress: number) {
  const steps = 24;
  return Array.from({ length: steps }, (_, index) => {
    const t = startProgress + ((endProgress - startProgress) * index) / (steps - 1);
    return getCurveValue('equal-power', from, to, t);
  });
}

function sanitizeExponentialTarget(value: number) {
  return Math.max(0.0001, value);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundFadeSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

interface ComputeFadeFromPointerArgs {
  edge: FadeDirection;
  pointerX: number;
  clipRect: { left: number; right: number };
  pixelsPerSecond: number;
  clip: Pick<Clip, 'startTime' | 'duration' | 'fadeInDuration' | 'fadeOutDuration'>;
}

/**
 * Convert a pointer X coordinate into a fade duration in seconds.
 *
 * Fades are deliberately **not snapped to the beat grid**. Snapping makes the
 * drag feel like it's stepping cell-by-cell instead of sliding, and unlike
 * clip edges or notes, fades don't need rhythmic alignment — Ableton, Logic,
 * Pro Tools, and Cubase all use raw pixel positioning for fade handles.
 */
export function computeFadeFromPointer({
  edge,
  pointerX,
  clipRect,
  pixelsPerSecond,
  clip,
}: ComputeFadeFromPointerArgs): number {
  if (pixelsPerSecond <= 0) return 0;

  const rawSeconds = edge === 'in'
    ? (pointerX - clipRect.left) / pixelsPerSecond
    : (clipRect.right - pointerX) / pixelsPerSecond;

  const otherFade = edge === 'in' ? (clip.fadeOutDuration ?? 0) : (clip.fadeInDuration ?? 0);
  const maxFade = Math.max(0, clip.duration - otherFade);
  return clampNumber(rawSeconds, 0, maxFade);
}


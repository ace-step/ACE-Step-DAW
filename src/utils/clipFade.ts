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
 * Evaluate a user-shaped fade curve at a given progress (0..1) using a
 * **Fritsch–Carlson monotone cubic Hermite** interpolator through three
 * anchor points: (0, 0), the user-dragged control point, and (1, 1).
 *
 * Why not a quadratic bezier through the midpoint? Bezier-through-midpoint
 * degenerates near the corners of the [0,1]² box — the derived control
 * point P1 swings outside the box and the visible curve gets clipped or
 * "feels floaty" under drag. Why not `y = x^p`? Power curves have
 * unbounded endpoint slope at extreme exponents (shoulder glues to the
 * axis) and the drag response is highly nonlinear in (x, y).
 *
 * Fritsch–Carlson Hermite:
 *   - passes through the dot **exactly** (dot-on-curve by construction)
 *   - provably monotone (Fritsch & Carlson 1980, SIAM J. Numer. Anal.)
 *   - C¹-continuous across the dot
 *   - stays inside [0, 1]² for any (x₀, y₀) ∈ (0, 1)²
 *   - degenerates to linear when the dot is at (0.5, 0.5)
 *   - drag response is **locally linear** in dot position — this is the
 *     kinesthetic root of "direct manipulation" feel
 *
 * The curve is built as two cubic Hermite segments:
 *   left:  (0,0) → (x₀,y₀)   with slopes (s₁, d_dot)
 *   right: (x₀,y₀) → (1,1)   with slopes (d_dot, s₂)
 * where s₁ = y₀/x₀, s₂ = (1−y₀)/(1−x₀), and the slope at the dot is the
 * harmonic mean d_dot = 2·s₁·s₂ / (s₁ + s₂). Boundary slopes take the
 * segment secants (s₁ and s₂), which guarantees α = slope/secant = 1 at
 * the boundary end and α ≤ 2 at the dot end — well within Fritsch–Carlson's
 * monotonicity envelope of [0, 3] on each segment.
 *
 * For fade-out the same math is used by mirroring the y-endpoint: we
 * compute a fade-in passing through (x₀, 1−y₀) and return 1 minus the
 * result. This keeps the dot exactly on the displayed fade-out curve.
 */
export function evaluateBezierFadeGain(
  midpoint: FadeCurvePoint,
  from: number,
  to: number,
  progress: number,
): number {
  const t = clampNumber(progress, 0, 1);
  const isFadeIn = from < to;

  // Tiny margin so s₁/s₂ don't blow up when the user drags exactly onto a
  // corner. 1e-4 is well below one pixel for any realistic clip width and
  // produces slopes bounded by ~10⁴ which are still numerically safe.
  const x0 = clampNumber(midpoint.x, 1e-4, 1 - 1e-4);
  const yDot = clampNumber(midpoint.y, 1e-4, 1 - 1e-4);
  // For fade-out, the stored y is the gain at that x on a curve that goes
  // from 1 → 0. Mirror it into fade-in space (0 → 1 curve through
  // (x₀, 1−y)), evaluate, then invert the result.
  const y0 = isFadeIn ? yDot : 1 - yDot;

  const gainFadeIn = monotoneHermiteFadeIn(x0, y0, t);
  return clampNumber(isFadeIn ? gainFadeIn : 1 - gainFadeIn, 0, 1);
}

/**
 * Monotone cubic Hermite through (0,0), (x₀,y₀), (1,1). Returns the gain
 * for a fade-in curve; fade-out callers should invert the result.
 */
function monotoneHermiteFadeIn(x0: number, y0: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const s1 = y0 / x0;
  const s2 = (1 - y0) / (1 - x0);
  const dDot = (2 * s1 * s2) / (s1 + s2);

  if (x <= x0) {
    return cubicHermite(0, y0, s1, dDot, 0, x0, x);
  }
  return cubicHermite(y0, 1, dDot, s2, x0, 1, x);
}

/**
 * Evaluate a cubic Hermite segment parameterized by values (ya, yb) and
 * **derivatives with respect to x** (dya, dyb) on the interval [a, b].
 */
function cubicHermite(
  ya: number,
  yb: number,
  dya: number,
  dyb: number,
  a: number,
  b: number,
  x: number,
): number {
  const h = b - a;
  const u = (x - a) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * ya + h10 * h * dya + h01 * yb + h11 * h * dyb;
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


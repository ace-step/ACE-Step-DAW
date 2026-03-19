import type { Clip } from '../types/project';

export const MIN_FADE_SECONDS = 0;
export const FADE_HANDLE_KEYBOARD_STEP = 0.1;

type FadeCurve = NonNullable<Clip['fadeInCurve']>;

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
  setValueCurveAtTime?: (values: number[], startTime: number, duration: number) => unknown;
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
  clip: Pick<Clip, 'startTime' | 'duration' | 'fadeInDuration' | 'fadeOutDuration' | 'fadeInCurve' | 'fadeOutCurve'>,
  contextNow: number,
  fromTime: number,
) {
  const { fadeInDuration, fadeOutDuration } = getClipFadeBounds(clip);
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  const playStart = Math.max(fromTime, clipStart);
  const playEnd = clipEnd;

  param.setValueAtTime(getClipFadeGainAtTime(clip, playStart), contextNow);

  const shapes: FadeShape[] = [];
  if (fadeInDuration > 0) {
    shapes.push({
      startTime: clipStart,
      duration: fadeInDuration,
      from: 0,
      to: 1,
      curve: clip.fadeInCurve ?? 'linear',
    });
  }
  if (fadeOutDuration > 0) {
    shapes.push({
      startTime: clipEnd - fadeOutDuration,
      duration: fadeOutDuration,
      from: 1,
      to: 0,
      curve: clip.fadeOutCurve ?? 'linear',
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
    const startValue = getCurveValue(shape.curve, shape.from, shape.to, (segmentStart - shapeStart) / shape.duration);
    const endValue = getCurveValue(shape.curve, shape.from, shape.to, (segmentEnd - shapeStart) / shape.duration);

    param.setValueAtTime(startValue, automationStart);

    if (shape.curve === 'equal-power' && param.setValueCurveAtTime) {
      const values = buildEqualPowerCurve(
        shape.from,
        shape.to,
        (segmentStart - shapeStart) / shape.duration,
        (segmentEnd - shapeStart) / shape.duration,
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
  clip: Pick<Clip, 'startTime' | 'duration' | 'fadeInDuration' | 'fadeOutDuration' | 'fadeInCurve' | 'fadeOutCurve'>,
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
    gain *= getCurveValue(clip.fadeInCurve ?? 'linear', 0, 1, progress);
  }

  if (fadeOutDuration > 0 && time > clipEnd - fadeOutDuration) {
    const progress = clampNumber((time - (clipEnd - fadeOutDuration)) / fadeOutDuration, 0, 1);
    gain *= getCurveValue(clip.fadeOutCurve ?? 'linear', 1, 0, progress);
  }

  return gain;
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

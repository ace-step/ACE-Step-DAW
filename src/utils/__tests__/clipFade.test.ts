import { describe, it, expect } from 'vitest';
import {
  clampClipFadeDurations,
  getClipFadeBounds,
  getClipFadeGainAtTime,
  computeFadeFromPointer,
  MIN_FADE_SECONDS,
  FADE_HANDLE_KEYBOARD_STEP,
} from '../clipFade';

describe('clampClipFadeDurations', () => {
  it('returns unclamped values when they fit within clip duration', () => {
    const result = clampClipFadeDurations({
      clipDuration: 10,
      fadeInDuration: 2,
      fadeOutDuration: 3,
    });
    expect(result.fadeInDuration).toBe(2);
    expect(result.fadeOutDuration).toBe(3);
  });

  it('defaults fade durations to 0', () => {
    const result = clampClipFadeDurations({ clipDuration: 10 });
    expect(result.fadeInDuration).toBe(0);
    expect(result.fadeOutDuration).toBe(0);
  });

  it('clamps negative fade durations to 0', () => {
    const result = clampClipFadeDurations({
      clipDuration: 10,
      fadeInDuration: -5,
      fadeOutDuration: -3,
    });
    expect(result.fadeInDuration).toBe(0);
    expect(result.fadeOutDuration).toBe(0);
  });

  it('reduces fadeIn when total exceeds clip duration and fadeIn >= fadeOut', () => {
    const result = clampClipFadeDurations({
      clipDuration: 10,
      fadeInDuration: 8,
      fadeOutDuration: 5,
    });
    expect(result.fadeInDuration).toBe(5); // 10 - 5
    expect(result.fadeOutDuration).toBe(5);
  });

  it('reduces fadeOut when total exceeds clip duration and fadeOut > fadeIn', () => {
    const result = clampClipFadeDurations({
      clipDuration: 10,
      fadeInDuration: 3,
      fadeOutDuration: 9,
    });
    expect(result.fadeInDuration).toBe(3);
    expect(result.fadeOutDuration).toBe(7); // 10 - 3
  });

  it('handles zero clip duration', () => {
    const result = clampClipFadeDurations({
      clipDuration: 0,
      fadeInDuration: 5,
      fadeOutDuration: 5,
    });
    expect(result.fadeInDuration).toBe(0);
    expect(result.fadeOutDuration).toBe(0);
  });
});

describe('getClipFadeBounds', () => {
  it('delegates to clampClipFadeDurations', () => {
    const result = getClipFadeBounds({
      duration: 10,
      fadeInDuration: 2,
      fadeOutDuration: 3,
    });
    expect(result.fadeInDuration).toBe(2);
    expect(result.fadeOutDuration).toBe(3);
  });
});

describe('getClipFadeGainAtTime', () => {
  const clip = {
    startTime: 10,
    duration: 10,
    fadeInDuration: 2,
    fadeOutDuration: 3,
    fadeInCurve: 'linear' as const,
    fadeOutCurve: 'linear' as const,
  };

  it('returns 0 before clip start', () => {
    expect(getClipFadeGainAtTime(clip, 9)).toBe(0);
  });

  it('returns 0 after clip end', () => {
    expect(getClipFadeGainAtTime(clip, 21)).toBe(0);
  });

  it('returns 0 at clip start (fade-in begins)', () => {
    expect(getClipFadeGainAtTime(clip, 10)).toBe(0);
  });

  it('returns 0.5 at midpoint of fade-in (linear)', () => {
    expect(getClipFadeGainAtTime(clip, 11)).toBeCloseTo(0.5, 5);
  });

  it('returns 1 in the middle of the clip (no fade)', () => {
    expect(getClipFadeGainAtTime(clip, 15)).toBe(1);
  });

  it('returns ~0.33 at 2/3 through fade-out (linear)', () => {
    // fadeOut starts at 17 (20-3), ends at 20
    // at t=19: progress = (19-17)/3 = 2/3, gain = 1 - 2/3 = 1/3
    expect(getClipFadeGainAtTime(clip, 19)).toBeCloseTo(1 / 3, 5);
  });

  it('handles clip with no fades', () => {
    const noFade = {
      startTime: 0,
      duration: 10,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    };
    expect(getClipFadeGainAtTime(noFade, 5)).toBe(1);
  });

  it('handles equal-power fade-in curve', () => {
    const eqPower = {
      startTime: 0,
      duration: 10,
      fadeInDuration: 4,
      fadeOutDuration: 0,
      fadeInCurve: 'equal-power' as const,
    };
    const gain = getClipFadeGainAtTime(eqPower, 2);
    // progress = 0.5, equal-power fade-in = sin(0.5 * PI/2) = sin(PI/4) ≈ 0.707
    expect(gain).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe('constants', () => {
  it('exports MIN_FADE_SECONDS as 0', () => {
    expect(MIN_FADE_SECONDS).toBe(0);
  });

  it('exports FADE_HANDLE_KEYBOARD_STEP as 0.1', () => {
    expect(FADE_HANDLE_KEYBOARD_STEP).toBe(0.1);
  });
});

describe('computeFadeFromPointer', () => {
  const baseClip = {
    startTime: 0,
    duration: 4,
    fadeInDuration: 0,
    fadeOutDuration: 0,
  };

  it('computes fade-in duration from pointer X relative to clip left edge', () => {
    // Clip rendered at 100..500 px, 100 pps → 4s clip
    // Pointer at 200 → 1s fade-in
    const result = computeFadeFromPointer({
      edge: 'in',
      pointerX: 200,
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: baseClip,
    });
    expect(result).toBeCloseTo(1, 5);
  });

  it('computes fade-out duration from pointer X relative to clip right edge', () => {
    // Pointer at 400, right at 500 → 100px from right → 1s fade-out
    const result = computeFadeFromPointer({
      edge: 'out',
      pointerX: 400,
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: baseClip,
    });
    expect(result).toBeCloseTo(1, 5);
  });

  it('does not snap to the beat grid — fade dragging is pixel-level', () => {
    // pointer at 1.4s should stay at 1.4s, not snap to nearest beat
    const result = computeFadeFromPointer({
      edge: 'in',
      pointerX: 100 + 1.4 * 100,
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: baseClip,
    });
    expect(result).toBeCloseTo(1.4, 5);
  });

  it('clamps fade-in to [0, clipDuration - fadeOutDuration]', () => {
    // fadeOut = 1s, clip duration = 4s → max fade-in = 3s
    const result = computeFadeFromPointer({
      edge: 'in',
      pointerX: 1000, // way out of range
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: { ...baseClip, fadeOutDuration: 1 },
    });
    expect(result).toBe(3);
  });

  it('clamps to 0 when pointer is before clip start', () => {
    const result = computeFadeFromPointer({
      edge: 'in',
      pointerX: 50, // before left edge of 100
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: baseClip,
    });
    expect(result).toBe(0);
  });

  it('clamps fade-out to [0, clipDuration - fadeInDuration]', () => {
    const result = computeFadeFromPointer({
      edge: 'out',
      pointerX: 0,
      clipRect: { left: 100, right: 500 },
      pixelsPerSecond: 100,
      clip: { ...baseClip, fadeInDuration: 1 },
    });
    expect(result).toBe(3);
  });
});


import { describe, it, expect } from 'vitest';
import {
  clampClipFadeDurations,
  getClipFadeBounds,
  getClipFadeGainAtTime,
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

import { describe, it, expect } from 'vitest';
import {
  clampClipFadeDurations,
  getClipFadeBounds,
  getClipFadeGainAtTime,
  computeFadeFromPointer,
  evaluateBezierFadeGain,
  sampleBezierFadeCurve,
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

describe('evaluateBezierFadeGain', () => {
  it('returns 0 at progress 0 for fade-in (silenced corner)', () => {
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 0, 1, 0);
    expect(gain).toBeCloseTo(0, 5);
  });

  it('returns 1 at progress 1 for fade-in (unity corner)', () => {
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 0, 1, 1);
    expect(gain).toBeCloseTo(1, 5);
  });

  it('returns 1 at progress 0 for fade-out (unity corner)', () => {
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 1, 0, 0);
    expect(gain).toBeCloseTo(1, 5);
  });

  it('returns 0 at progress 1 for fade-out (silenced corner)', () => {
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 1, 0, 1);
    expect(gain).toBeCloseTo(0, 5);
  });

  it('matches a straight line when midpoint is at (0.5, 0.5)', () => {
    // Midpoint at (0.5, 0.5) should give linear gain
    expect(evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 0, 1, 0.25)).toBeCloseTo(0.25, 3);
    expect(evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 0, 1, 0.5)).toBeCloseTo(0.5, 3);
    expect(evaluateBezierFadeGain({ x: 0.5, y: 0.5 }, 0, 1, 0.75)).toBeCloseTo(0.75, 3);
  });

  it('bows the curve up when midpoint y is dragged above the diagonal', () => {
    // Midpoint at (0.5, 0.8) → at progress 0.5 the gain should be 0.8 (the user's drag position)
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.8 }, 0, 1, 0.5);
    expect(gain).toBeCloseTo(0.8, 2);
  });

  it('bows the curve down when midpoint y is dragged below the diagonal', () => {
    const gain = evaluateBezierFadeGain({ x: 0.5, y: 0.2 }, 0, 1, 0.5);
    expect(gain).toBeCloseTo(0.2, 2);
  });

  it('produces monotonic increasing values for fade-in across [0, 1]', () => {
    const point = { x: 0.7, y: 0.3 };
    let prev = evaluateBezierFadeGain(point, 0, 1, 0);
    for (let i = 1; i <= 20; i++) {
      const cur = evaluateBezierFadeGain(point, 0, 1, i / 20);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = cur;
    }
  });

  it('keeps the dot exactly on the curve at the classic log-fade corner (0.1, 0.9)', () => {
    // Near-corner position — previous power-curve impl had exploding
    // endpoint slope here; Fritsch–Carlson Hermite handles it smoothly.
    const gain = evaluateBezierFadeGain({ x: 0.1, y: 0.9 }, 0, 1, 0.1);
    expect(gain).toBeCloseTo(0.9, 3);
  });

  it('keeps the dot exactly on the curve at the classic exp-fade corner (0.9, 0.1)', () => {
    const gain = evaluateBezierFadeGain({ x: 0.9, y: 0.1 }, 0, 1, 0.9);
    expect(gain).toBeCloseTo(0.1, 3);
  });

  it('stays monotonically increasing even at extreme dot positions', () => {
    // Dense sampling at a near-corner dot — the previous power-curve +
    // Catmull-Rom polyline could wiggle visibly here.
    const point = { x: 0.05, y: 0.95 };
    let prev = evaluateBezierFadeGain(point, 0, 1, 0);
    for (let i = 1; i <= 200; i++) {
      const cur = evaluateBezierFadeGain(point, 0, 1, i / 200);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it('stays monotonically decreasing for fade-out at extreme dot positions', () => {
    const point = { x: 0.05, y: 0.95 };
    let prev = evaluateBezierFadeGain(point, 1, 0, 0);
    for (let i = 1; i <= 200; i++) {
      const cur = evaluateBezierFadeGain(point, 1, 0, i / 200);
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      prev = cur;
    }
  });

  it('never overshoots [0, 1] on either direction', () => {
    for (const point of [
      { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.1 },
      { x: 0.2, y: 0.8 },
      { x: 0.8, y: 0.2 },
      { x: 0.5, y: 0.99 },
      { x: 0.5, y: 0.01 },
    ]) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const inGain = evaluateBezierFadeGain(point, 0, 1, t);
        const outGain = evaluateBezierFadeGain(point, 1, 0, t);
        expect(inGain).toBeGreaterThanOrEqual(0);
        expect(inGain).toBeLessThanOrEqual(1);
        expect(outGain).toBeGreaterThanOrEqual(0);
        expect(outGain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fade-out dot sits exactly on the fade-out curve', () => {
    // Stored y is the gain value at that x. At t = dot.x the returned
    // gain should equal dot.y (classic fade-out through (0.3, 0.8)).
    const gain = evaluateBezierFadeGain({ x: 0.3, y: 0.8 }, 1, 0, 0.3);
    expect(gain).toBeCloseTo(0.8, 3);
  });
});

describe('sampleBezierFadeCurve', () => {
  it('samples N values across the requested progress range', () => {
    const arr = sampleBezierFadeCurve({ x: 0.5, y: 0.5 }, 0, 1, 0, 1, 8);
    expect(arr.length).toBe(8);
    expect(arr[0]).toBeCloseTo(0, 5);
    expect(arr[arr.length - 1]).toBeCloseTo(1, 5);
  });

  it('flips direction for fade-out', () => {
    const arr = sampleBezierFadeCurve({ x: 0.5, y: 0.5 }, 1, 0, 0, 1, 8);
    expect(arr[0]).toBeCloseTo(1, 5);
    expect(arr[arr.length - 1]).toBeCloseTo(0, 5);
  });

  it('returns a partial range when start/end progress are not 0/1', () => {
    // Sub-range 0.25..0.75 of a linear curve → values from 0.25 to 0.75
    const arr = sampleBezierFadeCurve({ x: 0.5, y: 0.5 }, 0, 1, 0.25, 0.75, 16);
    expect(arr[0]).toBeCloseTo(0.25, 3);
    expect(arr[arr.length - 1]).toBeCloseTo(0.75, 3);
  });
});

describe('getClipFadeGainAtTime with bezier curve point', () => {
  it('uses the bezier override instead of the preset curve', () => {
    const clip = {
      startTime: 0,
      duration: 4,
      fadeInDuration: 2,
      fadeOutDuration: 0,
      fadeInCurve: 'linear' as const,
      // Curve point bows the gain up at the midpoint
      fadeInCurvePoint: { x: 0.5, y: 0.9 },
    };
    // At time 1 (progress 0.5 through fade-in), gain should be ~0.9 from the bezier
    const gain = getClipFadeGainAtTime(clip, 1);
    expect(gain).toBeCloseTo(0.9, 2);
  });

  it('falls back to the preset curve when no point is set', () => {
    const clip = {
      startTime: 0,
      duration: 4,
      fadeInDuration: 2,
      fadeOutDuration: 0,
      fadeInCurve: 'linear' as const,
    };
    const gain = getClipFadeGainAtTime(clip, 1);
    expect(gain).toBeCloseTo(0.5, 3);
  });
});


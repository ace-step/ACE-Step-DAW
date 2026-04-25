import { describe, expect, it, vi } from 'vitest';
import { applyClipFadeAutomation, clampClipFadeDurations, getClipFadeGainAtTime } from '../../src/utils/clipFade';

function makeAudioParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
  };
}

describe('clip fade utilities', () => {
  it('clamps fade durations so they never overlap past the clip length', () => {
    expect(clampClipFadeDurations({
      clipDuration: 2,
      fadeInDuration: 1.5,
      fadeOutDuration: 1,
    })).toEqual({
      fadeInDuration: 1,
      fadeOutDuration: 1,
    });
  });

  it('returns fade gain at any clip time', () => {
    const clip = {
      startTime: 10,
      duration: 4,
      fadeInDuration: 1,
      fadeOutDuration: 2,
      fadeInCurve: 'linear' as const,
      fadeOutCurve: 'linear' as const,
    };

    expect(getClipFadeGainAtTime(clip, 10)).toBe(0);
    expect(getClipFadeGainAtTime(clip, 10.5)).toBeCloseTo(0.5);
    expect(getClipFadeGainAtTime(clip, 12)).toBe(1);
    expect(getClipFadeGainAtTime(clip, 13)).toBeCloseTo(0.5);
    expect(getClipFadeGainAtTime(clip, 14)).toBe(0);
  });

  it('schedules linear fade automation from the current seek position', () => {
    const param = makeAudioParam();
    applyClipFadeAutomation(param, {
      startTime: 4,
      duration: 6,
      fadeInDuration: 2,
      fadeOutDuration: 2,
      fadeInCurve: 'linear',
      fadeOutCurve: 'linear',
    }, 100, 5);

    expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 100);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1, 101);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0, 105);
    expect(param.setValueAtTime).toHaveBeenLastCalledWith(0, 105);
  });

  it('uses equal-power curves when available', () => {
    const param = makeAudioParam();
    applyClipFadeAutomation(param, {
      startTime: 0,
      duration: 4,
      fadeInDuration: 1,
      fadeOutDuration: 0,
      fadeInCurve: 'equal-power',
      fadeOutCurve: 'linear',
    }, 10, 0);

    expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(1);
    expect(param.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it('rasterizes the bezier curve point into setValueCurveAtTime when set', () => {
    // Regression test for #1686: the user-dragged fade curve point must be
    // rendered by the audio engine (not silently fall through to the preset
    // curve). Without curve-point propagation, the audible envelope drifts
    // from the rendered waveform.
    const param = makeAudioParam();
    applyClipFadeAutomation(param, {
      startTime: 0,
      duration: 4,
      fadeInDuration: 2,
      fadeOutDuration: 0,
      fadeInCurve: 'linear',
      fadeOutCurve: 'linear',
      fadeInCurvePoint: { x: 0.3, y: 0.8 },
    }, 10, 0);

    expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(1);
    const call = param.setValueCurveAtTime.mock.calls[0];
    const values = call[0] as Float32Array;
    const startTime = call[1] as number;
    const durationArg = call[2] as number;

    // Bezier must replace any linear ramp inside the fade-in region.
    expect(param.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(startTime).toBeCloseTo(10, 5);
    expect(durationArg).toBeCloseTo(2, 5);
    // Endpoints anchored at 0 and 1, with the dot near (0.3, 0.8) pulling
    // the curve sharply above the diagonal early.
    expect(values[0]).toBeCloseTo(0, 5);
    expect(values[values.length - 1]).toBeCloseTo(1, 3);
    // At ~30% progress the gain should be near the dragged y (0.8) — this
    // is the property the bug broke: preset curve gives 0.3, bezier gives 0.8.
    const midIdx = Math.round((values.length - 1) * 0.3);
    expect(values[midIdx]).toBeGreaterThan(0.6);
  });
});

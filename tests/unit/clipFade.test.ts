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
});

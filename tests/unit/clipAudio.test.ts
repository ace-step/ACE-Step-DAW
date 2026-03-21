import { describe, expect, it } from 'vitest';
import {
  getClipAudibleStartTime,
  getClipAudibleTimelineDuration,
  getClipPlaybackRate,
  getClipSourceSpan,
  getClipWaveformLayout,
  isClipRepitchStretched,
} from '../../src/utils/clipAudio';

describe('clip audio helpers', () => {
  it('treats non-stretched clips with contentOffset as late-starting audio', () => {
    const clip = {
      startTime: 4,
      duration: 6,
      audioDuration: 4,
      audioOffset: 0,
      contentOffset: 2,
    };

    expect(isClipRepitchStretched(clip)).toBe(false);
    expect(getClipAudibleStartTime(clip)).toBe(6);
    expect(getClipAudibleTimelineDuration(clip)).toBe(4);
    expect(getClipSourceSpan(clip)).toBe(4);
  });

  it('preserves blank tail when the clip is longer than the remaining source audio', () => {
    const clip = {
      startTime: 1,
      duration: 6,
      audioDuration: 4,
      audioOffset: 0,
      contentOffset: 0,
    };

    expect(getClipAudibleStartTime(clip)).toBe(1);
    expect(getClipAudibleTimelineDuration(clip)).toBe(4);
    expect(getClipSourceSpan(clip)).toBe(4);
    expect(getClipWaveformLayout(clip, 600)).toEqual({ leftPx: 0, widthPx: 400 });
  });

  it('renders stretched clips across the full clip width', () => {
    const clip = {
      startTime: 2,
      duration: 6,
      audioDuration: 4,
      audioOffset: 0,
      contentOffset: 1,
      timeStretchRate: 4 / 6,
      stretchMode: 'repitch' as const,
    };

    expect(isClipRepitchStretched(clip)).toBe(true);
    expect(getClipPlaybackRate(clip)).toBeCloseTo(4 / 6, 5);
    expect(getClipAudibleStartTime(clip)).toBe(2);
    expect(getClipAudibleTimelineDuration(clip)).toBe(6);
    expect(getClipSourceSpan(clip)).toBe(4);
    expect(getClipWaveformLayout(clip, 600)).toEqual({ leftPx: 0, widthPx: 600 });
  });

  it('computes waveform layout with a silent lead-in', () => {
    const clip = {
      startTime: 0,
      duration: 5,
      audioDuration: 4,
      audioOffset: 0,
      contentOffset: 1,
    };

    expect(getClipWaveformLayout(clip, 500)).toEqual({ leftPx: 100, widthPx: 400 });
  });
});

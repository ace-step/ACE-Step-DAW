import { describe, it, expect } from 'vitest';
import {
  CLIP_WAVEFORM_PEAK_COUNT,
  getClipPlaybackRate,
  isClipRepitchStretched,
  getClipContentOffset,
  getClipSourceRemaining,
  getClipAudibleTimelineDuration,
  getClipSourceSpan,
  getClipAudibleStartTime,
  getClipAudibleEndTime,
  getClipAudibleSourceEnd,
  getClipWaveformLayout,
} from '../clipAudio';

type ClipAudioState = Parameters<typeof getClipPlaybackRate>[0];

function makeClip(overrides: Partial<ClipAudioState> = {}): ClipAudioState {
  return {
    startTime: 0,
    duration: 4,
    audioDuration: 4,
    audioOffset: 0,
    contentOffset: 0,
    timeStretchRate: 1,
    stretchMode: undefined,
    ...overrides,
  };
}

describe('CLIP_WAVEFORM_PEAK_COUNT', () => {
  it('equals 1024', () => {
    expect(CLIP_WAVEFORM_PEAK_COUNT).toBe(1024);
  });
});

describe('getClipPlaybackRate', () => {
  it('returns 1 when timeStretchRate is undefined', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: undefined }))).toBe(1);
  });

  it('returns the timeStretchRate value', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: 2 }))).toBe(2);
  });

  it('returns 0.5 for half-speed', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: 0.5 }))).toBe(0.5);
  });

  it('clamps to MIN_PLAYBACK_RATE when rate is zero', () => {
    const rate = getClipPlaybackRate(makeClip({ timeStretchRate: 0 }));
    expect(rate).toBeCloseTo(0.0001, 6);
  });

  it('clamps to MIN_PLAYBACK_RATE when rate is negative', () => {
    const rate = getClipPlaybackRate(makeClip({ timeStretchRate: -5 }));
    expect(rate).toBeCloseTo(0.0001, 6);
  });
});

describe('isClipRepitchStretched', () => {
  it('returns false for default clip (rate=1, no stretchMode)', () => {
    expect(isClipRepitchStretched(makeClip())).toBe(false);
  });

  it('returns true when stretchMode is repitch', () => {
    expect(isClipRepitchStretched(makeClip({ stretchMode: 'repitch' }))).toBe(true);
  });

  it('returns true when rate differs from 1 by more than epsilon', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 1.5 }))).toBe(true);
  });

  it('returns false when rate is within epsilon of 1', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 1.00005 }))).toBe(false);
  });

  it('returns true when rate is 0 (clamped far from 1)', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 0 }))).toBe(true);
  });
});

describe('getClipContentOffset', () => {
  it('returns 0 when contentOffset is undefined', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: undefined }))).toBe(0);
  });

  it('returns 0 when contentOffset is negative', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: -2 }))).toBe(0);
  });

  it('returns contentOffset when within range', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 1, duration: 4 }))).toBe(1);
  });

  it('clamps contentOffset to clip duration', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 10, duration: 4 }))).toBe(4);
  });

  it('returns 0 for zero-duration clip', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 5, duration: 0 }))).toBe(0);
  });

  it('clamps to 0 when duration is negative', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 1, duration: -2 }))).toBe(0);
  });
});

describe('getClipSourceRemaining', () => {
  it('returns full duration when audioOffset is 0', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 10, audioOffset: 0 }))).toBe(10);
  });

  it('subtracts audioOffset from audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 10, audioOffset: 3 }))).toBe(7);
  });

  it('returns 0 when audioOffset equals audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 5, audioOffset: 5 }))).toBe(0);
  });

  it('returns 0 when audioOffset exceeds audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 5, audioOffset: 8 }))).toBe(0);
  });

  it('falls back to clip duration when audioDuration is undefined', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: undefined, duration: 6, audioOffset: 1 }))).toBe(5);
  });

  it('treats negative audioDuration as 0', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: -3, audioOffset: 0 }))).toBe(0);
  });

  it('treats negative audioOffset as 0', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 5, audioOffset: -2 }))).toBe(5);
  });

  it('treats undefined audioOffset as 0', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 8, audioOffset: undefined }))).toBe(8);
  });
});

describe('getClipAudibleTimelineDuration', () => {
  it('returns clip duration when audio covers it fully (no stretch)', () => {
    expect(getClipAudibleTimelineDuration(makeClip({ duration: 4, audioDuration: 10 }))).toBe(4);
  });

  it('returns remaining source when source is shorter than clip (no stretch)', () => {
    expect(getClipAudibleTimelineDuration(makeClip({ duration: 10, audioDuration: 3, audioOffset: 0 }))).toBe(3);
  });

  it('returns 0 when source remaining is 0', () => {
    expect(getClipAudibleTimelineDuration(makeClip({ audioDuration: 5, audioOffset: 5 }))).toBe(0);
  });

  it('accounts for contentOffset (no stretch)', () => {
    // duration=10, contentOffset=3 => audible container = 7, source=8 => min(7,8) = 7
    expect(getClipAudibleTimelineDuration(makeClip({
      duration: 10, contentOffset: 3, audioDuration: 8, audioOffset: 0,
    }))).toBe(7);
  });

  it('divides by playback rate when repitch-stretched', () => {
    // rate=2, source remaining=8, clip duration=10 => min(10, 8/2) = min(10,4) = 4
    expect(getClipAudibleTimelineDuration(makeClip({
      duration: 10, audioDuration: 8, audioOffset: 0, timeStretchRate: 2,
    }))).toBeCloseTo(4, 6);
  });

  it('handles half-speed stretch', () => {
    // rate=0.5, source remaining=4, clip duration=10 => min(10, 4/0.5) = min(10,8) = 8
    expect(getClipAudibleTimelineDuration(makeClip({
      duration: 10, audioDuration: 4, audioOffset: 0, timeStretchRate: 0.5,
    }))).toBeCloseTo(8, 6);
  });

  it('returns 0 for zero-duration clip (no stretch)', () => {
    expect(getClipAudibleTimelineDuration(makeClip({ duration: 0, audioDuration: 5 }))).toBe(0);
  });
});

describe('getClipSourceSpan', () => {
  it('returns clip duration when source is longer (no stretch)', () => {
    expect(getClipSourceSpan(makeClip({ duration: 4, audioDuration: 10, audioOffset: 0 }))).toBe(4);
  });

  it('returns source remaining when shorter than clip (no stretch)', () => {
    expect(getClipSourceSpan(makeClip({ duration: 10, audioDuration: 3, audioOffset: 0 }))).toBe(3);
  });

  it('returns 0 when source remaining is 0', () => {
    expect(getClipSourceSpan(makeClip({ audioDuration: 5, audioOffset: 5 }))).toBe(0);
  });

  it('accounts for contentOffset (no stretch)', () => {
    // duration=10, contentOffset=3 => 7 seconds of audible container, source=8 => min(8,7) = 7
    expect(getClipSourceSpan(makeClip({
      duration: 10, contentOffset: 3, audioDuration: 8, audioOffset: 0,
    }))).toBe(7);
  });

  it('multiplies by playback rate when repitch-stretched', () => {
    // rate=2, source remaining=10, clip duration=4 => min(10, 4*2) = min(10,8) = 8
    expect(getClipSourceSpan(makeClip({
      duration: 4, audioDuration: 10, audioOffset: 0, timeStretchRate: 2,
    }))).toBeCloseTo(8, 6);
  });

  it('clamps to source remaining when stretch would exceed', () => {
    // rate=2, source remaining=5, clip duration=4 => min(5, 4*2) = min(5,8) = 5
    expect(getClipSourceSpan(makeClip({
      duration: 4, audioDuration: 5, audioOffset: 0, timeStretchRate: 2,
    }))).toBe(5);
  });

  it('handles half-speed stretch', () => {
    // rate=0.5, source remaining=10, clip duration=4 => min(10, 4*0.5) = min(10,2) = 2
    expect(getClipSourceSpan(makeClip({
      duration: 4, audioDuration: 10, audioOffset: 0, timeStretchRate: 0.5,
    }))).toBeCloseTo(2, 6);
  });
});

describe('getClipAudibleStartTime', () => {
  it('returns startTime when no stretch and no contentOffset', () => {
    expect(getClipAudibleStartTime(makeClip({ startTime: 5 }))).toBe(5);
  });

  it('adds contentOffset when not stretched', () => {
    expect(getClipAudibleStartTime(makeClip({ startTime: 5, contentOffset: 2 }))).toBe(7);
  });

  it('ignores contentOffset when repitch-stretched', () => {
    expect(getClipAudibleStartTime(makeClip({
      startTime: 5, contentOffset: 2, timeStretchRate: 1.5,
    }))).toBe(5);
  });

  it('ignores contentOffset when stretchMode is repitch', () => {
    expect(getClipAudibleStartTime(makeClip({
      startTime: 5, contentOffset: 2, stretchMode: 'repitch',
    }))).toBe(5);
  });
});

describe('getClipAudibleEndTime', () => {
  it('equals startTime + audibleDuration for a simple clip', () => {
    const clip = makeClip({ startTime: 2, duration: 4, audioDuration: 10 });
    expect(getClipAudibleEndTime(clip)).toBeCloseTo(6, 6);
  });

  it('accounts for contentOffset', () => {
    const clip = makeClip({ startTime: 2, duration: 6, contentOffset: 1, audioDuration: 10 });
    // audibleStart = 2+1 = 3, audibleDuration = min(6-1, 10) = 5 => end = 8
    expect(getClipAudibleEndTime(clip)).toBeCloseTo(8, 6);
  });

  it('accounts for repitch stretch', () => {
    const clip = makeClip({ startTime: 0, duration: 10, audioDuration: 8, timeStretchRate: 2 });
    // audibleStart = 0, audibleDuration = min(10, 8/2) = 4 => end = 4
    expect(getClipAudibleEndTime(clip)).toBeCloseTo(4, 6);
  });

  it('returns startTime when source is exhausted', () => {
    const clip = makeClip({ startTime: 5, audioDuration: 3, audioOffset: 3 });
    expect(getClipAudibleEndTime(clip)).toBe(5);
  });
});

describe('getClipAudibleSourceEnd', () => {
  it('equals audioOffset + sourceSpan', () => {
    const clip = makeClip({ audioOffset: 2, audioDuration: 10, duration: 4 });
    // sourceRemaining = 8, sourceSpan = min(8, 4) = 4 => sourceEnd = 2+4 = 6
    expect(getClipAudibleSourceEnd(clip)).toBe(6);
  });

  it('returns 0 when no source remaining', () => {
    const clip = makeClip({ audioOffset: 5, audioDuration: 5 });
    expect(getClipAudibleSourceEnd(clip)).toBe(5);
  });

  it('treats undefined audioOffset as 0', () => {
    const clip = makeClip({ audioOffset: undefined, audioDuration: 10, duration: 3 });
    expect(getClipAudibleSourceEnd(clip)).toBe(3);
  });

  it('accounts for repitch stretch', () => {
    // audioOffset=1, rate=2, source remaining=9, clip duration=4 => sourceSpan = min(9, 4*2) = 8
    // sourceEnd = 1 + 8 = 9
    const clip = makeClip({ audioOffset: 1, audioDuration: 10, duration: 4, timeStretchRate: 2 });
    expect(getClipAudibleSourceEnd(clip)).toBeCloseTo(9, 6);
  });
});

describe('getClipWaveformLayout', () => {
  it('returns zero layout for zero width', () => {
    const layout = getClipWaveformLayout(makeClip(), 0);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(0);
  });

  it('returns zero layout for negative width', () => {
    const layout = getClipWaveformLayout(makeClip(), -100);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(0);
  });

  it('returns full width when repitch-stretched', () => {
    const layout = getClipWaveformLayout(makeClip({ timeStretchRate: 2 }), 200);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(200);
  });

  it('returns full width for default clip (no stretch, no contentOffset)', () => {
    const clip = makeClip({ duration: 4, audioDuration: 10, contentOffset: 0 });
    const layout = getClipWaveformLayout(clip, 200);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(200);
  });

  it('offsets leftPx by contentOffset ratio', () => {
    // duration=4, contentOffset=1 => leftPx = (1/4)*200 = 50
    // audibleDuration = min(4-1, 10) = 3 => widthPx = (3/4)*200 = 150
    const clip = makeClip({ duration: 4, audioDuration: 10, contentOffset: 1 });
    const layout = getClipWaveformLayout(clip, 200);
    expect(layout.leftPx).toBeCloseTo(50, 6);
    expect(layout.widthPx).toBeCloseTo(150, 6);
  });

  it('clamps widthPx so leftPx + widthPx does not exceed total width', () => {
    // duration=4, contentOffset=3 => leftPx = (3/4)*200 = 150
    // audibleDuration = min(4-3, 10) = 1 => widthPx = (1/4)*200 = 50
    // 150+50 = 200 => clamped to min(200-150, 50) = 50
    const clip = makeClip({ duration: 4, audioDuration: 10, contentOffset: 3 });
    const layout = getClipWaveformLayout(clip, 200);
    expect(layout.leftPx).toBeCloseTo(150, 6);
    expect(layout.widthPx).toBeCloseTo(50, 6);
  });

  it('handles case where source is shorter than remaining clip', () => {
    // duration=10, contentOffset=2, audioDuration=3, audioOffset=0
    // audibleDuration = min(10-2, 3) = 3 => widthPx = (3/10)*100 = 30
    // leftPx = (2/10)*100 = 20
    const clip = makeClip({ duration: 10, contentOffset: 2, audioDuration: 3, audioOffset: 0 });
    const layout = getClipWaveformLayout(clip, 100);
    expect(layout.leftPx).toBeCloseTo(20, 6);
    expect(layout.widthPx).toBeCloseTo(30, 6);
  });
});

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
    stretchMode: 'none',
    ...overrides,
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('CLIP_WAVEFORM_PEAK_COUNT', () => {
  it('equals 8192', () => {
    expect(CLIP_WAVEFORM_PEAK_COUNT).toBe(8192);
  });
});

// ─── getClipPlaybackRate ────────────────────────────────────────────────────

describe('getClipPlaybackRate', () => {
  it('returns 1 for default clip', () => {
    expect(getClipPlaybackRate(makeClip())).toBe(1);
  });

  it('returns the timeStretchRate when set', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: 1.5 }))).toBe(1.5);
  });

  it('defaults to 1 when timeStretchRate is undefined', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: undefined }))).toBe(1);
  });

  it('clamps to MIN_PLAYBACK_RATE when timeStretchRate is 0', () => {
    const rate = getClipPlaybackRate(makeClip({ timeStretchRate: 0 }));
    expect(rate).toBe(0.0001);
  });

  it('clamps negative rates to MIN_PLAYBACK_RATE', () => {
    const rate = getClipPlaybackRate(makeClip({ timeStretchRate: -2 }));
    expect(rate).toBe(0.0001);
  });

  it('returns very small positive rates above MIN_PLAYBACK_RATE', () => {
    expect(getClipPlaybackRate(makeClip({ timeStretchRate: 0.001 }))).toBe(0.001);
  });
});

// ─── isClipRepitchStretched ─────────────────────────────────────────────────

describe('isClipRepitchStretched', () => {
  it('returns false for default clip (rate=1, mode=none)', () => {
    expect(isClipRepitchStretched(makeClip())).toBe(false);
  });

  it('returns true when stretchMode is repitch', () => {
    expect(isClipRepitchStretched(makeClip({ stretchMode: 'repitch' }))).toBe(true);
  });

  it('returns true when rate differs from 1 significantly', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 1.5 }))).toBe(true);
  });

  it('returns false when rate is very close to 1 (within epsilon)', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 1.00005 }))).toBe(false);
  });

  it('returns true for rate < 1', () => {
    expect(isClipRepitchStretched(makeClip({ timeStretchRate: 0.5 }))).toBe(true);
  });

  it('returns true when stretchMode is repitch even with rate=1', () => {
    expect(isClipRepitchStretched(makeClip({ stretchMode: 'repitch', timeStretchRate: 1 }))).toBe(true);
  });
});

// ─── getClipContentOffset ───────────────────────────────────────────────────

describe('getClipContentOffset', () => {
  it('returns 0 for default clip', () => {
    expect(getClipContentOffset(makeClip())).toBe(0);
  });

  it('returns contentOffset when within bounds', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 1, duration: 4 }))).toBe(1);
  });

  it('clamps contentOffset to clip duration', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: 10, duration: 4 }))).toBe(4);
  });

  it('clamps negative contentOffset to 0', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: -5 }))).toBe(0);
  });

  it('handles undefined contentOffset as 0', () => {
    expect(getClipContentOffset(makeClip({ contentOffset: undefined }))).toBe(0);
  });
});

// ─── getClipSourceRemaining ─────────────────────────────────────────────────

describe('getClipSourceRemaining', () => {
  it('returns full duration for default clip', () => {
    expect(getClipSourceRemaining(makeClip())).toBe(4);
  });

  it('subtracts audioOffset from audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 10, audioOffset: 3 }))).toBe(7);
  });

  it('returns 0 when audioOffset equals audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 4, audioOffset: 4 }))).toBe(0);
  });

  it('returns 0 when audioOffset exceeds audioDuration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 4, audioOffset: 10 }))).toBe(0);
  });

  it('handles undefined audioDuration by using clip duration', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: undefined, duration: 5 }))).toBe(5);
  });

  it('handles negative audioOffset as 0', () => {
    expect(getClipSourceRemaining(makeClip({ audioDuration: 4, audioOffset: -2 }))).toBe(4);
  });
});

// ─── getClipAudibleTimelineDuration ─────────────────────────────────────────

describe('getClipAudibleTimelineDuration', () => {
  it('returns duration for default clip', () => {
    expect(getClipAudibleTimelineDuration(makeClip())).toBe(4);
  });

  it('returns 0 when source remaining is 0', () => {
    expect(getClipAudibleTimelineDuration(makeClip({ audioDuration: 0 }))).toBe(0);
  });

  it('for repitch: calculates sourceRemaining / rate', () => {
    const clip = makeClip({ stretchMode: 'repitch', timeStretchRate: 2, audioDuration: 8 });
    // sourceRemaining = 8, rate = 2, min(duration=4, 8/2=4) = 4
    expect(getClipAudibleTimelineDuration(clip)).toBe(4);
  });

  it('for repitch with short source: limited by source', () => {
    const clip = makeClip({ stretchMode: 'repitch', timeStretchRate: 0.5, audioDuration: 1 });
    // sourceRemaining = 1, rate = 0.5, min(duration=4, 1/0.5=2) = 2
    expect(getClipAudibleTimelineDuration(clip)).toBe(2);
  });

  it('for non-repitch: subtracts contentOffset', () => {
    const clip = makeClip({ contentOffset: 1, duration: 4, audioDuration: 10 });
    // duration - contentOffset = 3, sourceRemaining = 10, min(3, 10) = 3
    expect(getClipAudibleTimelineDuration(clip)).toBe(3);
  });

  it('for non-repitch: limited by source remaining', () => {
    const clip = makeClip({ contentOffset: 0, duration: 10, audioDuration: 3 });
    // duration - contentOffset = 10, sourceRemaining = 3, min(10, 3) = 3
    expect(getClipAudibleTimelineDuration(clip)).toBe(3);
  });
});

// ─── getClipSourceSpan ──────────────────────────────────────────────────────

describe('getClipSourceSpan', () => {
  it('returns duration for default clip', () => {
    expect(getClipSourceSpan(makeClip())).toBe(4);
  });

  it('returns 0 when source remaining is 0', () => {
    expect(getClipSourceSpan(makeClip({ audioDuration: 0 }))).toBe(0);
  });

  it('for repitch: calculates duration * rate', () => {
    const clip = makeClip({ stretchMode: 'repitch', timeStretchRate: 2, audioDuration: 20 });
    // sourceRemaining = 20, duration * rate = 4 * 2 = 8, min(20, 8) = 8
    expect(getClipSourceSpan(clip)).toBe(8);
  });

  it('for repitch: limited by source remaining', () => {
    const clip = makeClip({ stretchMode: 'repitch', timeStretchRate: 2, audioDuration: 3 });
    // sourceRemaining = 3, duration * rate = 4 * 2 = 8, min(3, 8) = 3
    expect(getClipSourceSpan(clip)).toBe(3);
  });

  it('for non-repitch: uses duration minus contentOffset', () => {
    const clip = makeClip({ contentOffset: 1, duration: 4, audioDuration: 10 });
    // sourceRemaining = 10, duration - contentOffset = 3, min(10, 3) = 3
    expect(getClipSourceSpan(clip)).toBe(3);
  });
});

// ─── getClipAudibleStartTime ────────────────────────────────────────────────

describe('getClipAudibleStartTime', () => {
  it('returns startTime for default clip', () => {
    expect(getClipAudibleStartTime(makeClip({ startTime: 5 }))).toBe(5);
  });

  it('adds contentOffset for non-repitch clips', () => {
    expect(getClipAudibleStartTime(makeClip({ startTime: 5, contentOffset: 1 }))).toBe(6);
  });

  it('does NOT add contentOffset for repitch clips', () => {
    expect(getClipAudibleStartTime(makeClip({ startTime: 5, contentOffset: 1, stretchMode: 'repitch' }))).toBe(5);
  });
});

// ─── getClipAudibleEndTime ──────────────────────────────────────────────────

describe('getClipAudibleEndTime', () => {
  it('returns startTime + duration for default clip', () => {
    expect(getClipAudibleEndTime(makeClip({ startTime: 2 }))).toBe(6);
  });

  it('accounts for contentOffset', () => {
    const clip = makeClip({ startTime: 2, contentOffset: 1, duration: 4, audioDuration: 10 });
    // audibleStart = 2 + 1 = 3, audibleDuration = min(3, 10) = 3, end = 3 + 3 = 6
    expect(getClipAudibleEndTime(clip)).toBe(6);
  });

  it('accounts for repitch stretching', () => {
    const clip = makeClip({ startTime: 0, stretchMode: 'repitch', timeStretchRate: 2, audioDuration: 4 });
    // audibleStart = 0, audibleDuration = min(4, 4/2=2) = 2, end = 0 + 2 = 2
    expect(getClipAudibleEndTime(clip)).toBe(2);
  });
});

// ─── getClipAudibleSourceEnd ────────────────────────────────────────────────

describe('getClipAudibleSourceEnd', () => {
  it('returns audioDuration for default clip (audioOffset=0, span=duration)', () => {
    expect(getClipAudibleSourceEnd(makeClip({ audioDuration: 4 }))).toBe(4);
  });

  it('adds audioOffset to source span', () => {
    const clip = makeClip({ audioOffset: 2, audioDuration: 10, duration: 4 });
    // sourceSpan = min(10-2, 4) = 4, audioOffset + span = 2 + 4 = 6
    expect(getClipAudibleSourceEnd(clip)).toBe(6);
  });

  it('returns audioOffset when source is exhausted', () => {
    expect(getClipAudibleSourceEnd(makeClip({ audioOffset: 10, audioDuration: 5 }))).toBe(10);
  });
});

// ─── getClipWaveformLayout ──────────────────────────────────────────────────

describe('getClipWaveformLayout', () => {
  it('returns full width for default clip', () => {
    const layout = getClipWaveformLayout(makeClip(), 200);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(200);
  });

  it('returns zero dimensions for zero width', () => {
    const layout = getClipWaveformLayout(makeClip(), 0);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(0);
  });

  it('returns zero dimensions for negative width', () => {
    const layout = getClipWaveformLayout(makeClip(), -10);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(0);
  });

  it('returns full width for repitch clips', () => {
    const clip = makeClip({ stretchMode: 'repitch', timeStretchRate: 2 });
    const layout = getClipWaveformLayout(clip, 200);
    expect(layout.leftPx).toBe(0);
    expect(layout.widthPx).toBe(200);
  });

  it('offsets waveform for contentOffset on non-repitch clips', () => {
    const clip = makeClip({ contentOffset: 1, duration: 4, audioDuration: 10 });
    const layout = getClipWaveformLayout(clip, 200);
    // leftPx = (1/4) * 200 = 50
    expect(layout.leftPx).toBe(50);
    // audibleDuration = min(3, 10) = 3, widthPx = (3/4) * 200 = 150
    expect(layout.widthPx).toBe(150);
  });

  it('clamps widthPx to not exceed available space', () => {
    const clip = makeClip({ contentOffset: 3.5, duration: 4, audioDuration: 10 });
    const layout = getClipWaveformLayout(clip, 200);
    // leftPx = (3.5/4) * 200 = 175
    expect(layout.leftPx).toBeCloseTo(175, 1);
    // audibleDuration = min(0.5, 10) = 0.5, widthPx = (0.5/4) * 200 = 25
    expect(layout.widthPx).toBe(25);
  });
});

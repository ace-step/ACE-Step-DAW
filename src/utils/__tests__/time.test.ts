import { describe, it, expect } from 'vitest';
import {
  secondsToBeats,
  beatsToSeconds,
  secondsToBarsBeats,
  formatTime,
  formatBarsBeats,
  snapToGrid,
  getBarDuration,
  getBeatDuration,
} from '../time';

describe('secondsToBeats', () => {
  it('converts 0 seconds to 0 beats', () => {
    expect(secondsToBeats(0, 120)).toBe(0);
  });

  it('converts 1 second at 120 BPM to 2 beats', () => {
    expect(secondsToBeats(1, 120)).toBe(2);
  });

  it('converts 30 seconds at 60 BPM to 30 beats', () => {
    expect(secondsToBeats(30, 60)).toBe(30);
  });

  it('converts 2.5 seconds at 120 BPM to 5 beats', () => {
    expect(secondsToBeats(2.5, 120)).toBe(5);
  });
});

describe('beatsToSeconds', () => {
  it('converts 0 beats to 0 seconds', () => {
    expect(beatsToSeconds(0, 120)).toBe(0);
  });

  it('converts 2 beats at 120 BPM to 1 second', () => {
    expect(beatsToSeconds(2, 120)).toBe(1);
  });

  it('is the inverse of secondsToBeats', () => {
    const bpm = 140;
    const seconds = 7.5;
    expect(beatsToSeconds(secondsToBeats(seconds, bpm), bpm)).toBeCloseTo(seconds);
  });
});

describe('secondsToBarsBeats', () => {
  it('returns bar 1, beat 1 at time 0', () => {
    const result = secondsToBarsBeats(0, 120, 4);
    expect(result).toEqual({ bars: 1, beats: 1, ticks: 0 });
  });

  it('returns bar 2 after 4 beats at 120 BPM in 4/4', () => {
    // 4 beats at 120 BPM = 2 seconds
    const result = secondsToBarsBeats(2, 120, 4);
    expect(result.bars).toBe(2);
    expect(result.beats).toBe(1);
  });

  it('handles fractional beats with ticks', () => {
    // 0.25 seconds at 120 BPM = 0.5 beats → bar 1, beat 1, ticks 50
    const result = secondsToBarsBeats(0.25, 120, 4);
    expect(result.bars).toBe(1);
    expect(result.beats).toBe(1);
    expect(result.ticks).toBe(50);
  });

  it('respects denominator when formatting bar beats', () => {
    const result = secondsToBarsBeats(1, 120, 4, undefined, undefined, 8);
    expect(result).toEqual({ bars: 2, beats: 1, ticks: 0 });
  });
});

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('0:00.0');
  });

  it('formats 90.5 seconds as 1:30.5', () => {
    expect(formatTime(90.5)).toBe('1:30.5');
  });

  it('formats 5.25 seconds', () => {
    expect(formatTime(5.25)).toBe('0:05.3'); // 5.25 rounds to 5.3 with toFixed(1)
  });
});

describe('formatBarsBeats', () => {
  it('formats time 0 as 1.1.00', () => {
    expect(formatBarsBeats(0, 120, 4)).toBe('1.1.00');
  });
});

describe('snapToGrid', () => {
  it('snaps to the nearest beat at 120 BPM', () => {
    const beatDuration = 0.5; // 60/120
    // 0.3 seconds is closer to 0.5 (1 beat) than 0 (0 beats)
    expect(snapToGrid(0.3, 120, 1)).toBeCloseTo(0.5);
  });

  it('snaps to 0 when closer to 0', () => {
    expect(snapToGrid(0.1, 120, 1)).toBeCloseTo(0);
  });

  it('snaps to 16th note grid', () => {
    // 16th note at 120 BPM = 0.5 * 0.25 = 0.125s grid
    const result = snapToGrid(0.13, 120, 0.25);
    expect(result).toBeCloseTo(0.125);
  });
});

describe('getBarDuration', () => {
  it('returns 2 seconds for 120 BPM in 4/4', () => {
    expect(getBarDuration(120, 4)).toBe(2);
  });

  it('returns 1.5 seconds for 120 BPM in 3/4', () => {
    expect(getBarDuration(120, 3)).toBe(1.5);
  });

  it('returns 1 second for 120 BPM in 4/8', () => {
    expect(getBarDuration(120, 4, 8)).toBe(1);
  });
});

describe('getBeatDuration', () => {
  it('returns 0.5 seconds at 120 BPM', () => {
    expect(getBeatDuration(120)).toBe(0.5);
  });

  it('returns 1 second at 60 BPM', () => {
    expect(getBeatDuration(60)).toBe(1);
  });
});

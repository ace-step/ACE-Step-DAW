import { describe, it, expect } from 'vitest';
import { computeCrossfadeRegions, getCrossfadeGainAtTime } from '../crossfade';

describe('computeCrossfadeRegions', () => {
  it('returns empty array for fewer than 2 clips', () => {
    expect(computeCrossfadeRegions([])).toEqual([]);
    expect(computeCrossfadeRegions([{ id: 'a', startTime: 0, duration: 5 }])).toEqual([]);
  });

  it('returns empty when clips do not overlap', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 5 },
      { id: 'b', startTime: 5, duration: 5 },
    ];
    expect(computeCrossfadeRegions(clips)).toEqual([]);
  });

  it('detects a simple overlap between two clips', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 6 },
      { id: 'b', startTime: 4, duration: 6 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      clipAId: 'a',
      clipBId: 'b',
      startTime: 4,
      endTime: 6,
      duration: 2,
    });
  });

  it('handles unsorted input', () => {
    const clips = [
      { id: 'b', startTime: 4, duration: 6 },
      { id: 'a', startTime: 0, duration: 6 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0].clipAId).toBe('a');
    expect(regions[0].clipBId).toBe('b');
  });

  it('detects multiple overlaps', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 5 },
      { id: 'b', startTime: 3, duration: 5 },
      { id: 'c', startTime: 6, duration: 5 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(2);
    expect(regions[0].clipAId).toBe('a');
    expect(regions[0].clipBId).toBe('b');
    expect(regions[1].clipAId).toBe('b');
    expect(regions[1].clipBId).toBe('c');
  });

  it('handles clip B fully contained in clip A', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 10 },
      { id: 'b', startTime: 2, duration: 3 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0].duration).toBe(3);
  });
});

describe('getCrossfadeGainAtTime', () => {
  describe('linear curve', () => {
    it('returns 0 at start for fade-in', () => {
      expect(getCrossfadeGainAtTime(0, 10, 0, 'in', 'linear')).toBe(0);
    });

    it('returns 1 at end for fade-in', () => {
      expect(getCrossfadeGainAtTime(0, 10, 10, 'in', 'linear')).toBe(1);
    });

    it('returns 0.5 at midpoint for fade-in', () => {
      expect(getCrossfadeGainAtTime(0, 10, 5, 'in', 'linear')).toBe(0.5);
    });

    it('returns 1 at start for fade-out', () => {
      expect(getCrossfadeGainAtTime(0, 10, 0, 'out', 'linear')).toBe(1);
    });

    it('returns 0 at end for fade-out', () => {
      expect(getCrossfadeGainAtTime(0, 10, 10, 'out', 'linear')).toBe(0);
    });
  });

  describe('equal-power curve', () => {
    it('returns 0 at start for fade-in', () => {
      expect(getCrossfadeGainAtTime(0, 10, 0, 'in', 'equal-power')).toBe(0);
    });

    it('returns 1 at end for fade-in', () => {
      expect(getCrossfadeGainAtTime(0, 10, 10, 'in', 'equal-power')).toBeCloseTo(1, 5);
    });

    it('returns ~0.707 at midpoint for fade-in (equal power)', () => {
      const gain = getCrossfadeGainAtTime(0, 10, 5, 'in', 'equal-power');
      expect(gain).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('returns ~0.707 at midpoint for fade-out (equal power)', () => {
      const gain = getCrossfadeGainAtTime(0, 10, 5, 'out', 'equal-power');
      expect(gain).toBeCloseTo(Math.SQRT1_2, 5);
    });
  });

  it('clamps time to region bounds', () => {
    expect(getCrossfadeGainAtTime(5, 15, 0, 'in')).toBe(0);
    expect(getCrossfadeGainAtTime(5, 15, 20, 'in')).toBe(1);
  });

  it('handles zero-duration region', () => {
    expect(getCrossfadeGainAtTime(5, 5, 5, 'in')).toBe(1);
    expect(getCrossfadeGainAtTime(5, 5, 5, 'out')).toBe(0);
  });
});

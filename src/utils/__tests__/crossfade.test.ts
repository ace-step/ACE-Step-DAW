import { describe, it, expect } from 'vitest';
import {
  computeCrossfadeRegions,
  getCrossfadeGainAtTime,
} from '../crossfade';

describe('computeCrossfadeRegions', () => {
  it('returns empty array for empty clip list', () => {
    expect(computeCrossfadeRegions([])).toEqual([]);
  });

  it('returns empty array for a single clip', () => {
    expect(
      computeCrossfadeRegions([{ id: 'a', startTime: 0, duration: 4 }]),
    ).toEqual([]);
  });

  it('returns empty array when two clips do not overlap', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 2 },
      { id: 'b', startTime: 3, duration: 2 },
    ];
    expect(computeCrossfadeRegions(clips)).toEqual([]);
  });

  it('returns empty array when two clips are exactly adjacent (no overlap)', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 2 },
      { id: 'b', startTime: 2, duration: 2 },
    ];
    expect(computeCrossfadeRegions(clips)).toEqual([]);
  });

  it('detects overlap between two clips', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 4 },
      { id: 'b', startTime: 3, duration: 4 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0].clipAId).toBe('a');
    expect(regions[0].clipBId).toBe('b');
    expect(regions[0].startTime).toBe(3);
    expect(regions[0].endTime).toBe(4);
    expect(regions[0].duration).toBe(1);
  });

  it('handles clips passed in unsorted order', () => {
    const clips = [
      { id: 'b', startTime: 3, duration: 4 },
      { id: 'a', startTime: 0, duration: 4 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0].clipAId).toBe('a');
    expect(regions[0].clipBId).toBe('b');
    expect(regions[0].startTime).toBe(3);
    expect(regions[0].endTime).toBe(4);
    expect(regions[0].duration).toBe(1);
  });

  it('detects when clip B is fully contained within clip A', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 10 },
      { id: 'b', startTime: 2, duration: 3 },
    ];
    const regions = computeCrossfadeRegions(clips);
    expect(regions).toHaveLength(1);
    expect(regions[0].startTime).toBe(2);
    expect(regions[0].endTime).toBe(5);
    expect(regions[0].duration).toBe(3);
  });

  it('detects multiple pairwise overlaps among three clips', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 5 },
      { id: 'b', startTime: 3, duration: 5 },
      { id: 'c', startTime: 4, duration: 5 },
    ];
    const regions = computeCrossfadeRegions(clips);
    // a overlaps b (3-5), a overlaps c (4-5), b overlaps c (4-8)
    expect(regions).toHaveLength(3);

    const ab = regions.find((r) => r.clipAId === 'a' && r.clipBId === 'b')!;
    expect(ab.startTime).toBe(3);
    expect(ab.endTime).toBe(5);
    expect(ab.duration).toBe(2);

    const ac = regions.find((r) => r.clipAId === 'a' && r.clipBId === 'c')!;
    expect(ac.startTime).toBe(4);
    expect(ac.endTime).toBe(5);
    expect(ac.duration).toBe(1);

    const bc = regions.find((r) => r.clipAId === 'b' && r.clipBId === 'c')!;
    expect(bc.startTime).toBe(4);
    expect(bc.endTime).toBe(8);
    expect(bc.duration).toBe(4);
  });

  it('handles zero-duration clips (no overlap produced)', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 0 },
      { id: 'b', startTime: 0, duration: 0 },
    ];
    expect(computeCrossfadeRegions(clips)).toEqual([]);
  });

  it('returns regions sorted by start time', () => {
    const clips = [
      { id: 'a', startTime: 0, duration: 6 },
      { id: 'b', startTime: 2, duration: 6 },
      { id: 'c', startTime: 5, duration: 6 },
    ];
    const regions = computeCrossfadeRegions(clips);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].startTime).toBeGreaterThanOrEqual(
        regions[i - 1].startTime,
      );
    }
  });
});

describe('getCrossfadeGainAtTime', () => {
  describe('linear curve', () => {
    it('returns 0 at the start for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 0, 'in', 'linear')).toBe(0);
    });

    it('returns 1 at the end for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 4, 'in', 'linear')).toBe(1);
    });

    it('returns 0.5 at midpoint for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 2, 'in', 'linear')).toBe(0.5);
    });

    it('returns 1 at the start for direction=out', () => {
      expect(getCrossfadeGainAtTime(0, 4, 0, 'out', 'linear')).toBe(1);
    });

    it('returns 0 at the end for direction=out', () => {
      expect(getCrossfadeGainAtTime(0, 4, 4, 'out', 'linear')).toBe(0);
    });

    it('returns 0.5 at midpoint for direction=out', () => {
      expect(getCrossfadeGainAtTime(0, 4, 2, 'out', 'linear')).toBe(0.5);
    });

    it('returns 0.25 at quarter point for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 1, 'in', 'linear')).toBe(0.25);
    });

    it('returns 0.75 at quarter point for direction=out', () => {
      expect(getCrossfadeGainAtTime(0, 4, 1, 'out', 'linear')).toBe(0.75);
    });

    it('in + out gains sum to 1.0 at any point (linear)', () => {
      const times = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
      for (const t of times) {
        const gainIn = getCrossfadeGainAtTime(0, 4, t, 'in', 'linear');
        const gainOut = getCrossfadeGainAtTime(0, 4, t, 'out', 'linear');
        expect(gainIn + gainOut).toBeCloseTo(1.0, 10);
      }
    });
  });

  describe('equal-power curve', () => {
    it('returns 0 at the start for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 0, 'in', 'equal-power')).toBe(0);
    });

    it('returns 1 at the end for direction=in', () => {
      expect(getCrossfadeGainAtTime(0, 4, 4, 'in', 'equal-power')).toBe(1);
    });

    it('returns 1 at the start for direction=out', () => {
      expect(getCrossfadeGainAtTime(0, 4, 0, 'out', 'equal-power')).toBe(1);
    });

    it('returns 0 at the end for direction=out', () => {
      expect(
        getCrossfadeGainAtTime(0, 4, 4, 'out', 'equal-power'),
      ).toBeCloseTo(0, 10);
    });

    it('returns sin(pi/4) at midpoint for direction=in', () => {
      const expected = Math.sin(Math.PI / 4); // ~0.7071
      expect(
        getCrossfadeGainAtTime(0, 4, 2, 'in', 'equal-power'),
      ).toBeCloseTo(expected, 10);
    });

    it('returns cos(pi/4) at midpoint for direction=out', () => {
      const expected = Math.cos(Math.PI / 4); // ~0.7071
      expect(
        getCrossfadeGainAtTime(0, 4, 2, 'out', 'equal-power'),
      ).toBeCloseTo(expected, 10);
    });

    it('preserves equal power: in^2 + out^2 = 1 at any point', () => {
      const times = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
      for (const t of times) {
        const gainIn = getCrossfadeGainAtTime(0, 4, t, 'in', 'equal-power');
        const gainOut = getCrossfadeGainAtTime(0, 4, t, 'out', 'equal-power');
        expect(gainIn ** 2 + gainOut ** 2).toBeCloseTo(1.0, 10);
      }
    });

    it('equal-power gain at quarter point matches sin/cos formula', () => {
      // progress = 0.25, sin(0.25 * pi/2) = sin(pi/8)
      const expectedIn = Math.sin(Math.PI / 8);
      const expectedOut = Math.cos(Math.PI / 8);
      expect(
        getCrossfadeGainAtTime(0, 4, 1, 'in', 'equal-power'),
      ).toBeCloseTo(expectedIn, 10);
      expect(
        getCrossfadeGainAtTime(0, 4, 1, 'out', 'equal-power'),
      ).toBeCloseTo(expectedOut, 10);
    });
  });

  describe('default curve parameter', () => {
    it('defaults to linear when curve is omitted', () => {
      expect(getCrossfadeGainAtTime(0, 4, 2, 'in')).toBe(0.5);
      expect(getCrossfadeGainAtTime(0, 4, 2, 'out')).toBe(0.5);
    });
  });

  describe('edge cases', () => {
    it('clamps time before region start to 0 progress', () => {
      expect(getCrossfadeGainAtTime(2, 6, 0, 'in', 'linear')).toBe(0);
      expect(getCrossfadeGainAtTime(2, 6, 0, 'out', 'linear')).toBe(1);
    });

    it('clamps time after region end to 1 progress', () => {
      expect(getCrossfadeGainAtTime(2, 6, 10, 'in', 'linear')).toBe(1);
      expect(getCrossfadeGainAtTime(2, 6, 10, 'out', 'linear')).toBe(0);
    });

    it('handles zero-length crossfade (regionStart == regionEnd)', () => {
      // duration <= 0: returns 1 for 'in', 0 for 'out'
      expect(getCrossfadeGainAtTime(3, 3, 3, 'in', 'linear')).toBe(1);
      expect(getCrossfadeGainAtTime(3, 3, 3, 'out', 'linear')).toBe(0);
      expect(getCrossfadeGainAtTime(3, 3, 3, 'in', 'equal-power')).toBe(1);
      expect(getCrossfadeGainAtTime(3, 3, 3, 'out', 'equal-power')).toBe(0);
    });

    it('handles negative duration (regionEnd < regionStart)', () => {
      expect(getCrossfadeGainAtTime(5, 2, 3, 'in')).toBe(1);
      expect(getCrossfadeGainAtTime(5, 2, 3, 'out')).toBe(0);
    });

    it('works with non-zero region start offset', () => {
      // Region [10, 14], time=12 => progress=0.5
      expect(getCrossfadeGainAtTime(10, 14, 12, 'in', 'linear')).toBe(0.5);
      expect(getCrossfadeGainAtTime(10, 14, 12, 'out', 'linear')).toBe(0.5);
    });

    it('works with fractional times', () => {
      // Region [0.5, 1.5], time=1.0 => progress=0.5
      expect(getCrossfadeGainAtTime(0.5, 1.5, 1.0, 'in', 'linear')).toBe(0.5);
      expect(getCrossfadeGainAtTime(0.5, 1.5, 1.0, 'out', 'linear')).toBe(0.5);
    });

    it('gain values are always between 0 and 1', () => {
      const times = [-5, 0, 1, 2, 3, 4, 10];
      for (const t of times) {
        for (const dir of ['in', 'out'] as const) {
          for (const curve of ['linear', 'equal-power'] as const) {
            const gain = getCrossfadeGainAtTime(0, 4, t, dir, curve);
            expect(gain).toBeGreaterThanOrEqual(0);
            expect(gain).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });
});

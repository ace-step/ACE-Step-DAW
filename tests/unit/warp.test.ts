import { describe, expect, it } from 'vitest';
import {
  calcTempoMatchRate,
  getEffectivePlaybackRate,
  getStretchedDuration,
} from '../../src/utils/warp';

describe('calcTempoMatchRate', () => {
  it('returns targetBpm / sourceBpm for valid inputs', () => {
    expect(calcTempoMatchRate(120, 140)).toBeCloseTo(140 / 120);
    expect(calcTempoMatchRate(100, 100)).toBe(1);
    expect(calcTempoMatchRate(140, 70)).toBeCloseTo(0.5);
  });

  it('returns 1 when sourceBpm is zero or missing', () => {
    expect(calcTempoMatchRate(0, 120)).toBe(1);
    expect(calcTempoMatchRate(-10, 120)).toBe(1);
  });

  it('returns 1 when targetBpm is zero or missing', () => {
    expect(calcTempoMatchRate(120, 0)).toBe(1);
    expect(calcTempoMatchRate(120, -5)).toBe(1);
  });
});

describe('getEffectivePlaybackRate', () => {
  it('returns explicit timeStretchRate when set', () => {
    expect(getEffectivePlaybackRate({ timeStretchRate: 2 }, 120)).toBe(2);
  });

  it('prefers timeStretchRate over sourceBpm', () => {
    expect(
      getEffectivePlaybackRate({ timeStretchRate: 0.5, sourceBpm: 100 }, 120),
    ).toBe(0.5);
  });

  it('calculates rate from sourceBpm when timeStretchRate is not set', () => {
    expect(
      getEffectivePlaybackRate({ sourceBpm: 100 }, 120),
    ).toBeCloseTo(1.2);
  });

  it('returns 1 when neither timeStretchRate nor sourceBpm is set', () => {
    expect(getEffectivePlaybackRate({}, 120)).toBe(1);
  });

  it('returns 1 when timeStretchRate is 0 and no sourceBpm', () => {
    expect(getEffectivePlaybackRate({ timeStretchRate: 0 }, 120)).toBe(1);
  });
});

describe('getStretchedDuration', () => {
  it('halves duration when rate is 2', () => {
    expect(getStretchedDuration(10, 2)).toBe(5);
  });

  it('doubles duration when rate is 0.5', () => {
    expect(getStretchedDuration(10, 0.5)).toBe(20);
  });

  it('returns original duration when rate is 1', () => {
    expect(getStretchedDuration(10, 1)).toBe(10);
  });

  it('returns original duration when rate is 0 or negative', () => {
    expect(getStretchedDuration(10, 0)).toBe(10);
    expect(getStretchedDuration(10, -1)).toBe(10);
  });
});

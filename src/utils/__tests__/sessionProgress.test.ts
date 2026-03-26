import { describe, expect, it } from 'vitest';
import { getSessionSlotProgress } from '../sessionProgress';

describe('getSessionSlotProgress', () => {
  it('returns progress 0 at launch time', () => {
    const result = getSessionSlotProgress(2, 2, 4);
    expect(result.progress).toBeCloseTo(0);
    expect(result.loopCount).toBe(1);
  });

  it('returns progress 0.5 at halfway through first loop', () => {
    const result = getSessionSlotProgress(4, 2, 4);
    expect(result.progress).toBeCloseTo(0.5);
    expect(result.loopCount).toBe(1);
  });

  it('returns correct loop count on second loop', () => {
    const result = getSessionSlotProgress(7, 2, 4);
    expect(result.progress).toBeCloseTo(0.25);
    expect(result.loopCount).toBe(2);
  });

  it('handles zero duration gracefully', () => {
    const result = getSessionSlotProgress(5, 2, 0);
    expect(result.progress).toBe(0);
    expect(result.loopCount).toBe(1);
  });

  it('handles currentTime before launchedAt', () => {
    const result = getSessionSlotProgress(1, 2, 4);
    expect(result.progress).toBeCloseTo(0);
    expect(result.loopCount).toBe(1);
  });

  it('handles negative duration gracefully', () => {
    const result = getSessionSlotProgress(5, 2, -3);
    expect(result.progress).toBe(0);
    expect(result.loopCount).toBe(1);
  });

  it('returns progress near 1 just before loop boundary', () => {
    const result = getSessionSlotProgress(5.9, 2, 4);
    expect(result.progress).toBeCloseTo(0.975);
    expect(result.loopCount).toBe(1);
  });

  it('returns progress 0 at exact loop boundary (start of second loop)', () => {
    const result = getSessionSlotProgress(6, 2, 4);
    expect(result.progress).toBeCloseTo(0);
    expect(result.loopCount).toBe(2);
  });
});

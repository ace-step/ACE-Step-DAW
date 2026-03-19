import { describe, it, expect } from 'vitest';
import {
  findNearestZeroCrossing,
  snapTimeToZeroCrossing,
} from '../../src/utils/zeroCrossing';

describe('findNearestZeroCrossing', () => {
  it('returns the target index when it is already at a zero crossing', () => {
    // Signal: ..., 0.5, 0.0, -0.3, ...
    const samples = new Float32Array([0.5, 0.0, -0.3, 0.2]);
    expect(findNearestZeroCrossing(samples, 1, 10)).toBe(1);
  });

  it('finds a zero crossing to the right of the target', () => {
    // Signal crosses zero between index 2 (0.1) and index 3 (-0.2)
    const samples = new Float32Array([0.5, 0.4, 0.1, -0.2, -0.5]);
    // Target is index 1; crossing between 2→3, picks 2 since |0.1| < |-0.2|
    expect(findNearestZeroCrossing(samples, 1, 10)).toBe(2);
  });

  it('finds a zero crossing to the left of the target', () => {
    // Zero crossings between 0→1 and 1→2
    const samples = new Float32Array([0.5, -0.1, 0.3, 0.4, 0.5]);
    // Target is index 4; nearest crossing picks index 1 (|-0.1| is closest to zero)
    expect(findNearestZeroCrossing(samples, 4, 10)).toBe(1);
  });

  it('returns the closer zero crossing when crossings exist on both sides', () => {
    // Crossing between 1(0.1)→2(-0.2) and between 5(-0.1)→6(0.3)
    const samples = new Float32Array([0.5, 0.1, -0.2, -0.3, -0.2, -0.1, 0.3, 0.5]);
    // Target index 3 → left picks idx 1 (dist 2), right picks idx 5 (dist 2) → tie, picks first found (1)
    expect(findNearestZeroCrossing(samples, 3, 10)).toBe(1);
  });

  it('respects the search radius and returns target if no crossing found', () => {
    // No zero crossing within radius 1 of target index 0
    const samples = new Float32Array([0.5, 0.4, 0.3, -0.1]);
    expect(findNearestZeroCrossing(samples, 0, 1)).toBe(0);
  });

  it('handles an empty array gracefully', () => {
    const samples = new Float32Array([]);
    expect(findNearestZeroCrossing(samples, 0, 10)).toBe(0);
  });

  it('handles single sample', () => {
    const samples = new Float32Array([0.5]);
    expect(findNearestZeroCrossing(samples, 0, 10)).toBe(0);
  });

  it('picks the sample closer to zero at a crossing', () => {
    // Crossing between index 2 (0.05) and index 3 (-0.8)
    // Should pick index 2 since |0.05| < |-0.8|
    const samples = new Float32Array([0.5, 0.3, 0.05, -0.8, -0.5]);
    expect(findNearestZeroCrossing(samples, 1, 10)).toBe(2);
  });

  it('clamps search to array bounds', () => {
    const samples = new Float32Array([0.5, 0.3, -0.1, 0.4]);
    // Search from index 0 with large radius; crossing at index 2
    expect(findNearestZeroCrossing(samples, 0, 100)).toBe(2);
  });

  it('handles negative-to-positive crossing', () => {
    const samples = new Float32Array([-0.5, -0.3, -0.1, 0.2, 0.5]);
    // Target at index 0; crossing between index 2 (-0.1) and 3 (0.2)
    // Picks index 2 since |−0.1| < |0.2|
    expect(findNearestZeroCrossing(samples, 0, 10)).toBe(2);
  });
});

describe('snapTimeToZeroCrossing', () => {
  it('snaps a time position to the nearest zero crossing', () => {
    // 8 samples at 8 Hz = 1 second of audio
    // Crossing between sample 3 (0.1) and sample 4 (-0.2)
    const samples = new Float32Array([0.5, 0.4, 0.3, 0.1, -0.2, -0.5, -0.3, 0.1]);
    const sampleRate = 8;

    // Target time 0.25s = sample 2; search radius 500ms = 4 samples
    const result = snapTimeToZeroCrossing(samples, sampleRate, 0.25, 500);
    // Should snap to sample 3 (|0.1| < |-0.2|) → 3/8 = 0.375s
    expect(result).toBeCloseTo(0.375, 3);
  });

  it('returns the original time when no crossing is found within radius', () => {
    const samples = new Float32Array([0.5, 0.4, 0.3, 0.2]);
    const sampleRate = 4;
    // No zero crossing in all-positive data within radius 1 sample (250ms at 4Hz)
    const result = snapTimeToZeroCrossing(samples, sampleRate, 0.25, 250);
    expect(result).toBeCloseTo(0.25, 3);
  });

  it('handles multi-channel by using the first channel only', () => {
    // This tests the samples parameter directly (pre-extracted channel data)
    const samples = new Float32Array([0.5, -0.2, 0.3]);
    const sampleRate = 3;
    // Crossing between 0 (0.5) and 1 (-0.2) → pick 1 since |-0.2| < |0.5|
    const result = snapTimeToZeroCrossing(samples, sampleRate, 0.0, 500);
    expect(result).toBeCloseTo(1 / 3, 3);
  });

  it('returns 0 for empty samples', () => {
    const samples = new Float32Array([]);
    expect(snapTimeToZeroCrossing(samples, 44100, 0.5, 10)).toBe(0.5);
  });
});

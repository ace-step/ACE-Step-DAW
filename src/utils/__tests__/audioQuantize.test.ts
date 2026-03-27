import { describe, it, expect } from 'vitest';
import {
  detectTransients,
  computeWarpMarkers,
  type WarpMarker,
} from '../audioQuantize';

describe('detectTransients', () => {
  it('returns empty array for empty input', () => {
    const peaks = new Float32Array(0);
    expect(detectTransients(peaks, 44100)).toEqual([]);
  });

  it('returns empty array for silent audio', () => {
    const peaks = new Float32Array(4096); // all zeros
    expect(detectTransients(peaks, 44100)).toEqual([]);
  });

  it('detects a single transient from a sharp onset', () => {
    const sampleRate = 44100;
    const length = 44100; // 1 second
    const peaks = new Float32Array(length);
    // Insert a sharp onset at sample 10000
    for (let i = 10000; i < 10512; i++) {
      peaks[i] = 0.8;
    }
    const transients = detectTransients(peaks, sampleRate);
    expect(transients.length).toBeGreaterThanOrEqual(1);
    // The first transient should be near 10000/44100 seconds
    expect(transients[0]).toBeGreaterThan(0.15);
    expect(transients[0]).toBeLessThan(0.35);
  });

  it('respects minGapMs to avoid double-detection', () => {
    const sampleRate = 44100;
    const length = 44100;
    const peaks = new Float32Array(length);
    // Two onsets very close together (20ms apart ~ 882 samples)
    for (let i = 5000; i < 5512; i++) peaks[i] = 0.9;
    for (let i = 5882; i < 6394; i++) peaks[i] = 0.9;

    // With large minGapMs, should get at most 1 transient from this region
    const transients = detectTransients(peaks, sampleRate, { minGapMs: 100 });
    // Filter to just the transients near our onset region
    const nearby = transients.filter((t) => t > 0.1 && t < 0.2);
    expect(nearby.length).toBeLessThanOrEqual(1);
  });

  it('sensitivity controls detection threshold', () => {
    const sampleRate = 44100;
    const length = 44100;
    const peaks = new Float32Array(length);
    // Quiet onset
    for (let i = 10000; i < 10512; i++) peaks[i] = 0.15;

    const lowSens = detectTransients(peaks, sampleRate, { sensitivity: 0.5 });
    const highSens = detectTransients(peaks, sampleRate, { sensitivity: 0.05 });
    // Higher sensitivity threshold should detect fewer or equal transients
    expect(lowSens.length).toBeLessThanOrEqual(highSens.length);
  });

  it('returns times in seconds relative to start', () => {
    const sampleRate = 44100;
    const length = 88200; // 2 seconds
    const peaks = new Float32Array(length);
    for (let i = 44100; i < 44612; i++) peaks[i] = 0.9;

    const transients = detectTransients(peaks, sampleRate);
    for (const t of transients) {
      expect(typeof t).toBe('number');
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(2);
    }
  });
});

describe('computeWarpMarkers', () => {
  it('returns empty array for empty transients', () => {
    expect(computeWarpMarkers([], 120)).toEqual([]);
  });

  it('returns empty array for invalid bpm', () => {
    expect(computeWarpMarkers([0.5], 0)).toEqual([]);
    expect(computeWarpMarkers([0.5], -10)).toEqual([]);
  });

  it('returns empty array for invalid gridDivision', () => {
    expect(computeWarpMarkers([0.5], 120, 0)).toEqual([]);
    expect(computeWarpMarkers([0.5], 120, -1)).toEqual([]);
  });

  it('skips transients already on the grid', () => {
    // At 120 BPM, quarter note = 0.5s. Grid positions: 0, 0.5, 1.0, 1.5...
    const transients = [0.0, 0.5, 1.0];
    const markers = computeWarpMarkers(transients, 120, 1);
    expect(markers.length).toBe(0);
  });

  it('snaps off-grid transients to nearest grid line at full strength', () => {
    // 120 BPM, quarter note grid. Grid at 0, 0.5, 1.0
    const transients = [0.48]; // close to 0.5
    const markers = computeWarpMarkers(transients, 120, 1, 1.0);
    expect(markers.length).toBe(1);
    expect(markers[0].originalTime).toBe(0.48);
    expect(markers[0].quantizedTime).toBeCloseTo(0.5, 10);
  });

  it('applies partial strength correctly', () => {
    // 120 BPM, quarter note grid at 0.5s
    const transients = [0.4]; // 0.1s before grid line at 0.5
    const markers = computeWarpMarkers(transients, 120, 1, 0.5);
    expect(markers.length).toBe(1);
    // diff = 0.5 - 0.4 = 0.1, quantized = 0.4 + 0.1*0.5 = 0.45
    expect(markers[0].originalTime).toBe(0.4);
    expect(markers[0].quantizedTime).toBeCloseTo(0.45, 10);
  });

  it('clamps strength to 0-1 range', () => {
    const transients = [0.4];
    // strength > 1 should be clamped to 1
    const markers = computeWarpMarkers(transients, 120, 1, 2.0);
    expect(markers.length).toBe(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.5, 10);

    // strength < 0 should be clamped to 0 (no change)
    const noMove = computeWarpMarkers(transients, 120, 1, -1.0);
    expect(noMove.length).toBe(1);
    expect(noMove[0].quantizedTime).toBeCloseTo(0.4, 10);
  });

  it('handles 8th note grid division', () => {
    // 120 BPM, 8th note = 0.25s. Grid: 0, 0.25, 0.5, 0.75, 1.0
    const transients = [0.22]; // near 0.25
    const markers = computeWarpMarkers(transients, 120, 0.5, 1.0);
    expect(markers.length).toBe(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.25, 10);
  });

  it('handles 16th note grid division', () => {
    // 120 BPM, 16th note = 0.125s. Grid: 0, 0.125, 0.25, ...
    const transients = [0.11]; // near 0.125
    const markers = computeWarpMarkers(transients, 120, 0.25, 1.0);
    expect(markers.length).toBe(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.125, 10);
  });

  it('preserves marker interface shape', () => {
    const markers = computeWarpMarkers([0.3], 120, 1, 1.0);
    expect(markers.length).toBe(1);
    const m: WarpMarker = markers[0];
    expect(typeof m.originalTime).toBe('number');
    expect(typeof m.quantizedTime).toBe('number');
  });
});

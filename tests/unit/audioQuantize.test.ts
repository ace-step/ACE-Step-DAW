import { describe, expect, it } from 'vitest';
import {
  detectTransients,
  computeWarpMarkers,
} from '../../src/utils/audioQuantize';

describe('detectTransients', () => {
  it('returns empty array for silent audio', () => {
    const peaks = new Float32Array(1000); // all zeros
    const result = detectTransients(peaks, 44100);
    expect(result).toEqual([]);
  });

  it('detects a single sharp transient', () => {
    // Silence then a sudden spike
    const peaks = new Float32Array(4410); // 0.1s at 44100
    // Place a sharp onset at sample 2205 (0.05s)
    for (let i = 2205; i < 2250; i++) {
      peaks[i] = 0.9;
    }
    const result = detectTransients(peaks, 44100);
    expect(result.length).toBe(1);
    // Transient should be near 0.05s
    expect(result[0]).toBeCloseTo(0.05, 1);
  });

  it('detects multiple transients', () => {
    const sampleRate = 44100;
    const duration = 1.0; // 1 second
    const peaks = new Float32Array(sampleRate * duration);
    // Place 4 transients at 0.1s, 0.3s, 0.5s, 0.7s
    const positions = [0.1, 0.3, 0.5, 0.7];
    for (const pos of positions) {
      const startSample = Math.floor(pos * sampleRate);
      for (let i = startSample; i < startSample + 50; i++) {
        peaks[i] = 0.8;
      }
    }
    const result = detectTransients(peaks, sampleRate);
    expect(result.length).toBe(4);
    for (let i = 0; i < positions.length; i++) {
      expect(result[i]).toBeCloseTo(positions[i], 1);
    }
  });

  it('respects sensitivity parameter', () => {
    const sampleRate = 44100;
    const peaks = new Float32Array(sampleRate);
    // Medium transient at 0.2s — fill a full window (512 samples) at amplitude 0.3
    const start = Math.floor(0.2 * sampleRate);
    for (let i = start; i < start + 512; i++) {
      peaks[i] = 0.3;
    }
    // High sensitivity (low threshold) should detect it
    const highSens = detectTransients(peaks, sampleRate, { sensitivity: 0.05 });
    expect(highSens.length).toBe(1);
    // Low sensitivity (high threshold) should miss it
    const lowSens = detectTransients(peaks, sampleRate, { sensitivity: 0.5 });
    expect(lowSens.length).toBe(0);
  });

  it('enforces minimum gap between transients', () => {
    const sampleRate = 44100;
    const peaks = new Float32Array(sampleRate);
    // Two transients very close together (10ms apart)
    const pos1 = Math.floor(0.2 * sampleRate);
    const pos2 = Math.floor(0.21 * sampleRate);
    for (let i = pos1; i < pos1 + 30; i++) peaks[i] = 0.8;
    for (let i = pos2; i < pos2 + 30; i++) peaks[i] = 0.9;
    // With default minGap (~50ms), should only get one
    const result = detectTransients(peaks, sampleRate, { minGapMs: 50 });
    expect(result.length).toBe(1);
  });
});

describe('computeWarpMarkers', () => {
  const bpm = 120; // beat = 0.5s

  it('returns empty array for no transients', () => {
    const result = computeWarpMarkers([], bpm, 1);
    expect(result).toEqual([]);
  });

  it('snaps transients to nearest beat with full strength', () => {
    // Transients slightly off-grid
    const transients = [0.48, 1.03]; // should snap to 0.5 and 1.0
    const result = computeWarpMarkers(transients, bpm, 1, 1.0);
    expect(result).toHaveLength(2);
    expect(result[0].originalTime).toBe(0.48);
    expect(result[0].quantizedTime).toBeCloseTo(0.5, 5);
    expect(result[1].originalTime).toBe(1.03);
    expect(result[1].quantizedTime).toBeCloseTo(1.0, 5);
  });

  it('respects strength parameter (partial quantize)', () => {
    const transients = [0.4]; // nearest beat = 0.5, diff = 0.1
    const result = computeWarpMarkers(transients, bpm, 1, 0.5);
    expect(result).toHaveLength(1);
    // Should move halfway: 0.4 + 0.5 * (0.5 - 0.4) = 0.45
    expect(result[0].quantizedTime).toBeCloseTo(0.45, 5);
  });

  it('uses grid division for finer grid', () => {
    // 1/4 note grid at 120 BPM = 0.5s, 1/8 note = 0.25s
    const transients = [0.23]; // nearest 1/8 = 0.25
    const result = computeWarpMarkers(transients, bpm, 0.5, 1.0);
    expect(result).toHaveLength(1);
    expect(result[0].quantizedTime).toBeCloseTo(0.25, 5);
  });

  it('does not create markers for already-on-grid transients', () => {
    const transients = [0.5, 1.0]; // exactly on beat
    const result = computeWarpMarkers(transients, bpm, 1, 1.0);
    // Already on grid — no warp needed
    expect(result).toHaveLength(0);
  });

  it('handles 16th note grid', () => {
    // 1/16 at 120 BPM = 0.125s grid
    const transients = [0.13]; // nearest 1/16 = 0.125
    const result = computeWarpMarkers(transients, bpm, 0.25, 1.0);
    expect(result).toHaveLength(1);
    expect(result[0].quantizedTime).toBeCloseTo(0.125, 5);
  });
});

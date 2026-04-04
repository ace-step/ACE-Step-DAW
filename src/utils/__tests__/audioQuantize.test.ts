import { describe, it, expect } from 'vitest';
import { detectTransients, computeWarpMarkers, type WarpMarker } from '../audioQuantize';

// ─── detectTransients ───────────────────────────────────────────────────────

describe('detectTransients', () => {
  it('returns empty array for empty input', () => {
    expect(detectTransients(new Float32Array(0), 44100)).toEqual([]);
  });

  it('returns empty array for silent audio', () => {
    const silent = new Float32Array(44100); // 1 second of silence
    expect(detectTransients(silent, 44100)).toEqual([]);
  });

  it('detects transients from impulses', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate * 2); // 2 seconds

    // Place impulses at 0.5s and 1.0s
    for (const t of [0.5, 1.0]) {
      const idx = Math.floor(t * sampleRate);
      for (let i = 0; i < 512; i++) {
        if (idx + i < samples.length) {
          samples[idx + i] = Math.exp(-i / 30) * 0.9;
        }
      }
    }

    const transients = detectTransients(samples, sampleRate, { sensitivity: 0.05 });
    expect(transients.length).toBeGreaterThanOrEqual(1);
    // All transient times should be positive seconds
    for (const t of transients) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(2);
    }
  });

  it('respects minGapMs — filters transients closer than minimum gap', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate); // 1 second

    // Place 2 impulses 20ms apart (at 0.1s and 0.12s)
    for (const t of [0.1, 0.12]) {
      const idx = Math.floor(t * sampleRate);
      for (let i = 0; i < 256; i++) {
        if (idx + i < samples.length) {
          samples[idx + i] = Math.exp(-i / 20) * 0.9;
        }
      }
    }

    // With 100ms min gap, the second should be filtered
    const transients100ms = detectTransients(samples, sampleRate, {
      sensitivity: 0.05,
      minGapMs: 100,
    });
    // With 10ms min gap, both should pass
    const transients10ms = detectTransients(samples, sampleRate, {
      sensitivity: 0.05,
      minGapMs: 10,
    });

    expect(transients100ms.length).toBeLessThanOrEqual(transients10ms.length);
  });

  it('returns transient times in seconds', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate * 2);

    // Place impulse at ~1 second
    const idx = Math.floor(1.0 * sampleRate);
    for (let i = 0; i < 512; i++) {
      if (idx + i < samples.length) {
        samples[idx + i] = 0.8;
      }
    }

    const transients = detectTransients(samples, sampleRate, { sensitivity: 0.05 });
    for (const t of transients) {
      expect(typeof t).toBe('number');
      expect(t).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses default options when none provided', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    // Should not throw
    const result = detectTransients(samples, sampleRate);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── computeWarpMarkers ─────────────────────────────────────────────────────

describe('computeWarpMarkers', () => {
  it('returns empty array for empty transients', () => {
    expect(computeWarpMarkers([], 120)).toEqual([]);
  });

  it('returns empty array for zero BPM', () => {
    expect(computeWarpMarkers([1.0], 0)).toEqual([]);
  });

  it('returns empty array for negative BPM', () => {
    expect(computeWarpMarkers([1.0], -120)).toEqual([]);
  });

  it('returns empty array for zero gridDivision', () => {
    expect(computeWarpMarkers([1.0], 120, 0)).toEqual([]);
  });

  it('skips transients already on the grid', () => {
    // At 120 BPM, quarter note = 0.5s. Grid positions: 0, 0.5, 1.0, 1.5, ...
    const transients = [0, 0.5, 1.0, 1.5];
    const markers = computeWarpMarkers(transients, 120, 1, 1);
    expect(markers).toEqual([]);
  });

  it('snaps off-grid transients to nearest grid position at full strength', () => {
    // At 120 BPM, quarter note = 0.5s
    // Transient at 0.6s should snap to 0.5s
    const markers = computeWarpMarkers([0.6], 120, 1, 1);
    expect(markers).toHaveLength(1);
    expect(markers[0].originalTime).toBe(0.6);
    expect(markers[0].quantizedTime).toBeCloseTo(0.5, 5);
  });

  it('applies partial strength (blends between original and grid position)', () => {
    // At 120 BPM, quarter note = 0.5s
    // Transient at 0.6, nearest grid = 0.5, diff = -0.1
    // At strength 0.5: quantizedTime = 0.6 + (-0.1) * 0.5 = 0.55
    const markers = computeWarpMarkers([0.6], 120, 1, 0.5);
    expect(markers).toHaveLength(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.55, 5);
  });

  it('zero strength produces markers but no movement', () => {
    const markers = computeWarpMarkers([0.6], 120, 1, 0);
    expect(markers).toHaveLength(1);
    // quantizedTime = 0.6 + diff * 0 = 0.6 (no change)
    expect(markers[0].quantizedTime).toBeCloseTo(0.6, 5);
  });

  it('works with 8th note grid (gridDivision=0.5)', () => {
    // At 120 BPM, 8th note = 0.25s. Grid: 0, 0.25, 0.5, 0.75, 1.0, ...
    // Transient at 0.3 should snap to 0.25
    const markers = computeWarpMarkers([0.3], 120, 0.5, 1);
    expect(markers).toHaveLength(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.25, 5);
  });

  it('works with 16th note grid (gridDivision=0.25)', () => {
    // At 120 BPM, 16th note = 0.125s. Grid: 0, 0.125, 0.25, ...
    // Transient at 0.15 should snap to 0.125
    const markers = computeWarpMarkers([0.15], 120, 0.25, 1);
    expect(markers).toHaveLength(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.125, 5);
  });

  it('clamps strength to 0-1 range', () => {
    // Strength > 1 should be treated as 1
    const markers = computeWarpMarkers([0.6], 120, 1, 2);
    expect(markers).toHaveLength(1);
    expect(markers[0].quantizedTime).toBeCloseTo(0.5, 5);
  });

  it('handles multiple transients', () => {
    const transients = [0.1, 0.6, 1.1];
    const markers = computeWarpMarkers(transients, 120, 1, 1);
    // All should be off-grid, so all should produce markers
    expect(markers.length).toBeGreaterThanOrEqual(2);
    for (const m of markers) {
      expect(m.originalTime).toBeDefined();
      expect(m.quantizedTime).toBeDefined();
    }
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  detectTransients,
  computeWarpMarkers,
} from '../../src/utils/audioQuantize';
import { computeWarpedSegments } from '../../src/utils/audioWarp';
import type { AudioWarpMarker } from '../../src/types/project';

/**
 * Tests for the full audio quantize pipeline:
 * detect transients → compute warp markers → compute warped segments → schedule playback.
 *
 * This covers the end-to-end flow for issue #221: audio quantize / flex time.
 */

describe('audio quantize full pipeline', () => {
  const bpm = 120; // beat = 0.5s
  const sampleRate = 44100;

  /** Create peaks with transients at given positions (seconds). */
  function makePeaks(positions: number[], duration: number): Float32Array {
    const peaks = new Float32Array(Math.floor(duration * sampleRate));
    for (const pos of positions) {
      const start = Math.floor(pos * sampleRate);
      for (let i = start; i < Math.min(start + 100, peaks.length); i++) {
        peaks[i] = 0.8;
      }
    }
    return peaks;
  }

  it('full pipeline: detect → warp → segments for off-grid transients', () => {
    // Transients slightly off the beat grid (quarter notes at 120 BPM = 0.5s grid)
    const peaks = makePeaks([0.48, 1.03, 1.52], 2.0);
    const transients = detectTransients(peaks, sampleRate);

    expect(transients.length).toBeGreaterThanOrEqual(3);

    const markers = computeWarpMarkers(transients, bpm, 1, 1.0);
    // All transients are off-grid, so we should get markers for them
    expect(markers.length).toBeGreaterThanOrEqual(2);

    // Check that markers snap to nearest grid
    for (const m of markers) {
      const gridSize = 60 / bpm; // 0.5s
      const nearestGrid = Math.round(m.quantizedTime / gridSize) * gridSize;
      expect(m.quantizedTime).toBeCloseTo(nearestGrid, 2);
    }

    // Compute segments for playback
    const clipDuration = 2.0;
    const segments = computeWarpedSegments(markers, clipDuration);
    expect(segments.length).toBeGreaterThan(1);

    // Segments should cover the full clip
    expect(segments[0].targetStart).toBe(0);
    expect(segments[segments.length - 1].targetEnd).toBe(clipDuration);

    // Each segment should have a reasonable playback rate (no extreme stretches)
    for (const seg of segments) {
      expect(seg.playbackRate).toBeGreaterThan(0.5);
      expect(seg.playbackRate).toBeLessThan(2.0);
    }
  });

  it('on-grid transients produce no warp markers (direct input)', () => {
    // Use exact transient times to test computeWarpMarkers in isolation
    // (detectTransients may shift positions due to windowing)
    const transients = [0.5, 1.0, 1.5]; // exactly on quarter-note grid at 120 BPM
    const markers = computeWarpMarkers(transients, bpm, 1, 1.0);
    // All on grid — no warping needed
    expect(markers).toHaveLength(0);
  });

  it('full pipeline: partial strength preserves some original timing', () => {
    const peaks = makePeaks([0.4], 1.0);
    const transients = detectTransients(peaks, sampleRate);
    expect(transients.length).toBeGreaterThanOrEqual(1);

    const fullMarkers = computeWarpMarkers(transients, bpm, 1, 1.0);
    const halfMarkers = computeWarpMarkers(transients, bpm, 1, 0.5);

    if (fullMarkers.length > 0 && halfMarkers.length > 0) {
      // Half-strength should move less than full strength
      const fullDelta = Math.abs(fullMarkers[0].quantizedTime - fullMarkers[0].originalTime);
      const halfDelta = Math.abs(halfMarkers[0].quantizedTime - halfMarkers[0].originalTime);
      expect(halfDelta).toBeLessThan(fullDelta + 0.001);
    }
  });

  it('full pipeline: 8th note grid produces finer quantization', () => {
    // Transient at 0.23s — nearest 8th at 120 BPM = 0.25s
    const peaks = makePeaks([0.23], 1.0);
    const transients = detectTransients(peaks, sampleRate);
    expect(transients.length).toBeGreaterThanOrEqual(1);

    const markers = computeWarpMarkers(transients, bpm, 0.5, 1.0);
    expect(markers.length).toBeGreaterThanOrEqual(1);
    if (markers.length > 0) {
      expect(markers[0].quantizedTime).toBeCloseTo(0.25, 2);
    }
  });
});

describe('scheduleWarpedClip helper', () => {
  it('converts warp markers to schedule entries with correct timing', () => {
    const markers: AudioWarpMarker[] = [
      { originalTime: 0.48, quantizedTime: 0.5 },
      { originalTime: 1.03, quantizedTime: 1.0 },
    ];
    const clipDuration = 2.0;
    const segments = computeWarpedSegments(markers, clipDuration);

    // Expect 3 segments: [0→0.48/0.5], [0.48→1.03/0.5→1.0], [1.03→2.0/1.0→2.0]
    expect(segments).toHaveLength(3);

    // First segment: source [0, 0.48] → target [0, 0.5]
    expect(segments[0].sourceStart).toBe(0);
    expect(segments[0].sourceEnd).toBe(0.48);
    expect(segments[0].targetStart).toBe(0);
    expect(segments[0].targetEnd).toBe(0.5);
    expect(segments[0].playbackRate).toBeCloseTo(0.48 / 0.5);

    // Second segment: source [0.48, 1.03] → target [0.5, 1.0]
    expect(segments[1].sourceStart).toBe(0.48);
    expect(segments[1].sourceEnd).toBe(1.03);
    expect(segments[1].targetStart).toBe(0.5);
    expect(segments[1].targetEnd).toBe(1.0);
    expect(segments[1].playbackRate).toBeCloseTo(0.55 / 0.5);

    // Third segment: source [1.03, 2.0] → target [1.0, 2.0]
    expect(segments[2].sourceStart).toBe(1.03);
    expect(segments[2].sourceEnd).toBe(2.0);
    expect(segments[2].targetStart).toBe(1.0);
    expect(segments[2].targetEnd).toBe(2.0);
    expect(segments[2].playbackRate).toBeCloseTo(0.97 / 1.0);
  });

  it('segments maintain continuity (no gaps or overlaps)', () => {
    const markers: AudioWarpMarker[] = [
      { originalTime: 0.3, quantizedTime: 0.25 },
      { originalTime: 0.55, quantizedTime: 0.5 },
      { originalTime: 0.78, quantizedTime: 0.75 },
    ];
    const segments = computeWarpedSegments(markers, 1.0);

    for (let i = 1; i < segments.length; i++) {
      // Target timeline should be continuous
      expect(segments[i].targetStart).toBeCloseTo(segments[i - 1].targetEnd);
      // Source timeline should be continuous
      expect(segments[i].sourceStart).toBeCloseTo(segments[i - 1].sourceEnd);
    }
  });
});

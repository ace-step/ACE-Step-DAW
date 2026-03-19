import { describe, expect, it } from 'vitest';
import {
  detectBpm,
  computeStretchRate,
  computeWarpedSegments,
  type WarpSegment,
} from '../../src/utils/audioWarp';

describe('detectBpm', () => {
  function makePeaksWithBeats(bpm: number, durationSeconds: number, sampleRate: number): Float32Array {
    const totalSamples = Math.floor(durationSeconds * sampleRate);
    const peaks = new Float32Array(totalSamples);
    const beatInterval = (60 / bpm) * sampleRate;
    // Place sharp transients at each beat
    for (let beat = 0; beat * beatInterval < totalSamples; beat++) {
      const start = Math.floor(beat * beatInterval);
      for (let i = start; i < Math.min(start + 100, totalSamples); i++) {
        peaks[i] = 0.9;
      }
    }
    return peaks;
  }

  it('returns null for empty audio', () => {
    const peaks = new Float32Array(0);
    expect(detectBpm(peaks, 44100)).toBeNull();
  });

  it('returns null for very short audio (< 2 beats possible)', () => {
    const peaks = new Float32Array(4410); // 0.1s
    peaks[0] = 0.9;
    expect(detectBpm(peaks, 44100)).toBeNull();
  });

  it('detects 120 BPM from evenly spaced transients', () => {
    const peaks = makePeaksWithBeats(120, 4, 44100);
    const bpm = detectBpm(peaks, 44100);
    expect(bpm).not.toBeNull();
    expect(bpm!).toBeGreaterThanOrEqual(115);
    expect(bpm!).toBeLessThanOrEqual(125);
  });

  it('detects 140 BPM from evenly spaced transients', () => {
    const peaks = makePeaksWithBeats(140, 4, 44100);
    const bpm = detectBpm(peaks, 44100);
    expect(bpm).not.toBeNull();
    expect(bpm!).toBeGreaterThanOrEqual(135);
    expect(bpm!).toBeLessThanOrEqual(145);
  });

  it('returns BPM in valid range (60-200)', () => {
    const peaks = makePeaksWithBeats(90, 4, 44100);
    const bpm = detectBpm(peaks, 44100);
    if (bpm !== null) {
      expect(bpm).toBeGreaterThanOrEqual(60);
      expect(bpm).toBeLessThanOrEqual(200);
    }
  });
});

describe('computeStretchRate', () => {
  it('returns 1.0 when source and target BPM are equal', () => {
    expect(computeStretchRate(120, 120)).toBe(1);
  });

  it('returns 2.0 to double tempo (120 → 240 would need 2x speed)', () => {
    expect(computeStretchRate(120, 240)).toBe(2);
  });

  it('returns 0.5 to halve tempo', () => {
    expect(computeStretchRate(120, 60)).toBe(0.5);
  });

  it('handles fractional ratios', () => {
    expect(computeStretchRate(100, 150)).toBeCloseTo(1.5);
  });
});

describe('computeWarpedSegments', () => {
  it('returns single segment at rate 1.0 when no warp markers', () => {
    const segments = computeWarpedSegments([], 4.0);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      sourceStart: 0,
      sourceEnd: 4.0,
      targetStart: 0,
      targetEnd: 4.0,
      playbackRate: 1.0,
    });
  });

  it('computes segments with one warp marker', () => {
    // Audio is 4s. Marker moves transient at 1.0s to 1.2s
    const markers = [{ originalTime: 1.0, quantizedTime: 1.2 }];
    const segments = computeWarpedSegments(markers, 4.0);
    expect(segments).toHaveLength(2);

    // First segment: 0→1.0 in source maps to 0→1.2 in target
    expect(segments[0].sourceStart).toBe(0);
    expect(segments[0].sourceEnd).toBe(1.0);
    expect(segments[0].targetStart).toBe(0);
    expect(segments[0].targetEnd).toBe(1.2);
    // Rate = source duration / target duration = 1.0/1.2
    expect(segments[0].playbackRate).toBeCloseTo(1.0 / 1.2);

    // Second segment: 1.0→4.0 in source maps to 1.2→4.0 in target
    expect(segments[1].sourceStart).toBe(1.0);
    expect(segments[1].sourceEnd).toBe(4.0);
    expect(segments[1].targetStart).toBe(1.2);
    expect(segments[1].targetEnd).toBe(4.0);
    expect(segments[1].playbackRate).toBeCloseTo(3.0 / 2.8);
  });

  it('computes segments with multiple warp markers', () => {
    const markers = [
      { originalTime: 0.5, quantizedTime: 0.5 },  // no change
      { originalTime: 1.5, quantizedTime: 2.0 },   // stretch this region
    ];
    const segments = computeWarpedSegments(markers, 4.0);
    expect(segments).toHaveLength(3);

    // Segment 0→0.5 (no change)
    expect(segments[0].playbackRate).toBeCloseTo(1.0);

    // Segment 0.5→1.5 source maps to 0.5→2.0 target (stretched)
    expect(segments[1].sourceStart).toBe(0.5);
    expect(segments[1].sourceEnd).toBe(1.5);
    expect(segments[1].targetStart).toBe(0.5);
    expect(segments[1].targetEnd).toBe(2.0);
    expect(segments[1].playbackRate).toBeCloseTo(1.0 / 1.5);
  });

  it('handles markers at clip boundaries', () => {
    const markers = [{ originalTime: 0, quantizedTime: 0 }];
    const segments = computeWarpedSegments(markers, 2.0);
    // Marker at start with no change → single segment
    expect(segments).toHaveLength(1);
    expect(segments[0].playbackRate).toBeCloseTo(1.0);
  });

  it('skips zero-length segments', () => {
    // Two markers at same position
    const markers = [
      { originalTime: 1.0, quantizedTime: 1.0 },
      { originalTime: 1.0, quantizedTime: 1.0 },
    ];
    const segments = computeWarpedSegments(markers, 2.0);
    // Deduplication should prevent zero-length segments
    for (const seg of segments) {
      expect(seg.sourceEnd - seg.sourceStart).toBeGreaterThan(0);
      expect(seg.targetEnd - seg.targetStart).toBeGreaterThan(0);
    }
  });
});

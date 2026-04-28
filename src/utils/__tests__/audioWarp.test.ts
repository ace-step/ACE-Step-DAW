import { describe, it, expect } from 'vitest';
import { detectBpm, computeStretchRate, computeWarpedSegments } from '../audioWarp';

// ─── computeStretchRate ─────────────────────────────────────────────────────

describe('computeStretchRate', () => {
  it('returns 1 when source and target BPM are equal', () => {
    expect(computeStretchRate(120, 120)).toBe(1);
  });

  it('returns 2 when target is double the source', () => {
    expect(computeStretchRate(60, 120)).toBe(2);
  });

  it('returns 0.5 when target is half the source', () => {
    expect(computeStretchRate(120, 60)).toBe(0.5);
  });

  it('returns 1 when sourceBpm is 0', () => {
    expect(computeStretchRate(0, 120)).toBe(1);
  });

  it('returns 1 when targetBpm is 0', () => {
    expect(computeStretchRate(120, 0)).toBe(1);
  });

  it('returns 1 when sourceBpm is negative', () => {
    expect(computeStretchRate(-100, 120)).toBe(1);
  });

  it('handles fractional BPM values', () => {
    expect(computeStretchRate(100, 150)).toBeCloseTo(1.5, 5);
  });
});

// ─── computeWarpedSegments ──────────────────────────────────────────────────

describe('computeWarpedSegments', () => {
  it('returns single segment with rate 1.0 for empty markers', () => {
    const segments = computeWarpedSegments([], 10);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      sourceStart: 0,
      sourceEnd: 10,
      targetStart: 0,
      targetEnd: 10,
      playbackRate: 1.0,
    });
  });

  it('creates segments with implicit start anchor when first marker is not at 0', () => {
    const markers = [{ originalTime: 2, quantizedTime: 2.5 }];
    const segments = computeWarpedSegments(markers, 4);
    // Segment 0: [0,0] → [2, 2.5] => rate = 2/2.5 = 0.8
    // Segment 1: [2, 2.5] → [4, 4] => rate = 2/1.5 ≈ 1.333
    expect(segments).toHaveLength(2);
    expect(segments[0].sourceStart).toBe(0);
    expect(segments[0].sourceEnd).toBe(2);
    expect(segments[0].targetStart).toBe(0);
    expect(segments[0].targetEnd).toBe(2.5);
    expect(segments[0].playbackRate).toBeCloseTo(0.8, 5);
    expect(segments[1].sourceStart).toBe(2);
    expect(segments[1].sourceEnd).toBe(4);
    expect(segments[1].targetStart).toBe(2.5);
    expect(segments[1].targetEnd).toBe(4);
    expect(segments[1].playbackRate).toBeCloseTo(2 / 1.5, 5);
  });

  it('handles marker at the start (originalTime=0)', () => {
    const markers = [{ originalTime: 0, quantizedTime: 0 }];
    const segments = computeWarpedSegments(markers, 5);
    // Only implicit end anchor added: [0,0] → [5,5]
    expect(segments).toHaveLength(1);
    expect(segments[0].playbackRate).toBe(1.0);
  });

  it('handles marker at clip end', () => {
    const markers = [{ originalTime: 5, quantizedTime: 4 }];
    const segments = computeWarpedSegments(markers, 5);
    // Implicit start + marker at end
    // Segment: [0,0] → [5,4] => rate = 5/4 = 1.25
    expect(segments).toHaveLength(1);
    expect(segments[0].playbackRate).toBeCloseTo(1.25, 5);
  });

  it('deduplicates markers with same originalTime', () => {
    const markers = [
      { originalTime: 2, quantizedTime: 1.8 },
      { originalTime: 2, quantizedTime: 2.2 },
    ];
    const segments = computeWarpedSegments(markers, 4);
    // After dedup, only first marker with originalTime=2 is kept
    expect(segments).toHaveLength(2);
  });

  it('sorts markers by originalTime', () => {
    const markers = [
      { originalTime: 3, quantizedTime: 3.2 },
      { originalTime: 1, quantizedTime: 0.8 },
    ];
    const segments = computeWarpedSegments(markers, 5);
    // Should produce 3 segments: [0→1], [1→3], [3→5]
    expect(segments).toHaveLength(3);
    expect(segments[0].sourceEnd).toBe(1);
    expect(segments[1].sourceStart).toBe(1);
    expect(segments[1].sourceEnd).toBe(3);
    expect(segments[2].sourceStart).toBe(3);
  });

  it('skips zero-length source segments', () => {
    const markers = [
      { originalTime: 2, quantizedTime: 1 },
      { originalTime: 2, quantizedTime: 3 }, // same originalTime, will be deduped
    ];
    const segments = computeWarpedSegments(markers, 4);
    for (const seg of segments) {
      expect(seg.sourceEnd - seg.sourceStart).toBeGreaterThan(0);
      expect(seg.targetEnd - seg.targetStart).toBeGreaterThan(0);
    }
  });

  it('computes correct playbackRate as sourceDur/targetDur', () => {
    const markers = [{ originalTime: 2, quantizedTime: 4 }];
    const segments = computeWarpedSegments(markers, 6);
    // Seg 0: source=[0,2] target=[0,4] rate=2/4=0.5
    expect(segments[0].playbackRate).toBeCloseTo(0.5, 5);
    // Seg 1: source=[2,6] target=[4,6] rate=4/2=2
    expect(segments[1].playbackRate).toBeCloseTo(2.0, 5);
  });
});

// ─── detectBpm ──────────────────────────────────────────────────────────────

describe('detectBpm', () => {
  it('returns null for very short audio (< 0.5s)', () => {
    const shortAudio = new Float32Array(100);
    expect(detectBpm(shortAudio, 44100)).toBeNull();
  });

  it('returns null for empty audio', () => {
    const empty = new Float32Array(0);
    expect(detectBpm(empty, 44100)).toBeNull();
  });

  it('returns null for silent audio', () => {
    const silent = new Float32Array(44100); // 1 second of silence
    expect(detectBpm(silent, 44100)).toBeNull();
  });

  it('detects BPM from regular impulses at 120 BPM', () => {
    // Create audio with transients every 0.5 seconds (120 BPM)
    const sampleRate = 44100;
    const duration = 4; // 4 seconds = 8 beats at 120BPM
    const samples = new Float32Array(sampleRate * duration);
    const beatInterval = 0.5; // seconds per beat at 120 BPM

    for (let beat = 0; beat < duration / beatInterval; beat++) {
      const sampleIdx = Math.floor(beat * beatInterval * sampleRate);
      // Create a short click (transient)
      for (let i = 0; i < 512; i++) {
        if (sampleIdx + i < samples.length) {
          samples[sampleIdx + i] = Math.exp(-i / 50) * 0.8;
        }
      }
    }

    const bpm = detectBpm(samples, sampleRate);
    // Must detect a BPM for clear impulse signal
    expect(bpm).not.toBeNull();
    // Should detect ~120 BPM (within reasonable range due to histogram binning)
    expect(bpm!).toBeGreaterThanOrEqual(100);
    expect(bpm!).toBeLessThanOrEqual(140);
  });

  it('normalizes detected BPM to 60-200 range', () => {
    // Create audio with transients every 0.25 seconds (240 BPM raw → should normalize to 120)
    const sampleRate = 44100;
    const duration = 4;
    const samples = new Float32Array(sampleRate * duration);
    const beatInterval = 0.25;

    for (let beat = 0; beat < duration / beatInterval; beat++) {
      const sampleIdx = Math.floor(beat * beatInterval * sampleRate);
      for (let i = 0; i < 256; i++) {
        if (sampleIdx + i < samples.length) {
          samples[sampleIdx + i] = Math.exp(-i / 30) * 0.9;
        }
      }
    }

    const bpm = detectBpm(samples, sampleRate);
    expect(bpm).not.toBeNull();
    expect(bpm!).toBeGreaterThanOrEqual(60);
    expect(bpm!).toBeLessThanOrEqual(200);
  });

  it('returns an integer BPM', () => {
    const sampleRate = 44100;
    const duration = 4;
    const samples = new Float32Array(sampleRate * duration);
    const beatInterval = 0.5;

    for (let beat = 0; beat < duration / beatInterval; beat++) {
      const sampleIdx = Math.floor(beat * beatInterval * sampleRate);
      for (let i = 0; i < 512; i++) {
        if (sampleIdx + i < samples.length) {
          samples[sampleIdx + i] = Math.exp(-i / 50) * 0.8;
        }
      }
    }

    const bpm = detectBpm(samples, sampleRate);
    expect(bpm).not.toBeNull();
    expect(Number.isInteger(bpm!)).toBe(true);
  });
});

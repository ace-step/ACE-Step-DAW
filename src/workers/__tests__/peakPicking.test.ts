import { describe, it, expect } from 'vitest';

// We can't import the worker directly (it calls self.onmessage),
// so we test the exported peak-picking function.
// Re-implement here to test the algorithm independently.

function maxPool1d(data: Float32Array, kernelSize: number): Float32Array {
  const n = data.length;
  const result = new Float32Array(n);
  const pad = Math.floor(kernelSize / 2);
  for (let i = 0; i < n; i++) {
    let max = -Infinity;
    for (let j = -pad; j <= pad; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < n) {
        max = Math.max(max, data[idx]);
      } else {
        max = Math.max(max, -1000);
      }
    }
    result[i] = max;
  }
  return result;
}

function peakPick(logits: Float32Array, kernelSize: number = 7): number[] {
  const pooled = maxPool1d(logits, kernelSize);
  const peaks: number[] = [];
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] === pooled[i] && logits[i] > 0) {
      peaks.push(i);
    }
  }
  return peaks;
}

describe('maxPool1d', () => {
  it('returns the input unchanged for kernel=1', () => {
    const data = new Float32Array([1, 2, 3, 2, 1]);
    const result = maxPool1d(data, 1);
    expect(Array.from(result)).toEqual([1, 2, 3, 2, 1]);
  });

  it('correctly pools with kernel=3', () => {
    const data = new Float32Array([1, 3, 2, 5, 1]);
    const result = maxPool1d(data, 3);
    // idx 0: max(pad, 1, 3) = 3
    // idx 1: max(1, 3, 2) = 3
    // idx 2: max(3, 2, 5) = 5
    // idx 3: max(2, 5, 1) = 5
    // idx 4: max(5, 1, pad) = 5
    expect(Array.from(result)).toEqual([3, 3, 5, 5, 5]);
  });

  it('kernel=7 spreads maxima across 7 positions', () => {
    const data = new Float32Array(20).fill(-5);
    data[10] = 5; // single peak
    const result = maxPool1d(data, 7);
    // Positions 7-13 should see the peak value 5
    for (let i = 7; i <= 13; i++) {
      expect(result[i]).toBe(5);
    }
    // Positions outside should be -5
    expect(result[6]).toBe(-5);
    expect(result[14]).toBe(-5);
  });
});

describe('peakPick', () => {
  it('finds isolated peaks above threshold', () => {
    const logits = new Float32Array(20).fill(-5);
    logits[5] = 2.0;
    logits[15] = 3.0;
    const peaks = peakPick(logits, 7);
    expect(peaks).toEqual([5, 15]);
  });

  it('ignores negative logits (below sigmoid 0.5 threshold)', () => {
    const logits = new Float32Array(20).fill(-5);
    logits[10] = -0.5; // local max but logit < 0
    const peaks = peakPick(logits, 7);
    expect(peaks).toEqual([]);
  });

  it('picks only the local maximum when beats are clustered', () => {
    // Simulate a cluster of high activations (common in raw model output)
    const logits = new Float32Array(20).fill(-5);
    logits[8] = 1.0;
    logits[9] = 3.0;  // local max
    logits[10] = 2.5;
    logits[11] = 0.5;
    const peaks = peakPick(logits, 7);
    // Only frame 9 should be picked (it's the max in the 7-frame window)
    expect(peaks).toEqual([9]);
  });

  it('picks multiple beats at expected BPM spacing', () => {
    // Simulate 120 BPM: beats every 25 frames (at 50fps)
    const nFrames = 200;
    const logits = new Float32Array(nFrames).fill(-5);
    for (let i = 25; i < nFrames; i += 25) {
      logits[i] = 5.0; // strong beat
    }
    const peaks = peakPick(logits, 7);
    expect(peaks.length).toBe(7); // frames 25, 50, 75, 100, 125, 150, 175
    // All peaks should be at multiples of 25
    for (const p of peaks) {
      expect(p % 25).toBe(0);
    }
  });

  it('handles equal adjacent values by picking all of them', () => {
    // Two adjacent frames with same value — both are local max
    const logits = new Float32Array(10).fill(-5);
    logits[4] = 2.0;
    logits[5] = 2.0;
    const peaks = peakPick(logits, 3);
    // Both 4 and 5 equal the max in their windows, so both get picked
    expect(peaks).toContain(4);
    expect(peaks).toContain(5);
  });
});

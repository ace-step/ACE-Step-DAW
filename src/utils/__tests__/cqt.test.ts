import { describe, it, expect } from 'vitest';
import { computeCQT, cqtToOnnxInput, CONSONANCE_ACE_CQT_OPTIONS } from '../cqt';

describe('computeCQT', { timeout: 30_000 }, () => {
  it('returns correct number of bins for consonance-ACE config', () => {
    const samples = new Float32Array(22050); // 1 second
    const { nBins } = computeCQT(samples, CONSONANCE_ACE_CQT_OPTIONS);
    // 24 bins/octave * 6 octaves = 144
    expect(nBins).toBe(144);
  });

  it('returns correct number of frames for 1 second of audio', () => {
    const sr = 22050;
    const samples = new Float32Array(sr);
    const { nFrames } = computeCQT(samples, CONSONANCE_ACE_CQT_OPTIONS);
    // ceil(22050 / 512) + 1 ≈ 44
    const expected = Math.floor((sr - 1) / 512) + 1;
    expect(nFrames).toBe(expected);
  });

  it('produces non-negative magnitudes', () => {
    const samples = new Float32Array(22050);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / 22050);
    }
    const { data, nBins, nFrames } = computeCQT(samples, CONSONANCE_ACE_CQT_OPTIONS);
    expect(data.length).toBe(nBins);
    for (let b = 0; b < nBins; b++) {
      expect(data[b].length).toBe(nFrames);
      for (let f = 0; f < nFrames; f++) {
        expect(data[b][f]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('440Hz tone has energy in the correct frequency range', { timeout: 30_000 }, () => {
    // A4 = 440Hz. C1 = 32.7Hz. 440/32.7 = 13.46 octaves? No —
    // log2(440/32.7) ≈ 3.75 octaves. At 24 bins/octave: bin ~90
    const sr = 22050;
    const samples = new Float32Array(sr * 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sr);
    }
    const { data, nBins } = computeCQT(samples, CONSONANCE_ACE_CQT_OPTIONS);

    // Find the bin with maximum energy (average over frames)
    let maxBin = 0, maxEnergy = 0;
    for (let b = 0; b < nBins; b++) {
      const avg = data[b].reduce((s, v) => s + v, 0) / data[b].length;
      if (avg > maxEnergy) { maxEnergy = avg; maxBin = b; }
    }

    // A4 = 440Hz, C1 = 32.7Hz
    // Expected bin = 24 * log2(440/32.7) ≈ 24 * 3.75 ≈ 90
    expect(maxBin).toBeGreaterThan(80);
    expect(maxBin).toBeLessThan(100);
  });

  it('silent input produces near-zero magnitudes', () => {
    const samples = new Float32Array(22050);
    const { data, nBins, nFrames } = computeCQT(samples);
    for (let b = 0; b < nBins; b++) {
      for (let f = 0; f < nFrames; f++) {
        expect(data[b][f]).toBeCloseTo(0, 5);
      }
    }
  });
});

describe('cqtToOnnxInput', () => {
  it('flattens to correct size', () => {
    const nBins = 144;
    const nFrames = 100;
    const data: Float32Array[] = [];
    for (let b = 0; b < nBins; b++) {
      data.push(new Float32Array(nFrames).fill(b));
    }
    const flat = cqtToOnnxInput(data, nBins, nFrames);
    expect(flat.length).toBe(nBins * nFrames);
    // First nFrames values should be 0 (bin 0)
    expect(flat[0]).toBe(0);
    // Second nFrames values should be 1 (bin 1)
    expect(flat[nFrames]).toBe(1);
    // Last value should be nBins-1
    expect(flat[(nBins - 1) * nFrames]).toBe(nBins - 1);
  });
});

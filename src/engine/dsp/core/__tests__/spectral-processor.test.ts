/**
 * Tests for spectral-processor.ts — FFT/IFFT and spectral effects.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  fft,
  ifft,
  createHannWindow,
  SpectralProcessor,
} from '../spectral-processor';

describe('fft / ifft', () => {
  it('should produce correct spectrum for a DC signal', () => {
    const N = 8;
    const re = new Float32Array(N).fill(1);
    const im = new Float32Array(N).fill(0);
    fft(re, im);
    // DC bin should equal N, others should be ~0
    expect(re[0]).toBeCloseTo(N, 5);
    for (let i = 1; i < N; i++) {
      expect(Math.abs(re[i])).toBeLessThan(1e-10);
      expect(Math.abs(im[i])).toBeLessThan(1e-10);
    }
  });

  it('should round-trip through fft then ifft', () => {
    const N = 64;
    const original = new Float32Array(N);
    for (let i = 0; i < N; i++) original[i] = Math.sin(2 * Math.PI * 3 * i / N);

    const re = new Float32Array(original);
    const im = new Float32Array(N).fill(0);
    fft(re, im);
    ifft(re, im);

    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('should detect a pure sine frequency', () => {
    const N = 256;
    const re = new Float32Array(N);
    const im = new Float32Array(N).fill(0);
    const freq = 10; // bin 10
    for (let i = 0; i < N; i++) re[i] = Math.sin(2 * Math.PI * freq * i / N);

    fft(re, im);

    // Find peak bin
    let maxMag = 0;
    let peakBin = 0;
    for (let i = 0; i < N / 2; i++) {
      const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      if (mag > maxMag) {
        maxMag = mag;
        peakBin = i;
      }
    }
    expect(peakBin).toBe(freq);
    expect(maxMag).toBeGreaterThan(N / 4); // significant energy
  });
});

describe('createHannWindow', () => {
  it('should have zeros at endpoints', () => {
    const w = createHannWindow(256);
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[255]).toBeCloseTo(0, 5);
  });

  it('should peak at center', () => {
    const w = createHannWindow(256);
    expect(w[127]).toBeGreaterThan(0.99);
  });

  it('should be symmetric', () => {
    const w = createHannWindow(128);
    for (let i = 0; i < 64; i++) {
      expect(w[i]).toBeCloseTo(w[127 - i], 10);
    }
  });
});

describe('SpectralProcessor', () => {
  let processor: SpectralProcessor;

  beforeEach(() => {
    processor = new SpectralProcessor({
      fftSize: 2048,
      sampleRate: 44100,
      mode: 'freeze',
    });
  });

  it('should process silence without errors', () => {
    const input = new Float32Array(512).fill(0);
    const output = new Float32Array(512).fill(0);
    // Should not throw
    processor.processBlock(input, output, 512);
    // Output should be silence (or near-silence from initialization)
    for (let i = 0; i < 512; i++) {
      expect(Math.abs(output[i])).toBeLessThan(0.01);
    }
  });

  it('should pass through signal without freeze in freeze mode', () => {
    processor.mix = 1.0;
    // Generate enough samples to fill the FFT buffer and get output
    const totalSamples = 2048 * 4;
    const input = new Float32Array(totalSamples);
    const output = new Float32Array(totalSamples);

    // Use a sine wave as test signal
    for (let i = 0; i < totalSamples; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }

    processor.processBlock(input, output, totalSamples);

    // After initial latency, output should have energy
    let hasEnergy = false;
    for (let i = 2048; i < totalSamples; i++) {
      if (Math.abs(output[i]) > 0.01) {
        hasEnergy = true;
        break;
      }
    }
    expect(hasEnergy).toBe(true);
  });

  it('should freeze spectrum when freeze() is called', () => {
    processor.freezeDecay = 1.0;
    processor.mix = 1.0;

    // Feed signal to fill buffer
    const blockSize = 2048 * 3;
    const input = new Float32Array(blockSize);
    const output = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }
    processor.processBlock(input, output, blockSize);

    // Freeze
    processor.freeze();

    // Continue processing with silence — output should still have energy from frozen spectrum
    const silenceBlock = new Float32Array(2048 * 2);
    const frozenOutput = new Float32Array(2048 * 2);
    processor.processBlock(silenceBlock, frozenOutput, silenceBlock.length);

    let frozenEnergy = 0;
    for (let i = 0; i < frozenOutput.length; i++) {
      frozenEnergy += frozenOutput[i] * frozenOutput[i];
    }
    expect(frozenEnergy).toBeGreaterThan(0);
  });

  it('should apply filter curve correctly', () => {
    const filterProc = new SpectralProcessor({
      fftSize: 2048,
      sampleRate: 44100,
      mode: 'filter',
    });
    filterProc.mix = 1.0;

    // Set filter curve: kill all frequencies
    const zeroCurve = new Float32Array(1024).fill(0);
    filterProc.setFilterCurve(zeroCurve);

    const blockSize = 2048 * 4;
    const input = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 1000 * i / 44100) * 0.5;
    }
    const output = new Float32Array(blockSize);
    filterProc.processBlock(input, output, blockSize);

    // Output should be nearly silent after filter settles
    let energy = 0;
    for (let i = blockSize - 2048; i < blockSize; i++) {
      energy += output[i] * output[i];
    }
    expect(energy).toBeLessThan(0.01);
  });

  it('should expose magnitude spectrum for visualization', () => {
    const blockSize = 2048 * 3;
    const input = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 1000 * i / 44100) * 0.5;
    }
    const output = new Float32Array(blockSize);
    processor.processBlock(input, output, blockSize);

    const mag = processor.getMagnitude();
    expect(mag.length).toBe(1024); // fftSize / 2

    // Should have non-zero energy
    let totalMag = 0;
    for (let i = 0; i < mag.length; i++) totalMag += mag[i];
    expect(totalMag).toBeGreaterThan(0);
  });

  it('should unfreeze and resume normal processing', () => {
    processor.freezeDecay = 1.0;

    // Feed and freeze
    const blockSize = 2048 * 3;
    const input = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }
    const output = new Float32Array(blockSize);
    processor.processBlock(input, output, blockSize);
    processor.freeze();

    // Process silence while frozen
    const silence = new Float32Array(2048 * 2);
    const frozenOut = new Float32Array(2048 * 2);
    processor.processBlock(silence, frozenOut, silence.length);

    // Unfreeze
    processor.unfreeze();

    // Now process more silence — should eventually decay to silence
    const postOut = new Float32Array(2048 * 4);
    processor.processBlock(new Float32Array(2048 * 4), postOut, postOut.length);

    // Last chunk should have less energy than frozen output
    let frozenEnergy = 0;
    for (let i = 0; i < frozenOut.length; i++) frozenEnergy += frozenOut[i] * frozenOut[i];
    let postEnergy = 0;
    for (let i = postOut.length - 2048; i < postOut.length; i++) postEnergy += postOut[i] * postOut[i];

    // Post-unfreeze silence should have very little energy
    expect(postEnergy).toBeLessThan(frozenEnergy);
  });

  it('blur mode should smooth the spectrum temporally', () => {
    const blurProc = new SpectralProcessor({
      fftSize: 2048,
      sampleRate: 44100,
      mode: 'blur',
    });
    blurProc.blurAmount = 0.9; // heavy blur
    blurProc.mix = 1.0;

    const blockSize = 2048 * 4;
    const input = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }
    const output = new Float32Array(blockSize);
    blurProc.processBlock(input, output, blockSize);

    // Should produce output (not silence)
    let energy = 0;
    for (let i = 2048; i < blockSize; i++) energy += output[i] * output[i];
    expect(energy).toBeGreaterThan(0);
  });

  it('morph mode should interpolate between spectra', () => {
    const morphProc = new SpectralProcessor({
      fftSize: 2048,
      sampleRate: 44100,
      mode: 'morph',
    });
    morphProc.morphAmount = 0.5;
    morphProc.mix = 1.0;

    // Set morph target (flat spectrum)
    const targetMag = new Float32Array(1024).fill(0.1);
    const targetPhase = new Float32Array(1024).fill(0);
    morphProc.setMorphTarget(targetMag, targetPhase);

    const blockSize = 2048 * 4;
    const input = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }
    const output = new Float32Array(blockSize);
    morphProc.processBlock(input, output, blockSize);

    // Should produce output
    let energy = 0;
    for (let i = 2048; i < blockSize; i++) energy += output[i] * output[i];
    expect(energy).toBeGreaterThan(0);
  });
});

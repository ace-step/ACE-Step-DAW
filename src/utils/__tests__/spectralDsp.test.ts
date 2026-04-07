import { describe, it, expect } from 'vitest';
import {
  hannWindow,
  fft,
  ifft,
  toMagnitudePhase,
  fromMagnitudePhase,
  spectralFreeze,
  spectralBlur,
  spectralFilter,
  spectralMorph,
} from '../spectralDsp';

describe('spectralDsp', () => {
  describe('hannWindow', () => {
    it('returns correct length', () => {
      expect(hannWindow(8).length).toBe(8);
    });

    it('starts and ends at zero', () => {
      const w = hannWindow(64);
      expect(w[0]).toBeCloseTo(0, 5);
      expect(w[63]).toBeCloseTo(0, 5);
    });

    it('peaks near the center', () => {
      const w = hannWindow(64);
      // Max value at N/2 - 1 = 31 for even-length window
      expect(w[31]).toBeCloseTo(1, 2);
      expect(w[32]).toBeCloseTo(1, 2);
    });

    it('is symmetric', () => {
      const w = hannWindow(16);
      for (let i = 0; i < 8; i++) {
        expect(w[i]).toBeCloseTo(w[15 - i], 10);
      }
    });
  });

  describe('fft / ifft', () => {
    it('round-trips a DC signal', () => {
      const real = new Float32Array([1, 1, 1, 1]);
      const imag = new Float32Array(4);
      const originalReal = Float32Array.from(real);

      fft(real, imag);
      // DC bin should be 4 (sum of all samples)
      expect(real[0]).toBeCloseTo(4, 5);
      expect(real[1]).toBeCloseTo(0, 5);
      expect(real[2]).toBeCloseTo(0, 5);
      expect(real[3]).toBeCloseTo(0, 5);

      ifft(real, imag);
      for (let i = 0; i < 4; i++) {
        expect(real[i]).toBeCloseTo(originalReal[i], 5);
      }
    });

    it('round-trips an impulse', () => {
      const real = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const imag = new Float32Array(8);
      const originalReal = Float32Array.from(real);

      fft(real, imag);
      // All frequency bins should have magnitude 1
      for (let i = 0; i < 8; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        expect(mag).toBeCloseTo(1, 5);
      }

      ifft(real, imag);
      for (let i = 0; i < 8; i++) {
        expect(real[i]).toBeCloseTo(originalReal[i], 5);
      }
    });

    it('round-trips a cosine wave', () => {
      const n = 16;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      // Pure cosine at bin 3
      for (let i = 0; i < n; i++) {
        real[i] = Math.cos((2 * Math.PI * 3 * i) / n);
      }
      const original = Float32Array.from(real);

      fft(real, imag);
      // Bin 3 and bin 13 (N-3) should have magnitude N/2 = 8
      expect(Math.sqrt(real[3] * real[3] + imag[3] * imag[3])).toBeCloseTo(8, 4);
      expect(Math.sqrt(real[13] * real[13] + imag[13] * imag[13])).toBeCloseTo(8, 4);

      ifft(real, imag);
      for (let i = 0; i < n; i++) {
        expect(real[i]).toBeCloseTo(original[i], 4);
      }
    });

    it('handles size 1', () => {
      const real = new Float32Array([42]);
      const imag = new Float32Array([0]);
      fft(real, imag);
      expect(real[0]).toBe(42);
    });
  });

  describe('toMagnitudePhase / fromMagnitudePhase', () => {
    it('round-trips complex values', () => {
      const real = new Float32Array([3, 0, -1, 0]);
      const imag = new Float32Array([0, 4, 0, -2]);
      const mag = new Float32Array(4);
      const phase = new Float32Array(4);

      toMagnitudePhase(real, imag, mag, phase);
      expect(mag[0]).toBeCloseTo(3, 5);
      expect(mag[1]).toBeCloseTo(4, 5);
      expect(mag[2]).toBeCloseTo(1, 5);
      expect(mag[3]).toBeCloseTo(2, 5);

      const outReal = new Float32Array(4);
      const outImag = new Float32Array(4);
      fromMagnitudePhase(mag, phase, outReal, outImag);

      for (let i = 0; i < 4; i++) {
        expect(outReal[i]).toBeCloseTo(real[i], 5);
        expect(outImag[i]).toBeCloseTo(imag[i], 5);
      }
    });
  });

  describe('spectralFreeze', () => {
    it('at mix=0 leaves magnitude unchanged', () => {
      const mag = new Float32Array([1, 2, 3, 4]);
      const frozen = new Float32Array([10, 20, 30, 40]);
      spectralFreeze(mag, frozen, 0);
      expect(Array.from(mag)).toEqual([1, 2, 3, 4]);
    });

    it('at mix=1 replaces with frozen magnitude', () => {
      const mag = new Float32Array([1, 2, 3, 4]);
      const frozen = new Float32Array([10, 20, 30, 40]);
      spectralFreeze(mag, frozen, 1);
      expect(Array.from(mag)).toEqual([10, 20, 30, 40]);
    });

    it('at mix=0.5 blends equally', () => {
      const mag = new Float32Array([0, 0, 0, 0]);
      const frozen = new Float32Array([10, 20, 30, 40]);
      spectralFreeze(mag, frozen, 0.5);
      expect(mag[0]).toBeCloseTo(5, 5);
      expect(mag[1]).toBeCloseTo(10, 5);
      expect(mag[2]).toBeCloseTo(15, 5);
      expect(mag[3]).toBeCloseTo(20, 5);
    });
  });

  describe('spectralBlur', () => {
    it('with decay=0 passes through magnitude unchanged', () => {
      const mag = new Float32Array([5, 10, 15, 20]);
      const acc = new Float32Array(4);
      spectralBlur(mag, acc, 0);
      expect(Array.from(mag)).toEqual([5, 10, 15, 20]);
    });

    it('with high decay retains previous accumulator values', () => {
      const acc = new Float32Array([100, 200, 300, 400]);
      const mag = new Float32Array([0, 0, 0, 0]);
      spectralBlur(mag, acc, 0.99);
      // acc should be ~99 (0.99 * 100)
      expect(acc[0]).toBeCloseTo(99, 0);
      expect(mag[0]).toBeCloseTo(99, 0);
    });

    it('accumulates over multiple frames', () => {
      const acc = new Float32Array(4);
      // Frame 1
      const mag1 = new Float32Array([10, 10, 10, 10]);
      spectralBlur(mag1, acc, 0.5);
      // acc = 0*0.5 + 10*0.5 = 5
      expect(acc[0]).toBeCloseTo(5, 5);

      // Frame 2
      const mag2 = new Float32Array([10, 10, 10, 10]);
      spectralBlur(mag2, acc, 0.5);
      // acc = 5*0.5 + 10*0.5 = 7.5
      expect(acc[0]).toBeCloseTo(7.5, 5);
    });
  });

  describe('spectralFilter', () => {
    it('with all-ones mask leaves magnitude unchanged', () => {
      const mag = new Float32Array([1, 2, 3, 4]);
      const mask = new Float32Array([1, 1, 1, 1]);
      spectralFilter(mag, mask);
      expect(Array.from(mag)).toEqual([1, 2, 3, 4]);
    });

    it('with zero mask zeroes magnitude', () => {
      const mag = new Float32Array([5, 10, 15, 20]);
      const mask = new Float32Array([0, 0, 0, 0]);
      spectralFilter(mag, mask);
      expect(Array.from(mag)).toEqual([0, 0, 0, 0]);
    });

    it('interpolates when mask is shorter than magnitude', () => {
      const mag = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
      // Mask: low pass — 1 at low freq, 0 at high freq
      const mask = new Float32Array([1, 0]);
      spectralFilter(mag, mask);
      // First bin should be close to 1, last bin close to 0
      expect(mag[0]).toBeCloseTo(1, 2);
      expect(mag[7]).toBeCloseTo(0, 2);
    });

    it('applies specific gain values per bin', () => {
      const mag = new Float32Array([10, 20, 30, 40]);
      const mask = new Float32Array([0.5, 1.0, 0.0, 0.5]);
      spectralFilter(mag, mask);
      expect(mag[0]).toBeCloseTo(5, 5);
      expect(mag[1]).toBeCloseTo(20, 5);
      expect(mag[2]).toBeCloseTo(0, 5);
      expect(mag[3]).toBeCloseTo(20, 5);
    });
  });

  describe('spectralMorph', () => {
    it('at amount=0 keeps original', () => {
      const mag = new Float32Array([1, 2, 3, 4]);
      const ref = new Float32Array([10, 20, 30, 40]);
      spectralMorph(mag, ref, 0);
      expect(Array.from(mag)).toEqual([1, 2, 3, 4]);
    });

    it('at amount=1 becomes reference', () => {
      const mag = new Float32Array([1, 2, 3, 4]);
      const ref = new Float32Array([10, 20, 30, 40]);
      spectralMorph(mag, ref, 1);
      expect(Array.from(mag)).toEqual([10, 20, 30, 40]);
    });

    it('at amount=0.5 blends equally', () => {
      const mag = new Float32Array([0, 10, 20, 30]);
      const ref = new Float32Array([100, 10, 0, 30]);
      spectralMorph(mag, ref, 0.5);
      expect(mag[0]).toBeCloseTo(50, 5);
      expect(mag[1]).toBeCloseTo(10, 5);
      expect(mag[2]).toBeCloseTo(10, 5);
      expect(mag[3]).toBeCloseTo(30, 5);
    });
  });
});

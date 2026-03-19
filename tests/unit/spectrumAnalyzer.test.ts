import { describe, it, expect } from 'vitest';
import {
  freqToX,
  xToFreq,
  dbToY,
  linearToDb,
  dbToLinear,
} from '../../src/utils/loudnessMetering';

describe('SpectrumAnalyzer utilities', () => {
  describe('freqToX / xToFreq', () => {
    const width = 320;

    it('maps 20 Hz to x=0', () => {
      expect(freqToX(20, width)).toBeCloseTo(0, 1);
    });

    it('maps 20000 Hz to x=width', () => {
      expect(freqToX(20000, width)).toBeCloseTo(width, 1);
    });

    it('maps 200 Hz to ~1/3 of width (log scale)', () => {
      const x = freqToX(200, width);
      // log10(200) = 2.301, range = log10(20000) - log10(20) = 3
      // x = ((2.301 - 1.301) / 3) * 320 = (1/3) * 320 ≈ 106.67
      expect(x).toBeCloseTo(106.67, 0);
    });

    it('round-trips correctly', () => {
      const freq = 1000;
      const x = freqToX(freq, width);
      const result = xToFreq(x, width);
      expect(result).toBeCloseTo(freq, 0);
    });

    it('round-trips at extremes', () => {
      expect(xToFreq(freqToX(20, width), width)).toBeCloseTo(20, 0);
      expect(xToFreq(freqToX(20000, width), width)).toBeCloseTo(20000, 0);
    });
  });

  describe('dbToY', () => {
    const height = 160;

    it('maps 0 dB to y=0 (top)', () => {
      expect(dbToY(0, height)).toBeCloseTo(0, 1);
    });

    it('maps -90 dB to y=height (bottom)', () => {
      expect(dbToY(-90, height)).toBeCloseTo(height, 1);
    });

    it('maps -45 dB to mid-height', () => {
      expect(dbToY(-45, height)).toBeCloseTo(height / 2, 1);
    });

    it('clamps values above 0 dB', () => {
      expect(dbToY(10, height)).toBeCloseTo(0, 1);
    });

    it('clamps values below -90 dB', () => {
      expect(dbToY(-120, height)).toBeCloseTo(height, 1);
    });
  });

  describe('dB conversion integration', () => {
    it('full-scale level maps to 0 dB', () => {
      expect(linearToDb(1.0)).toBeCloseTo(0, 5);
    });

    it('half level maps to ~-6 dB', () => {
      expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
    });

    it('conversions are invertible', () => {
      const db = -12;
      const linear = dbToLinear(db);
      expect(linearToDb(linear)).toBeCloseTo(db, 5);
    });
  });
});

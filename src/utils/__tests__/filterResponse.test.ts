import { describe, it, expect } from 'vitest';
import { filterMagnitudeDb, generateFilterResponse } from '../filterResponse';

describe('filterResponse', () => {
  describe('filterMagnitudeDb', () => {
    describe('lowpass', () => {
      it('has 0dB gain at very low frequencies (well below cutoff)', () => {
        // 100Hz cutoff, check at 1Hz — should be near 0dB
        const db = filterMagnitudeDb(1, 100, 0.707, 'lowpass');
        expect(db).toBeCloseTo(0, 0);
      });

      it('rolls off well above cutoff', () => {
        // 1kHz cutoff, check at 10kHz (1 decade above)
        const db = filterMagnitudeDb(10000, 1000, 0.707, 'lowpass');
        expect(db).toBeLessThan(-20);
      });

      it('resonance creates a peak near cutoff', () => {
        // With high Q, there should be a peak near the cutoff frequency
        const atCutoff = filterMagnitudeDb(1000, 1000, 8, 'lowpass');
        const belowCutoff = filterMagnitudeDb(500, 1000, 8, 'lowpass');
        expect(atCutoff).toBeGreaterThan(belowCutoff);
      });

      it('at cutoff with Q=0.707 (Butterworth), gain is ~-3dB', () => {
        const db = filterMagnitudeDb(1000, 1000, 0.707, 'lowpass');
        expect(db).toBeCloseTo(-3, 0);
      });
    });

    describe('highpass', () => {
      it('has 0dB gain at very high frequencies (well above cutoff)', () => {
        const db = filterMagnitudeDb(20000, 1000, 0.707, 'highpass');
        expect(db).toBeCloseTo(0, 0);
      });

      it('rolls off well below cutoff', () => {
        const db = filterMagnitudeDb(10, 1000, 0.707, 'highpass');
        expect(db).toBeLessThan(-20);
      });

      it('at cutoff with Q=0.707, gain is ~-3dB', () => {
        const db = filterMagnitudeDb(1000, 1000, 0.707, 'highpass');
        expect(db).toBeCloseTo(-3, 0);
      });
    });

    describe('bandpass', () => {
      it('passes signal at center frequency', () => {
        const db = filterMagnitudeDb(1000, 1000, 2, 'bandpass');
        expect(db).toBeGreaterThan(-6);
      });

      it('attenuates well above and below center', () => {
        const dbLow = filterMagnitudeDb(50, 1000, 2, 'bandpass');
        const dbHigh = filterMagnitudeDb(20000, 1000, 2, 'bandpass');
        expect(dbLow).toBeLessThan(-12);
        expect(dbHigh).toBeLessThan(-12);
      });

      it('higher Q gives higher peak gain at center frequency', () => {
        // Web Audio BPF: higher Q → narrower bandwidth, higher center gain
        const lowQ = filterMagnitudeDb(1000, 1000, 1, 'bandpass');
        const highQ = filterMagnitudeDb(1000, 1000, 8, 'bandpass');
        expect(highQ).toBeGreaterThan(lowQ);
      });
    });

    it('returns finite numbers for all filter types and frequencies', () => {
      const types = ['lowpass', 'highpass', 'bandpass'] as const;
      const freqs = [20, 100, 500, 1000, 5000, 10000, 20000];
      for (const type of types) {
        for (const f of freqs) {
          const db = filterMagnitudeDb(f, 1000, 2, type);
          expect(isFinite(db)).toBe(true);
          expect(db).toBeGreaterThan(-120); // not below noise floor
          expect(db).toBeLessThan(30);      // not unreasonably large
        }
      }
    });
  });

  describe('generateFilterResponse', () => {
    it('generates correct number of points', () => {
      const pts = generateFilterResponse(1000, 2, 'lowpass', 100);
      expect(pts).toHaveLength(101);
    });

    it('first point is at 20Hz', () => {
      const pts = generateFilterResponse(1000, 2, 'lowpass');
      expect(pts[0].freq).toBeCloseTo(20, 0);
    });

    it('last point is at 20000Hz', () => {
      const pts = generateFilterResponse(1000, 2, 'lowpass');
      expect(pts[pts.length - 1].freq).toBeCloseTo(20000, 0);
    });

    it('frequencies are monotonically increasing', () => {
      const pts = generateFilterResponse(1000, 2, 'lowpass');
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].freq).toBeGreaterThan(pts[i - 1].freq);
      }
    });

    it('all dB values are finite', () => {
      const pts = generateFilterResponse(1000, 4, 'bandpass');
      for (const p of pts) {
        expect(isFinite(p.db)).toBe(true);
      }
    });
  });
});

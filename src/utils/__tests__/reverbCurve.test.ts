import { describe, it, expect } from 'vitest';
import { generateReverbEnvelope, decayAtTime } from '../reverbCurve';

describe('reverbCurve', () => {
  describe('decayAtTime', () => {
    it('returns 1.0 at t=0 (start of tail)', () => {
      expect(decayAtTime(0, 2, 0.5)).toBe(1);
    });

    it('returns 0 at negative time (pre-delay region)', () => {
      expect(decayAtTime(-0.01, 2, 0.5)).toBe(0);
    });

    it('decays toward 0 at t=decay', () => {
      // At t=decayTime, amplitude should be very low (near -60dB ≈ 0.001)
      const val = decayAtTime(2, 2, 0.5);
      expect(val).toBeLessThan(0.01);
    });

    it('longer decay time gives higher amplitude at same t', () => {
      const short = decayAtTime(1, 1.5, 0.5);
      const long = decayAtTime(1, 5, 0.5);
      expect(long).toBeGreaterThan(short);
    });

    it('higher damping (0=none, 1=max) reduces high-frequency decay speed', () => {
      // Higher damping means the tail decays faster
      const lowDamp = decayAtTime(1, 3, 0);
      const highDamp = decayAtTime(1, 3, 1);
      expect(highDamp).toBeLessThan(lowDamp);
    });

    it('output is in [0, 1] range', () => {
      for (let t = 0; t <= 5; t += 0.1) {
        const v = decayAtTime(t, 3, 0.5);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('amplitude is monotonically decreasing after t=0', () => {
      let prev = 1;
      for (let t = 0; t <= 3; t += 0.05) {
        const v = decayAtTime(t, 3, 0.5);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
      }
    });
  });

  describe('generateReverbEnvelope', () => {
    it('generates correct number of points', () => {
      const pts = generateReverbEnvelope(2, 0.02, 0.5, 0.5, 100);
      expect(pts).toHaveLength(101);
    });

    it('first point time starts at 0', () => {
      const pts = generateReverbEnvelope(2, 0.02, 0.5, 0.5);
      expect(pts[0].t).toBe(0);
    });

    it('pre-delay region has zero amplitude', () => {
      const preDelayMs = 50; // 50ms
      const pts = generateReverbEnvelope(2, preDelayMs / 1000, 0.5, 0.5, 200);
      // All points within pre-delay should have amplitude 0
      const preDelayPoints = pts.filter(p => p.t < preDelayMs / 1000 - 0.001);
      for (const p of preDelayPoints) {
        expect(p.amplitude).toBe(0);
      }
    });

    it('tail amplitude starts at 1 after pre-delay', () => {
      const pts = generateReverbEnvelope(2, 0, 0.5, 0.5, 200);
      // With no pre-delay, first point should have amplitude close to 1
      expect(pts[0].amplitude).toBeCloseTo(1, 3);
    });

    it('amplitude is non-negative', () => {
      const pts = generateReverbEnvelope(3, 0.02, 0.7, 0.3);
      for (const p of pts) {
        expect(p.amplitude).toBeGreaterThanOrEqual(0);
      }
    });

    it('higher erLevel gives more prominent early reflections', () => {
      const highEr = generateReverbEnvelope(2, 0.01, 0.5, 0.8);
      const lowEr = generateReverbEnvelope(2, 0.01, 0.5, 0.1);
      // erLevel affects early part — check max amplitude
      const maxHigh = Math.max(...highEr.slice(0, 20).map(p => p.amplitude));
      const maxLow = Math.max(...lowEr.slice(0, 20).map(p => p.amplitude));
      expect(maxHigh).toBeGreaterThanOrEqual(maxLow);
    });
  });
});

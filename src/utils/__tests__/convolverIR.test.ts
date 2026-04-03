import { describe, it, expect } from 'vitest';
import {
  generateIREnvelope,
  getIRReflections,
  getERBoundary,
  getIRLength,
} from '../convolverIR';

describe('convolverIR', () => {
  describe('generateIREnvelope', () => {
    it('returns correct number of points', () => {
      const pts = generateIREnvelope('smallRoom', 0, 100);
      expect(pts).toHaveLength(101); // 0..100 inclusive
    });

    it('starts at zero amplitude during pre-delay', () => {
      const pts = generateIREnvelope('largeHall', 50, 200);
      const preDelayPts = pts.filter((p) => p.t < 0.05);
      for (const p of preDelayPts) {
        expect(p.amplitude).toBe(0);
      }
    });

    it('decays over time after pre-delay', () => {
      const pts = generateIREnvelope('smallRoom', 0, 200);
      const earlyAmp = pts[10].amplitude;
      const lateAmp = pts[180].amplitude;
      expect(earlyAmp).toBeGreaterThan(lateAmp);
    });

    it('amplitude stays within 0–1 range', () => {
      for (const irType of ['smallRoom', 'largeHall', 'plate', 'spring'] as const) {
        const pts = generateIREnvelope(irType, 20);
        for (const p of pts) {
          expect(p.amplitude).toBeGreaterThanOrEqual(0);
          expect(p.amplitude).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('getIRReflections', () => {
    it('returns early reflection spikes', () => {
      const reflections = getIRReflections('largeHall', 0);
      expect(reflections.length).toBeGreaterThan(0);
      expect(reflections.length).toBeLessThanOrEqual(12);
    });

    it('offsets spikes by pre-delay', () => {
      const withoutPD = getIRReflections('plate', 0);
      const withPD = getIRReflections('plate', 50);
      for (let i = 0; i < withoutPD.length; i++) {
        expect(withPD[i].t).toBeGreaterThan(withoutPD[i].t);
      }
    });

    it('reflection amplitudes decrease over time', () => {
      const reflections = getIRReflections('smallRoom', 0);
      for (let i = 1; i < reflections.length; i++) {
        expect(reflections[i].amplitude).toBeLessThan(reflections[i - 1].amplitude);
      }
    });
  });

  describe('getERBoundary', () => {
    it('returns positive value for all IR types', () => {
      for (const irType of ['smallRoom', 'largeHall', 'plate', 'spring'] as const) {
        expect(getERBoundary(irType, 0)).toBeGreaterThan(0);
      }
    });

    it('includes pre-delay offset', () => {
      const boundary0 = getERBoundary('largeHall', 0);
      const boundary50 = getERBoundary('largeHall', 50);
      expect(boundary50 - boundary0).toBeCloseTo(0.05, 2); // 50ms = 0.05s
    });
  });

  describe('getIRLength', () => {
    it('largeHall is longer than smallRoom', () => {
      expect(getIRLength('largeHall', 0)).toBeGreaterThan(getIRLength('smallRoom', 0));
    });

    it('includes pre-delay in total length', () => {
      const base = getIRLength('plate', 0);
      const withPD = getIRLength('plate', 100);
      expect(withPD - base).toBeCloseTo(0.1, 2); // 100ms = 0.1s
    });
  });
});

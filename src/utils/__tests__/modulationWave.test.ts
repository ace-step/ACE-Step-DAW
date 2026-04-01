import { describe, it, expect } from 'vitest';
import {
  generateLfoWave,
  generateStereoLfo,
  generateCombSweep,
  generatePhaserSweep,
} from '../modulationWave';

describe('modulationWave', () => {
  describe('generateLfoWave', () => {
    it('sine wave has correct range (-1 to +1)', () => {
      const pts = generateLfoWave('sine', 200);
      const min = Math.min(...pts.map((p) => p.y));
      const max = Math.max(...pts.map((p) => p.y));
      expect(min).toBeGreaterThanOrEqual(-1.01);
      expect(max).toBeLessThanOrEqual(1.01);
      expect(min).toBeLessThan(-0.95);
      expect(max).toBeGreaterThan(0.95);
    });

    it('triangle wave has correct range', () => {
      const pts = generateLfoWave('triangle', 200);
      const min = Math.min(...pts.map((p) => p.y));
      const max = Math.max(...pts.map((p) => p.y));
      expect(min).toBeGreaterThanOrEqual(-1.01);
      expect(max).toBeLessThanOrEqual(1.01);
    });

    it('generates correct number of points', () => {
      const pts = generateLfoWave('sine', 50);
      expect(pts).toHaveLength(51); // 0..50 inclusive
    });

    it('x values span 0 to 1', () => {
      const pts = generateLfoWave('sine', 100);
      expect(pts[0].x).toBe(0);
      expect(pts[pts.length - 1].x).toBe(1);
    });

    it('phase offset shifts the waveform', () => {
      const noPhase = generateLfoWave('sine', 100, 0);
      const withPhase = generateLfoWave('sine', 100, 0.25);
      // At x=0, sine with 0 phase should be ~0, with 0.25 phase should be ~1
      expect(Math.abs(noPhase[0].y)).toBeLessThan(0.1);
      expect(withPhase[0].y).toBeGreaterThan(0.9);
    });
  });

  describe('generateStereoLfo', () => {
    it('returns left and right channels', () => {
      const { left, right } = generateStereoLfo(0.5);
      expect(left.length).toBeGreaterThan(0);
      expect(right.length).toBeGreaterThan(0);
      expect(left.length).toBe(right.length);
    });

    it('depth scales amplitude', () => {
      const full = generateStereoLfo(1.0);
      const half = generateStereoLfo(0.5);
      const fullMax = Math.max(...full.left.map((p) => Math.abs(p.y)));
      const halfMax = Math.max(...half.left.map((p) => Math.abs(p.y)));
      expect(fullMax).toBeGreaterThan(halfMax * 1.5);
    });

    it('stereo channels are different (phase offset)', () => {
      const { left, right } = generateStereoLfo(1.0, 0.25);
      // At the first sample, L and R should differ
      expect(Math.abs(left[0].y - right[0].y)).toBeGreaterThan(0.5);
    });
  });

  describe('generateCombSweep', () => {
    it('returns delay and feedback lines', () => {
      const { delayLine, feedbackLine } = generateCombSweep(3, 0.7, 0.5);
      expect(delayLine.length).toBeGreaterThan(0);
      expect(feedbackLine.length).toBeGreaterThan(0);
    });

    it('delay line oscillates around center', () => {
      const { delayLine } = generateCombSweep(5, 0.8, 0);
      const values = delayLine.map((p) => p.y);
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(max).toBeGreaterThan(min);
    });
  });

  describe('generatePhaserSweep', () => {
    it('returns sweep and notch count', () => {
      const { sweep, notchCount } = generatePhaserSweep(1000, 0.7, 4);
      expect(sweep.length).toBeGreaterThan(0);
      expect(notchCount).toBe(2); // 4 stages / 2
    });

    it('sweep values are in 0–1 range (normalized log frequency)', () => {
      const { sweep } = generatePhaserSweep(1000, 1.0, 6);
      for (const p of sweep) {
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    });

    it('higher depth gives wider sweep', () => {
      const narrow = generatePhaserSweep(1000, 0.2, 4);
      const wide = generatePhaserSweep(1000, 1.0, 4);
      const narrowRange = Math.max(...narrow.sweep.map((p) => p.y)) - Math.min(...narrow.sweep.map((p) => p.y));
      const wideRange = Math.max(...wide.sweep.map((p) => p.y)) - Math.min(...wide.sweep.map((p) => p.y));
      expect(wideRange).toBeGreaterThan(narrowRange);
    });
  });
});

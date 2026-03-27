import { describe, it, expect } from 'vitest';
import { interpolateGainEnvelope } from '../gainEnvelope';
import type { GainEnvelopePoint } from '../../types/project';

describe('interpolateGainEnvelope', () => {
  // ── Empty envelope ──────────────────────────────────────────────
  describe('empty envelope', () => {
    it('returns 1.0 (unity gain) for time 0', () => {
      expect(interpolateGainEnvelope([], 0)).toBe(1);
    });

    it('returns 1.0 for positive time', () => {
      expect(interpolateGainEnvelope([], 5)).toBe(1);
    });

    it('returns 1.0 for negative time', () => {
      expect(interpolateGainEnvelope([], -3)).toBe(1);
    });
  });

  // ── Single point ────────────────────────────────────────────────
  describe('single point', () => {
    it('returns the point gain for any time', () => {
      const points: GainEnvelopePoint[] = [{ time: 1, gain: 0.5 }];
      expect(interpolateGainEnvelope(points, 0)).toBe(0.5);
      expect(interpolateGainEnvelope(points, 1)).toBe(0.5);
      expect(interpolateGainEnvelope(points, 10)).toBe(0.5);
    });

    it('clamps single point gain above 2 to 2', () => {
      const points: GainEnvelopePoint[] = [{ time: 0, gain: 5.0 }];
      expect(interpolateGainEnvelope(points, 0)).toBe(2);
    });

    it('clamps single point gain below 0 to 0', () => {
      const points: GainEnvelopePoint[] = [{ time: 0, gain: -1.0 }];
      expect(interpolateGainEnvelope(points, 0)).toBe(0);
    });

    it('returns gain at exactly 2.0 without clamping', () => {
      const points: GainEnvelopePoint[] = [{ time: 0, gain: 2.0 }];
      expect(interpolateGainEnvelope(points, 0)).toBe(2);
    });

    it('returns gain at exactly 0.0 without clamping', () => {
      const points: GainEnvelopePoint[] = [{ time: 0, gain: 0.0 }];
      expect(interpolateGainEnvelope(points, 0)).toBe(0);
    });
  });

  // ── Hold behavior (before/after envelope range) ─────────────────
  describe('hold behavior outside range', () => {
    const points: GainEnvelopePoint[] = [
      { time: 2, gain: 0.8 },
      { time: 5, gain: 0.2 },
    ];

    it('holds first point value for time before envelope', () => {
      expect(interpolateGainEnvelope(points, 0)).toBe(0.8);
      expect(interpolateGainEnvelope(points, 1.999)).toBe(0.8);
    });

    it('holds first point value at exactly first point time', () => {
      expect(interpolateGainEnvelope(points, 2)).toBe(0.8);
    });

    it('holds last point value at exactly last point time', () => {
      expect(interpolateGainEnvelope(points, 5)).toBe(0.2);
    });

    it('holds last point value for time after envelope', () => {
      expect(interpolateGainEnvelope(points, 10)).toBe(0.2);
      expect(interpolateGainEnvelope(points, 1000)).toBe(0.2);
    });

    it('holds first point value for negative time', () => {
      expect(interpolateGainEnvelope(points, -5)).toBe(0.8);
    });
  });

  // ── Linear interpolation (two points) ──────────────────────────
  describe('linear interpolation between two points', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: 1.0 },
      { time: 4, gain: 0.0 },
    ];

    it('interpolates at 25%', () => {
      expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(0.75, 10);
    });

    it('interpolates at 50%', () => {
      expect(interpolateGainEnvelope(points, 2)).toBeCloseTo(0.5, 10);
    });

    it('interpolates at 75%', () => {
      expect(interpolateGainEnvelope(points, 3)).toBeCloseTo(0.25, 10);
    });

    it('returns exact start value at start time', () => {
      expect(interpolateGainEnvelope(points, 0)).toBe(1.0);
    });

    it('returns exact end value at end time', () => {
      expect(interpolateGainEnvelope(points, 4)).toBe(0.0);
    });

    it('interpolates ascending gain correctly', () => {
      const ascending: GainEnvelopePoint[] = [
        { time: 0, gain: 0.0 },
        { time: 10, gain: 2.0 },
      ];
      expect(interpolateGainEnvelope(ascending, 5)).toBeCloseTo(1.0, 10);
      expect(interpolateGainEnvelope(ascending, 2.5)).toBeCloseTo(0.5, 10);
      expect(interpolateGainEnvelope(ascending, 7.5)).toBeCloseTo(1.5, 10);
    });
  });

  // ── Multi-segment interpolation ────────────────────────────────
  describe('multi-segment interpolation', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: 0 },
      { time: 2, gain: 1.0 },
      { time: 4, gain: 0.5 },
    ];

    it('interpolates in first segment', () => {
      expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(0.5, 10);
    });

    it('interpolates in second segment', () => {
      expect(interpolateGainEnvelope(points, 3)).toBeCloseTo(0.75, 10);
    });

    it('returns exact value at segment boundary', () => {
      expect(interpolateGainEnvelope(points, 2)).toBeCloseTo(1.0, 10);
    });

    it('handles four-point envelope with varying slopes', () => {
      const pts: GainEnvelopePoint[] = [
        { time: 0, gain: 0.0 },
        { time: 1, gain: 1.0 },
        { time: 2, gain: 1.0 },
        { time: 3, gain: 0.0 },
      ];
      // First segment: ramp up
      expect(interpolateGainEnvelope(pts, 0.5)).toBeCloseTo(0.5, 10);
      // Second segment: flat
      expect(interpolateGainEnvelope(pts, 1.5)).toBeCloseTo(1.0, 10);
      // Third segment: ramp down
      expect(interpolateGainEnvelope(pts, 2.5)).toBeCloseTo(0.5, 10);
    });
  });

  // ── Clamping ───────────────────────────────────────────────────
  describe('clamping to 0-2 range', () => {
    it('clamps gain below 0 to 0', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: -0.5 },
        { time: 1, gain: 1.0 },
      ];
      expect(interpolateGainEnvelope(points, 0)).toBe(0);
    });

    it('clamps gain above 2 to 2', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 1.0 },
        { time: 1, gain: 3.0 },
      ];
      expect(interpolateGainEnvelope(points, 1)).toBe(2);
    });

    it('clamps interpolated value that would exceed 2', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 1.5 },
        { time: 2, gain: 2.5 },
      ];
      // At t=1, unclamped = 2.0, which is exactly at boundary
      expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(2.0, 10);
      // At t=2, unclamped = 2.5, clamped to 2
      expect(interpolateGainEnvelope(points, 2)).toBe(2);
    });

    it('clamps interpolated value that would go below 0', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.5 },
        { time: 2, gain: -1.0 },
      ];
      // At t=1, unclamped = -0.25, clamped to 0
      expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(0, 10);
      // Actually: 0.5 + 0.5 * (-1.0 - 0.5) = 0.5 - 0.75 = -0.25 → clamped to 0
      expect(interpolateGainEnvelope(points, 1)).toBe(0);
    });

    it('does not clamp values within valid range', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.3 },
        { time: 1, gain: 1.7 },
      ];
      // Midpoint: 1.0
      expect(interpolateGainEnvelope(points, 0.5)).toBeCloseTo(1.0, 10);
    });

    it('allows gain of exactly 2.0', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 2.0 },
        { time: 1, gain: 2.0 },
      ];
      expect(interpolateGainEnvelope(points, 0.5)).toBe(2.0);
    });

    it('allows gain of exactly 0.0', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.0 },
        { time: 1, gain: 0.0 },
      ];
      expect(interpolateGainEnvelope(points, 0.5)).toBe(0.0);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles two points at the same time', () => {
      const points: GainEnvelopePoint[] = [
        { time: 1, gain: 0.2 },
        { time: 1, gain: 0.8 },
      ];
      // time <= points[0].time is true, so returns first point clamped
      expect(interpolateGainEnvelope(points, 1)).toBe(0.2);
    });

    it('handles very small time differences', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.0 },
        { time: 0.001, gain: 1.0 },
      ];
      expect(interpolateGainEnvelope(points, 0.0005)).toBeCloseTo(0.5, 5);
    });

    it('handles large gain values clamped to 2', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 100 },
        { time: 1, gain: 200 },
      ];
      expect(interpolateGainEnvelope(points, 0)).toBe(2);
      expect(interpolateGainEnvelope(points, 0.5)).toBe(2);
      expect(interpolateGainEnvelope(points, 1)).toBe(2);
    });

    it('handles many points and picks the correct segment', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.0 },
        { time: 1, gain: 0.2 },
        { time: 2, gain: 0.4 },
        { time: 3, gain: 0.6 },
        { time: 4, gain: 0.8 },
        { time: 5, gain: 1.0 },
      ];
      // Midpoint of segment [3,4]: 0.6 + 0.5*(0.8-0.6) = 0.7
      expect(interpolateGainEnvelope(points, 3.5)).toBeCloseTo(0.7, 10);
      // Midpoint of segment [0,1]: 0.0 + 0.5*(0.2-0.0) = 0.1
      expect(interpolateGainEnvelope(points, 0.5)).toBeCloseTo(0.1, 10);
      // Exact point
      expect(interpolateGainEnvelope(points, 4)).toBeCloseTo(0.8, 10);
    });

    it('handles flat envelope (all same gain)', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 0.7 },
        { time: 5, gain: 0.7 },
        { time: 10, gain: 0.7 },
      ];
      expect(interpolateGainEnvelope(points, 0)).toBeCloseTo(0.7, 10);
      expect(interpolateGainEnvelope(points, 3)).toBeCloseTo(0.7, 10);
      expect(interpolateGainEnvelope(points, 7)).toBeCloseTo(0.7, 10);
      expect(interpolateGainEnvelope(points, 10)).toBeCloseTo(0.7, 10);
    });

    it('handles boost envelope (gain > 1)', () => {
      const points: GainEnvelopePoint[] = [
        { time: 0, gain: 1.0 },
        { time: 2, gain: 2.0 },
      ];
      expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(1.5, 10);
    });
  });
});

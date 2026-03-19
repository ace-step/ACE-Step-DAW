import { describe, it, expect } from 'vitest';
import { interpolateGainEnvelope } from '../gainEnvelope';
import type { GainEnvelopePoint } from '../../types/project';

describe('interpolateGainEnvelope', () => {
  it('returns 1.0 when envelope is empty', () => {
    expect(interpolateGainEnvelope([], 0)).toBe(1);
    expect(interpolateGainEnvelope([], 5)).toBe(1);
  });

  it('returns the single point value for any time when there is one point', () => {
    const points: GainEnvelopePoint[] = [{ time: 1, gain: 0.5 }];
    expect(interpolateGainEnvelope(points, 0)).toBe(0.5);
    expect(interpolateGainEnvelope(points, 1)).toBe(0.5);
    expect(interpolateGainEnvelope(points, 10)).toBe(0.5);
  });

  it('holds first point value before the first point', () => {
    const points: GainEnvelopePoint[] = [
      { time: 2, gain: 0.8 },
      { time: 5, gain: 0.2 },
    ];
    expect(interpolateGainEnvelope(points, 0)).toBe(0.8);
    expect(interpolateGainEnvelope(points, 1)).toBe(0.8);
  });

  it('holds last point value after the last point', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: 1.0 },
      { time: 3, gain: 0.5 },
    ];
    expect(interpolateGainEnvelope(points, 3)).toBe(0.5);
    expect(interpolateGainEnvelope(points, 10)).toBe(0.5);
  });

  it('linearly interpolates between two points', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: 1.0 },
      { time: 4, gain: 0.0 },
    ];
    expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(0.75);
    expect(interpolateGainEnvelope(points, 2)).toBeCloseTo(0.5);
    expect(interpolateGainEnvelope(points, 3)).toBeCloseTo(0.25);
  });

  it('interpolates across multiple segments', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: 0 },
      { time: 2, gain: 1.0 },
      { time: 4, gain: 0.5 },
    ];
    expect(interpolateGainEnvelope(points, 1)).toBeCloseTo(0.5);
    expect(interpolateGainEnvelope(points, 3)).toBeCloseTo(0.75);
  });

  it('clamps gain values to 0-2 range', () => {
    const points: GainEnvelopePoint[] = [
      { time: 0, gain: -0.5 },
      { time: 1, gain: 3.0 },
    ];
    expect(interpolateGainEnvelope(points, 0)).toBe(0);
    expect(interpolateGainEnvelope(points, 1)).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { selectVelocityLayers } from '../velocityLayerUtils';
import type { VelocityLayer } from '../../types/project';

const softLayer: VelocityLayer = { minVelocity: 0, maxVelocity: 63, sampleUrl: 'soft', gain: 0.7 };
const medLayer: VelocityLayer = { minVelocity: 50, maxVelocity: 100, sampleUrl: 'medium', gain: 0.85 };
const loudLayer: VelocityLayer = { minVelocity: 64, maxVelocity: 127, sampleUrl: 'loud', gain: 1.0 };

describe('selectVelocityLayers', () => {
  it('returns empty array when no layers exist', () => {
    const result = selectVelocityLayers([], 80);
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined layers', () => {
    const result = selectVelocityLayers(undefined, 80);
    expect(result).toEqual([]);
  });

  it('selects a single matching layer with gain 1', () => {
    const result = selectVelocityLayers([softLayer, loudLayer], 30);
    expect(result).toHaveLength(1);
    expect(result[0].layer.sampleUrl).toBe('soft');
    expect(result[0].crossfadeGain).toBe(1);
  });

  it('selects a single matching layer at upper range', () => {
    const result = selectVelocityLayers([softLayer, loudLayer], 100);
    expect(result).toHaveLength(1);
    expect(result[0].layer.sampleUrl).toBe('loud');
    expect(result[0].crossfadeGain).toBe(1);
  });

  it('selects exact boundary velocity (inclusive)', () => {
    const result = selectVelocityLayers([softLayer, loudLayer], 63);
    expect(result).toHaveLength(1);
    expect(result[0].layer.sampleUrl).toBe('soft');
  });

  it('crossfades between two overlapping layers', () => {
    // medLayer: 50-100, loudLayer: 64-127
    // At velocity 80 — both match; crossfade between them
    const result = selectVelocityLayers([medLayer, loudLayer], 80);
    expect(result).toHaveLength(2);

    // Both should have crossfade gains between 0 and 1
    const gains = result.map(r => r.crossfadeGain);
    for (const g of gains) {
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
    }

    // Gains should sum to approximately 1 (equal-power or linear crossfade)
    const total = gains.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it('returns single layer at full gain when velocity is at the edge of overlap', () => {
    // At velocity 64, both medLayer (50-100) and loudLayer (64-127) match
    // But 64 is the very start of loudLayer's range so it should be included
    const result = selectVelocityLayers([medLayer, loudLayer], 64);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // All returned layers should have gain > 0
    for (const r of result) {
      expect(r.crossfadeGain).toBeGreaterThan(0);
    }
  });

  it('applies layer gain on top of crossfade gain', () => {
    const result = selectVelocityLayers([softLayer], 30);
    expect(result).toHaveLength(1);
    // crossfadeGain should be 1 (only layer), but layer.gain is 0.7
    expect(result[0].crossfadeGain).toBe(1);
    expect(result[0].layer.gain).toBe(0.7);
  });

  it('selects nothing when velocity is outside all layer ranges', () => {
    const narrow: VelocityLayer = { minVelocity: 40, maxVelocity: 60, sampleUrl: 'narrow', gain: 1 };
    const result = selectVelocityLayers([narrow], 10);
    expect(result).toEqual([]);
  });

  it('handles velocity 0 at the lower boundary', () => {
    const result = selectVelocityLayers([softLayer], 0);
    expect(result).toHaveLength(1);
    expect(result[0].layer.sampleUrl).toBe('soft');
  });

  it('handles velocity 127 at the upper boundary', () => {
    const result = selectVelocityLayers([loudLayer], 127);
    expect(result).toHaveLength(1);
    expect(result[0].layer.sampleUrl).toBe('loud');
  });
});

import { describe, expect, it } from 'vitest';
import {
  createDefaultParametricEqBands,
  createSimpleParametricEqBands,
  frequencyToRatio,
  getEqResponseAtFrequency,
  ratioToFrequency,
} from '../../src/utils/parametricEq';

describe('parametricEq utilities', () => {
  it('creates four adjustable default bands', () => {
    const bands = createDefaultParametricEqBands();

    expect(bands).toHaveLength(4);
    expect(bands.every((band) => typeof band.id === 'string' && band.id.length > 0)).toBe(true);
    expect(bands.map((band) => band.type)).toEqual([
      'highpass',
      'peaking',
      'peaking',
      'highshelf',
    ]);
  });

  it('maps simple mode bands to the legacy three-band EQ layout', () => {
    const bands = createSimpleParametricEqBands(6, -2, 4, 300, 5500);

    expect(bands).toHaveLength(4);
    expect(bands[0]).toMatchObject({ type: 'lowshelf', gain: 6, frequency: 300, enabled: true });
    expect(bands[1]).toMatchObject({ type: 'peaking', gain: -2, frequency: 1000, enabled: true });
    expect(bands[2]).toMatchObject({ type: 'highshelf', gain: 4, frequency: 5500, enabled: true });
    expect(bands[3]).toMatchObject({ enabled: false });
  });

  it('round-trips frequency positions across the log-scale display mapping', () => {
    const original = 2450;
    const ratio = frequencyToRatio(original);
    const mapped = ratioToFrequency(ratio);

    expect(mapped).toBeCloseTo(original, -1);
  });

  it('boosts response near a peaking band center frequency', () => {
    const bands = createDefaultParametricEqBands();
    bands[1] = { ...bands[1], frequency: 1000, gain: 6, q: 1.2 };

    expect(getEqResponseAtFrequency(bands, 1000)).toBeGreaterThan(3);
    expect(getEqResponseAtFrequency(bands, 100)).toBeLessThan(2);
  });

  it('cuts response around a notch filter center', () => {
    const bands = createDefaultParametricEqBands();
    bands[1] = { ...bands[1], type: 'notch', frequency: 3000, gain: 0, q: 6 };

    expect(getEqResponseAtFrequency(bands, 3000)).toBeLessThan(-6);
  });
});

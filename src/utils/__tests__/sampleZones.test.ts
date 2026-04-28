import { describe, it, expect } from 'vitest';
import {
  matchZones,
  computeZoneCrossfadeGains,
  createDefaultZone,
  validateZones,
} from '../sampleZones';
import type { SampleZone } from '../../types/project';

function zone(overrides: Partial<SampleZone> = {}): SampleZone {
  return createDefaultZone('test-key', { rootNote: 60, ...overrides });
}

describe('matchZones', () => {
  it('returns empty array when no zones exist', () => {
    expect(matchZones([], 60, 100)).toEqual([]);
  });

  it('matches a single zone by pitch and velocity', () => {
    const z = zone({ lowKey: 48, highKey: 72, lowVelocity: 0, highVelocity: 127 });
    expect(matchZones([z], 60, 100)).toEqual([z]);
  });

  it('does not match when pitch is outside key range', () => {
    const z = zone({ lowKey: 48, highKey: 72 });
    expect(matchZones([z], 73, 100)).toEqual([]);
    expect(matchZones([z], 47, 100)).toEqual([]);
  });

  it('does not match when velocity is outside range', () => {
    const z = zone({ lowKey: 0, highKey: 127, lowVelocity: 64, highVelocity: 127 });
    expect(matchZones([z], 60, 63)).toEqual([]);
  });

  it('matches inclusive boundaries', () => {
    const z = zone({ lowKey: 60, highKey: 60, lowVelocity: 100, highVelocity: 100 });
    expect(matchZones([z], 60, 100)).toEqual([z]);
  });

  it('returns multiple matching zones for overlapping regions', () => {
    const z1 = zone({ id: 'a', lowKey: 48, highKey: 72, lowVelocity: 0, highVelocity: 127 });
    const z2 = zone({ id: 'b', lowKey: 60, highKey: 84, lowVelocity: 0, highVelocity: 127 });
    const result = matchZones([z1, z2], 66, 80);
    expect(result).toHaveLength(2);
  });

  it('handles velocity layers within key range', () => {
    const soft = zone({ id: 'soft', lowVelocity: 0, highVelocity: 63 });
    const hard = zone({ id: 'hard', lowVelocity: 64, highVelocity: 127 });
    expect(matchZones([soft, hard], 60, 30)).toEqual([soft]);
    expect(matchZones([soft, hard], 60, 100)).toEqual([hard]);
  });
});

describe('computeZoneCrossfadeGains', () => {
  it('returns gain 1.0 for a single zone with no crossfade', () => {
    const z = zone({ lowKey: 48, highKey: 72, crossfadeWidth: 0 });
    expect(computeZoneCrossfadeGains([z], 60)).toEqual([{ zone: z, gain: 1 }]);
  });

  it('returns gain 1.0 when pitch is well inside zone', () => {
    const z = zone({ lowKey: 48, highKey: 72, crossfadeWidth: 4 });
    expect(computeZoneCrossfadeGains([z], 60)).toEqual([{ zone: z, gain: 1 }]);
  });

  it('applies crossfade at low boundary', () => {
    const z = zone({ lowKey: 48, highKey: 72, crossfadeWidth: 4 });
    const result = computeZoneCrossfadeGains([z], 49);
    expect(result).toHaveLength(1);
    expect(result[0].gain).toBeGreaterThan(0);
    expect(result[0].gain).toBeLessThan(1);
  });

  it('applies crossfade at high boundary', () => {
    const z = zone({ lowKey: 48, highKey: 72, crossfadeWidth: 4 });
    const result = computeZoneCrossfadeGains([z], 71);
    expect(result).toHaveLength(1);
    expect(result[0].gain).toBeGreaterThan(0);
    expect(result[0].gain).toBeLessThan(1);
  });

  it('crossfade blends two adjacent zones at boundary', () => {
    const z1 = zone({ id: 'low', lowKey: 48, highKey: 64, crossfadeWidth: 4 });
    const z2 = zone({ id: 'high', lowKey: 65, highKey: 84, crossfadeWidth: 4 });
    // At the boundary between zones, both should have partial gain
    const result = computeZoneCrossfadeGains([z1, z2], 64);
    const totalGain = result.reduce((sum, r) => sum + r.gain, 0);
    // Total gain should be approximately 1.0 (equal-power crossfade)
    expect(totalGain).toBeGreaterThan(0.5);
    expect(totalGain).toBeLessThanOrEqual(1.5);
  });

  it('returns zero crossfade width as full gain', () => {
    const z = zone({ lowKey: 48, highKey: 72, crossfadeWidth: 0 });
    expect(computeZoneCrossfadeGains([z], 48)).toEqual([{ zone: z, gain: 1 }]);
    expect(computeZoneCrossfadeGains([z], 72)).toEqual([{ zone: z, gain: 1 }]);
  });
});

describe('createDefaultZone', () => {
  it('creates a zone with sensible defaults', () => {
    const z = createDefaultZone('audio-key-1');
    expect(z.audioKey).toBe('audio-key-1');
    expect(z.rootNote).toBe(60);
    expect(z.lowKey).toBe(0);
    expect(z.highKey).toBe(127);
    expect(z.lowVelocity).toBe(0);
    expect(z.highVelocity).toBe(127);
    expect(z.volume).toBe(1);
    expect(z.pan).toBe(0);
    expect(z.tuneOffset).toBe(0);
    expect(z.crossfadeWidth).toBe(0);
    expect(z.id).toBeTruthy();
  });

  it('accepts overrides', () => {
    const z = createDefaultZone('key', { rootNote: 48, lowKey: 36, highKey: 60, volume: 0.8 });
    expect(z.rootNote).toBe(48);
    expect(z.lowKey).toBe(36);
    expect(z.highKey).toBe(60);
    expect(z.volume).toBe(0.8);
  });
});

describe('validateZones', () => {
  it('returns no errors for valid zones', () => {
    const z = zone({ lowKey: 48, highKey: 72 });
    expect(validateZones([z])).toEqual([]);
  });

  it('reports lowKey > highKey', () => {
    const z = zone({ lowKey: 80, highKey: 60 });
    const errors = validateZones([z]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('lowKey');
  });

  it('reports lowVelocity > highVelocity', () => {
    const z = zone({ lowVelocity: 100, highVelocity: 50 });
    const errors = validateZones([z]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('lowVelocity');
  });

  it('reports out-of-range values', () => {
    const z = zone({ lowKey: -1, highKey: 200 });
    const errors = validateZones([z]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

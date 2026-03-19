import { describe, expect, it } from 'vitest';
import {
  denormalizeEffectParamValue,
  getNormalizedEffectAutomationValue,
  normalizeEffectParamValue,
} from '../../src/utils/effectAutomation';
import type { TrackEffect } from '../../src/types/project';

describe('effectAutomation utils', () => {
  it('round-trips numeric effect parameters through normalization', () => {
    const normalized = normalizeEffectParamValue('filter', 'frequency', 10010);
    expect(normalized).not.toBeNull();
    expect(denormalizeEffectParamValue('filter', 'frequency', normalized ?? 0)).toBeCloseTo(10010, 5);
  });

  it('reads the normalized value from a track effect target', () => {
    const effect: TrackEffect = {
      id: 'fx-filter',
      type: 'filter',
      enabled: true,
      params: {
        frequency: 5020,
        resonance: 5,
        filterType: 'lowpass',
        lfoEnabled: true,
        lfoRate: 4,
        lfoDepth: 0.25,
      },
    };

    expect(getNormalizedEffectAutomationValue(effect, {
      effectType: 'filter',
      param: 'lfoDepth',
    })).toBeCloseTo(0.25, 5);
  });
});

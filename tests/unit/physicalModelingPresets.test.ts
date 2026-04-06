import { describe, expect, it } from 'vitest';
import {
  ALL_FACTORY_PRESETS,
  getPresetsByKind,
} from '../../src/data/instrumentPresets';

describe('Physical modeling presets in preset browser', () => {
  it('factory presets include physical modeling instruments', () => {
    const physicalPresets = ALL_FACTORY_PRESETS.filter(
      (p) => p.instrumentKind === 'physical',
    );
    expect(physicalPresets.length).toBe(6);
  });

  it('getPresetsByKind returns physical presets', () => {
    const presets = getPresetsByKind('physical');
    expect(presets.length).toBe(6);
    for (const p of presets) {
      expect(p.instrumentKind).toBe('physical');
      expect(p.instrument.kind).toBe('physical');
    }
  });

  it('physical presets have correct names', () => {
    const presets = getPresetsByKind('physical');
    const names = presets.map((p) => p.name).sort();
    expect(names).toEqual([
      'Acoustic Guitar',
      'Bowed String',
      'Harp',
      'Kalimba',
      'Marimba',
      'Steel Drum',
    ]);
  });

  it('physical presets are all factory presets', () => {
    const presets = getPresetsByKind('physical');
    for (const p of presets) {
      expect(p.isFactory).toBe(true);
    }
  });

  it('physical presets all have Physical category', () => {
    const presets = getPresetsByKind('physical');
    for (const p of presets) {
      expect(p.category).toBe('Physical');
    }
  });
});

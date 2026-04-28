import { describe, it, expect } from 'vitest';
import { FACTORY_FM_PRESETS, getFmPresetById } from '../fmPresets';

describe('FM Presets', () => {
  it('has at least 10 factory presets', () => {
    expect(FACTORY_FM_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('all presets have unique ids', () => {
    const ids = FACTORY_FM_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have valid settings', () => {
    for (const preset of FACTORY_FM_PRESETS) {
      expect(preset.settings.carrier.waveform.length).toBeGreaterThan(0);
      expect(preset.settings.modulator.waveform.length).toBeGreaterThan(0);
      expect(preset.settings.modulationIndex).toBeGreaterThanOrEqual(0);
      expect(preset.settings.harmonicity).toBeGreaterThan(0);
      expect(['serial', 'parallel', 'stack', 'feedback']).toContain(preset.settings.algorithm);
      expect(preset.settings.ampEnvelope.attack).toBeGreaterThanOrEqual(0);
      expect(preset.settings.outputGain).toBeGreaterThan(0);
    }
  });

  it('getFmPresetById finds a preset', () => {
    const preset = getFmPresetById('fm-electric-piano');
    expect(preset).not.toBeUndefined();
    expect(preset!.name).toBe('FM Electric Piano');
  });

  it('getFmPresetById returns undefined for unknown id', () => {
    expect(getFmPresetById('nonexistent')).toBeUndefined();
  });

  it('covers all categories', () => {
    const categories = new Set(FACTORY_FM_PRESETS.map((p) => p.category));
    expect(categories.has('Keys')).toBe(true);
    expect(categories.has('Bell')).toBe(true);
    expect(categories.has('Bass')).toBe(true);
    expect(categories.has('Lead')).toBe(true);
  });
});

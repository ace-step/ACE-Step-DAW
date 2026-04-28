import { describe, it, expect } from 'vitest';
import {
  ALL_FACTORY_PRESETS,
  getPresetById,
  getPresetsByCategory,
  getPresetsByKind,
  getCategoriesForKind,
  createUserPreset,
  type InstrumentPreset,
} from '../instrumentPresets';

describe('Unified Instrument Presets', () => {
  it('includes presets from all instrument kinds', () => {
    const kinds = new Set(ALL_FACTORY_PRESETS.map((p) => p.instrumentKind));
    expect(kinds.has('subtractive')).toBe(true);
    expect(kinds.has('fm')).toBe(true);
    expect(kinds.has('wavetable')).toBe(true);
  });

  it('has at least 25 factory presets total', () => {
    // 14 subtractive + 10 FM + 5 wavetable = 29
    expect(ALL_FACTORY_PRESETS.length).toBeGreaterThanOrEqual(25);
  });

  it('all presets have unique ids', () => {
    const ids = ALL_FACTORY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have valid instrument config', () => {
    for (const preset of ALL_FACTORY_PRESETS) {
      expect(preset.instrument).not.toBeUndefined();
      expect(preset.instrument.kind).toBe(preset.instrumentKind);
    }
  });

  describe('getPresetById', () => {
    it('finds a factory preset', () => {
      const preset = getPresetById('factory-sub-bass');
      expect(preset).not.toBeUndefined();
      expect(preset!.name).toBe('Sub Bass');
      expect(preset!.instrumentKind).toBe('subtractive');
    });

    it('finds an FM preset', () => {
      const preset = getPresetById('fm-electric-piano');
      expect(preset).not.toBeUndefined();
      expect(preset!.instrumentKind).toBe('fm');
    });

    it('finds a wavetable preset', () => {
      const preset = getPresetById('wt-basic');
      expect(preset).not.toBeUndefined();
      expect(preset!.instrumentKind).toBe('wavetable');
    });

    it('finds user presets', () => {
      const userPreset: InstrumentPreset = {
        id: 'user-test',
        name: 'Test',
        category: 'Bass',
        instrumentKind: 'fm',
        isFactory: false,
        instrument: { kind: 'fm', preset: 'fm', name: 'Test', fallbackPreset: 'bass', settings: {} as never },
      };
      expect(getPresetById('user-test', [userPreset])?.name).toBe('Test');
    });

    it('returns undefined for unknown id', () => {
      expect(getPresetById('nonexistent')).toBeUndefined();
    });
  });

  describe('getPresetsByCategory', () => {
    it('returns Bass presets across all kinds', () => {
      const bass = getPresetsByCategory('Bass');
      expect(bass.length).toBeGreaterThanOrEqual(5); // 3 subtractive + 2 FM
      const kinds = new Set(bass.map((p) => p.instrumentKind));
      expect(kinds.has('subtractive')).toBe(true);
      expect(kinds.has('fm')).toBe(true);
    });
  });

  describe('getPresetsByKind', () => {
    it('returns only FM presets when filtered', () => {
      const fm = getPresetsByKind('fm');
      expect(fm.length).toBeGreaterThan(0);
      expect(fm.every((p) => p.instrumentKind === 'fm')).toBe(true);
    });

    it('returns all presets when kind is all', () => {
      const all = getPresetsByKind('all');
      expect(all.length).toBe(ALL_FACTORY_PRESETS.length);
    });
  });

  describe('getCategoriesForKind', () => {
    it('returns FM-specific categories', () => {
      const cats = getCategoriesForKind('fm');
      expect(cats).toContain('Keys');
      expect(cats).toContain('Bell');
      expect(cats).toContain('Bass');
    });

    it('returns wavetable category', () => {
      const cats = getCategoriesForKind('wavetable');
      expect(cats).toContain('Wavetable');
    });
  });

  describe('createUserPreset', () => {
    it('creates a preset from a subtractive instrument', () => {
      const instrument = {
        kind: 'subtractive' as const,
        preset: 'bass' as const,
        name: 'Test',
        settings: {
          oscillator: { waveform: 'sine' as const, octave: 0, detuneCents: 0, level: 1 },
          ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
          filter: { enabled: false, type: 'lowpass' as const, cutoffHz: 5000, resonance: 0, drive: 0, keyTracking: 0 },
          filterEnvelope: { enabled: false, attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, amount: 0 },
          lfo: { enabled: false, waveform: 'sine' as const, target: 'off' as const, rateHz: 1, depth: 0.5, retrigger: false },
          unison: { voices: 1, detuneCents: 0, spread: 0 },
          glideTime: 0,
          outputGain: 0.55,
        },
      };
      const preset = createUserPreset('My Bass', 'Bass', instrument);
      expect(preset.id).toMatch(/^user-/);
      expect(preset.name).toBe('My Bass');
      expect(preset.category).toBe('Bass');
      expect(preset.instrumentKind).toBe('subtractive');
      expect(preset.isFactory).toBe(false);
      expect(preset.instrument.kind).toBe('subtractive');
    });

    it('throws when attempting to create a preset from a sampler instrument', () => {
      const samplerInstrument = { kind: 'sampler' as const };
      expect(() => createUserPreset('Drum Kit', 'Bass', samplerInstrument as never)).toThrow(
        'Sampler instruments cannot be saved as instrument presets',
      );
    });
  });
});

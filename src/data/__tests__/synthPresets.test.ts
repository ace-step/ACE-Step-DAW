import { describe, it, expect } from 'vitest';
import {
  FACTORY_SYNTH_PRESETS,
  SYNTH_PRESET_CATEGORIES,
  getSynthPresetsByCategory,
  getSynthPresetById,
  type SynthPresetCategory,
} from '../synthPresets';

describe('synthPresets', () => {
  describe('FACTORY_SYNTH_PRESETS', () => {
    it('should have at least 10 factory presets', () => {
      expect(FACTORY_SYNTH_PRESETS.length).toBeGreaterThanOrEqual(10);
    });

    it('every preset has required fields', () => {
      for (const preset of FACTORY_SYNTH_PRESETS) {
        expect(preset.id.length).toBeGreaterThan(0);
        expect(preset.name.length).toBeGreaterThan(0);
        expect(SYNTH_PRESET_CATEGORIES).toContain(preset.category);
        expect(preset.isFactory).toBe(true);
        expect(preset.waveform.length).toBeGreaterThan(0);
        expect(preset.envelope).not.toBeUndefined();
        expect(typeof preset.envelope.attack).toBe('number');
        expect(typeof preset.envelope.decay).toBe('number');
        expect(typeof preset.envelope.sustain).toBe('number');
        expect(typeof preset.envelope.release).toBe('number');
        expect(typeof preset.legacyPreset).toBe('string');
      }
    });

    it('all preset IDs are unique', () => {
      const ids = FACTORY_SYNTH_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all preset names are unique', () => {
      const names = FACTORY_SYNTH_PRESETS.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('SYNTH_PRESET_CATEGORIES', () => {
    it('includes expected categories', () => {
      expect(SYNTH_PRESET_CATEGORIES).toContain('Bass');
      expect(SYNTH_PRESET_CATEGORIES).toContain('Lead');
      expect(SYNTH_PRESET_CATEGORIES).toContain('Pad');
      expect(SYNTH_PRESET_CATEGORIES).toContain('Pluck');
      expect(SYNTH_PRESET_CATEGORIES).toContain('FX');
      expect(SYNTH_PRESET_CATEGORIES).toContain('Keys');
    });
  });

  describe('getSynthPresetsByCategory', () => {
    it('returns only presets of the given category', () => {
      const bassPresets = getSynthPresetsByCategory('Bass');
      expect(bassPresets.length).toBeGreaterThan(0);
      for (const p of bassPresets) {
        expect(p.category).toBe('Bass');
      }
    });

    it('returns empty array for unknown category', () => {
      const result = getSynthPresetsByCategory('NonExistent' as SynthPresetCategory);
      expect(result).toEqual([]);
    });

    it('includes user presets when provided', () => {
      const userPreset = {
        id: 'user-test',
        name: 'Test User Bass',
        category: 'Bass' as SynthPresetCategory,
        isFactory: false,
        waveform: 'sine' as const,
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
        legacyPreset: 'bass' as const,
      };
      const bassPresets = getSynthPresetsByCategory('Bass', [userPreset]);
      expect(bassPresets).toContain(userPreset);
    });
  });

  describe('getSynthPresetById', () => {
    it('returns the preset with matching id', () => {
      const first = FACTORY_SYNTH_PRESETS[0];
      const found = getSynthPresetById(first.id);
      expect(found).toBe(first);
    });

    it('returns undefined for unknown id', () => {
      expect(getSynthPresetById('no-such-preset')).toBeUndefined();
    });

    it('finds user presets when provided', () => {
      const userPreset = {
        id: 'user-find-test',
        name: 'Find Test',
        category: 'Lead' as SynthPresetCategory,
        isFactory: false,
        waveform: 'square' as const,
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
        legacyPreset: 'lead' as const,
      };
      const found = getSynthPresetById('user-find-test', [userPreset]);
      expect(found).toBe(userPreset);
    });
  });

  describe('envelope values are within valid ranges', () => {
    it('all envelopes have non-negative values and sustain <= 1', () => {
      for (const preset of FACTORY_SYNTH_PRESETS) {
        expect(preset.envelope.attack).toBeGreaterThanOrEqual(0);
        expect(preset.envelope.decay).toBeGreaterThanOrEqual(0);
        expect(preset.envelope.sustain).toBeGreaterThanOrEqual(0);
        expect(preset.envelope.sustain).toBeLessThanOrEqual(1);
        expect(preset.envelope.release).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('filter settings are valid when present', () => {
    it('filter cutoffHz is positive when enabled', () => {
      for (const preset of FACTORY_SYNTH_PRESETS) {
        if (preset.filter?.enabled) {
          expect(preset.filter.cutoffHz).toBeGreaterThan(0);
          expect(preset.filter.type.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

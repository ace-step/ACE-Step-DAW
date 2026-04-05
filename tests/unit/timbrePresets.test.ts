import { describe, it, expect } from 'vitest';
import {
  TIMBRE_PRESETS,
  TIMBRE_CATEGORIES,
  getTimbrePresetById,
  getTimbrePresetsByCategory,
  buildPromptWithTimbre,
  type TimbrePreset,
  type TimbreCategory,
} from '../../src/data/timbrePresets';

describe('timbrePresets', () => {
  describe('TIMBRE_PRESETS', () => {
    it('contains at least 30 factory presets', () => {
      expect(TIMBRE_PRESETS.length).toBeGreaterThanOrEqual(30);
    });

    it('all preset IDs are unique', () => {
      const ids = TIMBRE_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each preset has required fields', () => {
      for (const p of TIMBRE_PRESETS) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.category).toBeTruthy();
        expect(p.promptFragment).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(TIMBRE_CATEGORIES).toContain(p.category);
      }
    });

    it('each preset has a non-empty promptFragment', () => {
      for (const p of TIMBRE_PRESETS) {
        expect(p.promptFragment.length).toBeGreaterThan(10);
      }
    });
  });

  describe('TIMBRE_CATEGORIES', () => {
    it('contains at least 5 categories', () => {
      expect(TIMBRE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it('has unique entries', () => {
      expect(new Set(TIMBRE_CATEGORIES).size).toBe(TIMBRE_CATEGORIES.length);
    });

    it('includes expected categories', () => {
      expect(TIMBRE_CATEGORIES).toContain('Vocal Styles');
      expect(TIMBRE_CATEGORIES).toContain('Guitar Tones');
      expect(TIMBRE_CATEGORIES).toContain('Synth Textures');
    });
  });

  describe('getTimbrePresetById', () => {
    it('returns preset for valid ID', () => {
      const first = TIMBRE_PRESETS[0];
      const result = getTimbrePresetById(first.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(first.id);
      expect(result!.name).toBe(first.name);
    });

    it('returns undefined for invalid ID', () => {
      expect(getTimbrePresetById('non-existent')).toBeUndefined();
    });
  });

  describe('getTimbrePresetsByCategory', () => {
    it('returns presets matching category', () => {
      for (const cat of TIMBRE_CATEGORIES) {
        const filtered = getTimbrePresetsByCategory(cat);
        expect(filtered.length).toBeGreaterThanOrEqual(1);
        for (const p of filtered) {
          expect(p.category).toBe(cat);
        }
      }
    });

    it('returns empty array for unknown category', () => {
      expect(getTimbrePresetsByCategory('Unknown' as TimbreCategory)).toEqual([]);
    });
  });

  describe('buildPromptWithTimbre', () => {
    it('prepends timbre fragment to user prompt', () => {
      const preset = TIMBRE_PRESETS[0];
      const result = buildPromptWithTimbre('my song about love', preset);
      expect(result).toContain(preset.promptFragment);
      expect(result).toContain('my song about love');
    });

    it('returns just timbre fragment when prompt is empty', () => {
      const preset = TIMBRE_PRESETS[0];
      const result = buildPromptWithTimbre('', preset);
      expect(result).toBe(preset.promptFragment);
    });

    it('returns just user prompt when preset is null', () => {
      const result = buildPromptWithTimbre('my cool song', null);
      expect(result).toBe('my cool song');
    });

    it('does not duplicate if prompt already contains the fragment', () => {
      const preset = TIMBRE_PRESETS[0];
      const result = buildPromptWithTimbre(preset.promptFragment + ', my song', preset);
      // Should not have the fragment twice
      const count = result.split(preset.promptFragment).length - 1;
      expect(count).toBe(1);
    });
  });
});

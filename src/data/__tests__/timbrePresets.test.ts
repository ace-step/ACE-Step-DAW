import { describe, it, expect } from 'vitest';
import {
  FACTORY_TIMBRE_PRESETS,
  TIMBRE_CATEGORIES,
  getTimbrePresetById,
  getTimbrePresetsByCategory,
  getAllTimbreCategories,
  createUserTimbrePreset,
  type TimbrePreset,
  type TimbreCategory,
} from '../timbrePresets';

describe('TimbrePreset type structure', () => {
  it('exports at least 30 factory timbre presets', () => {
    expect(FACTORY_TIMBRE_PRESETS.length).toBeGreaterThanOrEqual(30);
  });

  it('each preset has required fields', () => {
    for (const p of FACTORY_TIMBRE_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.promptTemplate).toBeTruthy();
      expect(p.promptTemplate.length).toBeGreaterThan(10);
      expect(p.description).toBeTruthy();
      expect(p.isFactory).toBe(true);
      expect(Array.isArray(p.tags)).toBe(true);
      expect(p.tags.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each preset has unique id', () => {
    const ids = FACTORY_TIMBRE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each preset has unique name', () => {
    const names = FACTORY_TIMBRE_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all categories are from TIMBRE_CATEGORIES', () => {
    for (const p of FACTORY_TIMBRE_PRESETS) {
      expect(TIMBRE_CATEGORIES).toContain(p.category);
    }
  });
});

describe('category coverage', () => {
  it('has presets in at least 7 categories', () => {
    const cats = getAllTimbreCategories();
    expect(cats.length).toBeGreaterThanOrEqual(7);
  });

  it('every category has at least 2 presets', () => {
    const cats = getAllTimbreCategories();
    for (const cat of cats) {
      const presets = getTimbrePresetsByCategory(cat);
      expect(presets.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('getTimbrePresetById', () => {
  it('returns preset by id', () => {
    const first = FACTORY_TIMBRE_PRESETS[0];
    const result = getTimbrePresetById(first.id);
    expect(result).toBe(first);
  });

  it('returns undefined for unknown id', () => {
    expect(getTimbrePresetById('nonexistent')).toBeUndefined();
  });
});

describe('getTimbrePresetsByCategory', () => {
  it('filters by category', () => {
    const cat = FACTORY_TIMBRE_PRESETS[0].category;
    const results = getTimbrePresetsByCategory(cat);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((p) => p.category === cat)).toBe(true);
  });
});

describe('createUserTimbrePreset', () => {
  it('creates a user preset with required fields', () => {
    const preset = createUserTimbrePreset({
      name: 'My Custom Timbre',
      category: 'Vocal Styles',
      promptTemplate: 'smooth jazzy vocal, warm reverb',
      tags: ['jazz', 'vocal'],
      description: 'A custom warm vocal timbre',
    });
    expect(preset.id).toMatch(/^user-timbre-/);
    expect(preset.name).toBe('My Custom Timbre');
    expect(preset.category).toBe('Vocal Styles');
    expect(preset.isFactory).toBe(false);
    expect(preset.promptTemplate).toBe('smooth jazzy vocal, warm reverb');
  });

  it('supports optional referenceAudioKey and coverStrength', () => {
    const preset = createUserTimbrePreset({
      name: 'Ref Timbre',
      category: 'Bass Sounds',
      promptTemplate: 'deep bass',
      tags: ['bass'],
      description: 'Bass with ref',
      referenceAudioKey: 'audio-key-123',
      coverStrength: 0.7,
    });
    expect(preset.referenceAudioKey).toBe('audio-key-123');
    expect(preset.coverStrength).toBe(0.7);
  });

  it('clamps coverStrength to 0-1 range', () => {
    const over = createUserTimbrePreset({
      name: 'Over',
      category: 'Bass Sounds',
      promptTemplate: 'bass',
      tags: ['bass'],
      description: 'test',
      coverStrength: 1.5,
    });
    expect(over.coverStrength).toBe(1);

    const under = createUserTimbrePreset({
      name: 'Under',
      category: 'Bass Sounds',
      promptTemplate: 'bass',
      tags: ['bass'],
      description: 'test',
      coverStrength: -0.3,
    });
    expect(under.coverStrength).toBe(0);
  });

  it('defensively copies tags array', () => {
    const tags = ['jazz', 'vocal'];
    const preset = createUserTimbrePreset({
      name: 'Copy Test',
      category: 'Vocal Styles',
      promptTemplate: 'test',
      tags,
      description: 'test',
    });
    tags.push('mutated');
    expect(preset.tags).toEqual(['jazz', 'vocal']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHYSICAL_MODELING_SETTINGS,
  PHYSICAL_MODELING_PRESETS,
  createPhysicalModelingSettings,
} from '../../src/engine/PhysicalModelingEngine';
import type {
  PhysicalModelingSettings,
  PhysicalExciterType,
  PhysicalModelingPresetName,
} from '../../src/types/project';

// ─── DEFAULT_PHYSICAL_MODELING_SETTINGS ──────────────────────────────────────

describe('DEFAULT_PHYSICAL_MODELING_SETTINGS', () => {
  it('has valid default values', () => {
    const d = DEFAULT_PHYSICAL_MODELING_SETTINGS;
    expect(d.exciter).toBe('pluck');
    expect(d.damping).toBeGreaterThanOrEqual(0);
    expect(d.damping).toBeLessThanOrEqual(1);
    expect(d.brightness).toBeGreaterThanOrEqual(0);
    expect(d.brightness).toBeLessThanOrEqual(1);
    expect(d.pluckPosition).toBeGreaterThan(0);
    expect(d.pluckPosition).toBeLessThan(1);
    expect(d.bodySize).toBeGreaterThanOrEqual(0);
    expect(d.bodySize).toBeLessThanOrEqual(1);
    expect(d.stringTension).toBeGreaterThanOrEqual(0);
    expect(d.stringTension).toBeLessThanOrEqual(1);
    expect(d.gain).toBeGreaterThan(0);
    expect(d.gain).toBeLessThanOrEqual(1);
    expect(d.attack).toBeGreaterThan(0);
    expect(d.release).toBeGreaterThan(0);
    expect(d.presetName).toBe('acousticGuitar');
  });
});

// ─── createPhysicalModelingSettings ─────────────────────────────────────────

describe('createPhysicalModelingSettings', () => {
  it('creates settings with defaults when no overrides provided', () => {
    const settings = createPhysicalModelingSettings();
    expect(settings).toEqual(DEFAULT_PHYSICAL_MODELING_SETTINGS);
  });

  it('applies overrides while keeping other defaults', () => {
    const settings = createPhysicalModelingSettings({
      exciter: 'bow',
      damping: 0.8,
    });
    expect(settings.exciter).toBe('bow');
    expect(settings.damping).toBe(0.8);
    expect(settings.brightness).toBe(DEFAULT_PHYSICAL_MODELING_SETTINGS.brightness);
    expect(settings.bodySize).toBe(DEFAULT_PHYSICAL_MODELING_SETTINGS.bodySize);
  });

  it('override wins for all fields', () => {
    const custom: PhysicalModelingSettings = {
      exciter: 'hammer',
      damping: 0.9,
      brightness: 0.1,
      pluckPosition: 0.2,
      bodySize: 0.8,
      stringTension: 0.3,
      gain: 0.4,
      attack: 0.1,
      release: 0.5,
      presetName: 'custom',
    };
    const settings = createPhysicalModelingSettings(custom);
    expect(settings).toEqual(custom);
  });
});

// ─── PHYSICAL_MODELING_PRESETS ───────────────────────────────────────────────

describe('PHYSICAL_MODELING_PRESETS', () => {
  const presetNames: Exclude<PhysicalModelingPresetName, 'custom'>[] = [
    'acousticGuitar',
    'harp',
    'kalimba',
    'marimba',
    'steelDrum',
    'bowedString',
  ];

  it('contains all 6 presets', () => {
    expect(Object.keys(PHYSICAL_MODELING_PRESETS)).toHaveLength(6);
  });

  it.each(presetNames)('preset "%s" has valid parameter ranges', (name) => {
    const preset = PHYSICAL_MODELING_PRESETS[name];
    expect(preset).toBeDefined();
    expect(['pluck', 'bow', 'hammer']).toContain(preset.exciter);
    expect(preset.damping).toBeGreaterThanOrEqual(0);
    expect(preset.damping).toBeLessThanOrEqual(1);
    expect(preset.brightness).toBeGreaterThanOrEqual(0);
    expect(preset.brightness).toBeLessThanOrEqual(1);
    expect(preset.pluckPosition).toBeGreaterThan(0);
    expect(preset.pluckPosition).toBeLessThanOrEqual(1);
    expect(preset.bodySize).toBeGreaterThanOrEqual(0);
    expect(preset.bodySize).toBeLessThanOrEqual(1);
    expect(preset.stringTension).toBeGreaterThanOrEqual(0);
    expect(preset.stringTension).toBeLessThanOrEqual(1);
    expect(preset.gain).toBeGreaterThan(0);
    expect(preset.gain).toBeLessThanOrEqual(1);
    expect(preset.attack).toBeGreaterThanOrEqual(0);
    expect(preset.release).toBeGreaterThan(0);
    expect(preset.presetName).toBe(name);
  });

  it('acousticGuitar uses pluck exciter', () => {
    expect(PHYSICAL_MODELING_PRESETS.acousticGuitar.exciter).toBe('pluck');
  });

  it('kalimba uses hammer exciter', () => {
    expect(PHYSICAL_MODELING_PRESETS.kalimba.exciter).toBe('hammer');
  });

  it('bowedString uses bow exciter', () => {
    expect(PHYSICAL_MODELING_PRESETS.bowedString.exciter).toBe('bow');
  });

  it('harp has lower damping than marimba for longer sustain', () => {
    expect(PHYSICAL_MODELING_PRESETS.harp.damping).toBeLessThan(
      PHYSICAL_MODELING_PRESETS.marimba.damping,
    );
  });
});

// ─── Exciter types ──────────────────────────────────────────────────────────

describe('exciter types', () => {
  it('all three exciter types are represented in presets', () => {
    const exciterTypes = new Set(
      Object.values(PHYSICAL_MODELING_PRESETS).map((p) => p.exciter),
    );
    expect(exciterTypes.has('pluck')).toBe(true);
    expect(exciterTypes.has('bow')).toBe(true);
    expect(exciterTypes.has('hammer')).toBe(true);
  });
});

// ─── Type system integration ────────────────────────────────────────────────

describe('type system', () => {
  it('PhysicalExciterType covers all valid values', () => {
    const validTypes: PhysicalExciterType[] = ['pluck', 'bow', 'hammer'];
    for (const preset of Object.values(PHYSICAL_MODELING_PRESETS)) {
      expect(validTypes).toContain(preset.exciter);
    }
  });

  it('presetName matches the key in PHYSICAL_MODELING_PRESETS', () => {
    for (const [key, preset] of Object.entries(PHYSICAL_MODELING_PRESETS)) {
      expect(preset.presetName).toBe(key);
    }
  });
});

/**
 * Unified instrument preset system.
 *
 * Wraps all instrument kinds (subtractive, FM, wavetable) into a single
 * browsable preset collection with categories and metadata.
 */

import type { TrackInstrument, PhysicalModelPreset } from '../types/project';
import { FACTORY_SYNTH_PRESETS, type SynthPresetDefinition, type SynthPresetCategory } from './synthPresets';
import { FACTORY_FM_PRESETS, type FmPresetDefinition } from './fmPresets';
import { WAVETABLE_PRESETS, type WavetablePreset } from '../engine/wavetablePresets';
import { PHYSICAL_PRESETS } from '../engine/KarplusStrongEngine';
import { createDefaultSubtractiveInstrument, createDefaultFmInstrument } from '../utils/trackInstrument';

// ---------------------------------------------------------------------------
// Unified preset type
// ---------------------------------------------------------------------------

export type InstrumentPresetCategory = SynthPresetCategory | 'Bell' | 'Wavetable' | 'Physical';

export const ALL_PRESET_CATEGORIES: readonly InstrumentPresetCategory[] = [
  'Bass', 'Lead', 'Pad', 'Pluck', 'FX', 'Keys', 'Bell', 'Wavetable', 'Physical',
] as const;

export type InstrumentKindFilter = 'all' | 'subtractive' | 'fm' | 'wavetable' | 'physical';

export interface InstrumentPreset {
  id: string;
  name: string;
  category: InstrumentPresetCategory;
  instrumentKind: 'subtractive' | 'fm' | 'wavetable' | 'granular' | 'additive' | 'physical';
  isFactory: boolean;
  /** Full instrument config to apply to a track. */
  instrument: TrackInstrument;
}

// ---------------------------------------------------------------------------
// Convert existing presets to unified format
// ---------------------------------------------------------------------------

function subtractiveToUnified(def: SynthPresetDefinition): InstrumentPreset {
  const base = createDefaultSubtractiveInstrument(def.legacyPreset, { name: def.name });
  const instrument: TrackInstrument = {
    ...base,
    settings: {
      ...base.settings,
      oscillator: {
        ...base.settings.oscillator,
        waveform: def.waveform,
        detuneCents: def.detuneCents ?? base.settings.oscillator.detuneCents,
      },
      ampEnvelope: { ...def.envelope },
      filter: def.filter?.enabled
        ? {
            ...base.settings.filter,
            enabled: true,
            type: def.filter.type ?? base.settings.filter.type,
            cutoffHz: def.filter.cutoffHz ?? base.settings.filter.cutoffHz,
            resonance: def.filter.resonance ?? base.settings.filter.resonance,
          }
        : base.settings.filter,
      glideTime: def.glideTime ?? base.settings.glideTime,
      outputGain: def.outputGain ?? base.settings.outputGain,
    },
  };

  return {
    id: def.id,
    name: def.name,
    category: def.category,
    instrumentKind: 'subtractive',
    isFactory: def.isFactory,
    instrument,
  };
}

function fmToUnified(def: FmPresetDefinition): InstrumentPreset {
  const base = createDefaultFmInstrument({ settings: def.settings, name: def.name });
  return {
    id: def.id,
    name: def.name,
    category: def.category as InstrumentPresetCategory,
    instrumentKind: 'fm',
    isFactory: def.isFactory,
    instrument: base,
  };
}

function wavetableToUnified(def: WavetablePreset): InstrumentPreset {
  return {
    id: def.id,
    name: def.name,
    category: 'Wavetable' as InstrumentPresetCategory,
    instrumentKind: 'wavetable',
    isFactory: true,
    instrument: {
      kind: 'wavetable',
      preset: 'wavetable',
      name: def.name,
      fallbackPreset: 'pad',
      settings: { ...def.settings },
    },
  };
}

// ---------------------------------------------------------------------------
// Physical modeling factory presets
// ---------------------------------------------------------------------------

const PHYSICAL_PRESET_LABELS: Record<Exclude<PhysicalModelPreset, 'custom'>, string> = {
  'acoustic-guitar': 'Acoustic Guitar',
  'harp': 'Harp',
  'kalimba': 'Kalimba',
  'marimba': 'Marimba',
  'steel-drum': 'Steel Drum',
};

const PHYSICAL_FACTORY_PRESETS: InstrumentPreset[] = (
  Object.entries(PHYSICAL_PRESET_LABELS) as [Exclude<PhysicalModelPreset, 'custom'>, string][]
).map(([key, label]) => ({
  id: `physical-${key}`,
  name: label,
  category: 'Physical' as InstrumentPresetCategory,
  instrumentKind: 'physical' as const,
  isFactory: true,
  instrument: {
    kind: 'physical' as const,
    preset: key,
    name: label,
    settings: { ...PHYSICAL_PRESETS[key] },
  },
}));

// ---------------------------------------------------------------------------
// All factory presets (unified)
// ---------------------------------------------------------------------------

export const ALL_FACTORY_PRESETS: readonly InstrumentPreset[] = [
  ...FACTORY_SYNTH_PRESETS.map(subtractiveToUnified),
  ...FACTORY_FM_PRESETS.map(fmToUnified),
  ...WAVETABLE_PRESETS.map(wavetableToUnified),
  ...PHYSICAL_FACTORY_PRESETS,
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getAllPresets(userPresets: InstrumentPreset[] = []): InstrumentPreset[] {
  return [...ALL_FACTORY_PRESETS, ...userPresets];
}

export function getPresetById(
  id: string,
  userPresets: InstrumentPreset[] = [],
): InstrumentPreset | undefined {
  return ALL_FACTORY_PRESETS.find((p) => p.id === id) ?? userPresets.find((p) => p.id === id);
}

export function getPresetsByCategory(
  category: InstrumentPresetCategory,
  userPresets: InstrumentPreset[] = [],
): InstrumentPreset[] {
  return getAllPresets(userPresets).filter((p) => p.category === category);
}

export function getPresetsByKind(
  kind: InstrumentKindFilter,
  userPresets: InstrumentPreset[] = [],
): InstrumentPreset[] {
  if (kind === 'all') return getAllPresets(userPresets);
  return getAllPresets(userPresets).filter((p) => p.instrumentKind === kind);
}

export function getCategoriesForKind(kind: InstrumentKindFilter): InstrumentPresetCategory[] {
  const presets = kind === 'all' ? ALL_FACTORY_PRESETS : ALL_FACTORY_PRESETS.filter((p) => p.instrumentKind === kind);
  return [...new Set(presets.map((p) => p.category))];
}

/**
 * Create a user preset from the current track instrument.
 */
export function createUserPreset(
  name: string,
  category: InstrumentPresetCategory,
  instrument: TrackInstrument,
): InstrumentPreset {
  if (instrument.kind === 'sampler') {
    throw new Error('Sampler instruments cannot be saved as instrument presets');
  }
  if (instrument.kind === 'granular') {
    throw new Error('Granular instruments cannot be saved as presets (source audio is project-scoped)');
  }
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    instrumentKind: instrument.kind,
    isFactory: false,
    instrument: structuredClone(instrument),
  };
}

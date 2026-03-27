/**
 * Synth preset definitions and factory presets for the DAW synth engine.
 *
 * Each preset captures oscillator, envelope, and optional filter parameters
 * that can be applied to a track's SubtractiveTrackInstrument.
 */

import type {
  InstrumentWaveform,
  InstrumentEnvelope,
  InstrumentFilterSettings,
  LegacySynthVoicePreset,
} from '../types/project';

export const SYNTH_PRESET_CATEGORIES = [
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'FX',
  'Keys',
] as const;

export type SynthPresetCategory = (typeof SYNTH_PRESET_CATEGORIES)[number];

export interface SynthPresetDefinition {
  id: string;
  name: string;
  category: SynthPresetCategory;
  isFactory: boolean;
  /** Base oscillator waveform. */
  waveform: InstrumentWaveform;
  /** Amplitude envelope. */
  envelope: InstrumentEnvelope;
  /** Optional filter settings. */
  filter?: Partial<Pick<InstrumentFilterSettings, 'enabled' | 'type' | 'cutoffHz' | 'resonance'>>;
  /** Detune in cents. */
  detuneCents?: number;
  /** Glide (portamento) time in seconds. */
  glideTime?: number;
  /** Output gain offset (dB, default 0). */
  outputGain?: number;
  /** Which legacy SynthPreset string to use when mapping to the old engine path. */
  legacyPreset: LegacySynthVoicePreset;
}

// ---------------------------------------------------------------------------
// Factory presets
// ---------------------------------------------------------------------------

export const FACTORY_SYNTH_PRESETS: readonly SynthPresetDefinition[] = [
  // ── Bass ──────────────────────────────────────────────────────────────────
  {
    id: 'factory-sub-bass',
    name: 'Sub Bass',
    category: 'Bass',
    isFactory: true,
    waveform: 'sine',
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.4 },
    legacyPreset: 'bass',
  },
  {
    id: 'factory-saw-bass',
    name: 'Saw Bass',
    category: 'Bass',
    isFactory: true,
    waveform: 'sawtooth',
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
    filter: { enabled: true, type: 'lowpass', cutoffHz: 800, resonance: 1 },
    legacyPreset: 'bass',
  },
  {
    id: 'factory-square-bass',
    name: 'Square Bass',
    category: 'Bass',
    isFactory: true,
    waveform: 'square',
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.3 },
    filter: { enabled: true, type: 'lowpass', cutoffHz: 600, resonance: 0.5 },
    legacyPreset: 'bass',
  },

  // ── Lead ──────────────────────────────────────────────────────────────────
  {
    id: 'factory-saw-lead',
    name: 'Saw Lead',
    category: 'Lead',
    isFactory: true,
    waveform: 'sawtooth',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
    legacyPreset: 'lead',
  },
  {
    id: 'factory-square-lead',
    name: 'Square Lead',
    category: 'Lead',
    isFactory: true,
    waveform: 'square',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
    legacyPreset: 'lead',
  },
  {
    id: 'factory-triangle-lead',
    name: 'Triangle Lead',
    category: 'Lead',
    isFactory: true,
    waveform: 'triangle',
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.65, release: 0.4 },
    detuneCents: 5,
    legacyPreset: 'lead',
  },

  // ── Pad ───────────────────────────────────────────────────────────────────
  {
    id: 'factory-warm-pad',
    name: 'Warm Pad',
    category: 'Pad',
    isFactory: true,
    waveform: 'sine',
    envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 2.0 },
    legacyPreset: 'pad',
  },
  {
    id: 'factory-string-pad',
    name: 'String Pad',
    category: 'Pad',
    isFactory: true,
    waveform: 'sawtooth',
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.8, release: 1.5 },
    filter: { enabled: true, type: 'lowpass', cutoffHz: 3000, resonance: 0.5 },
    legacyPreset: 'strings',
  },

  // ── Pluck ─────────────────────────────────────────────────────────────────
  {
    id: 'factory-pluck',
    name: 'Pluck',
    category: 'Pluck',
    isFactory: true,
    waveform: 'triangle',
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.5 },
    legacyPreset: 'piano',
  },
  {
    id: 'factory-bright-pluck',
    name: 'Bright Pluck',
    category: 'Pluck',
    isFactory: true,
    waveform: 'sawtooth',
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.4 },
    filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 1.5 },
    legacyPreset: 'piano',
  },

  // ── FX ────────────────────────────────────────────────────────────────────
  {
    id: 'factory-riser',
    name: 'Riser',
    category: 'FX',
    isFactory: true,
    waveform: 'sawtooth',
    envelope: { attack: 2.0, decay: 0.1, sustain: 0.8, release: 0.5 },
    filter: { enabled: true, type: 'highpass', cutoffHz: 200, resonance: 1 },
    legacyPreset: 'lead',
  },
  {
    id: 'factory-sweep',
    name: 'Sweep',
    category: 'FX',
    isFactory: true,
    waveform: 'square',
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.3, release: 1.0 },
    filter: { enabled: true, type: 'bandpass', cutoffHz: 1500, resonance: 5 },
    legacyPreset: 'pad',
  },

  // ── Keys ──────────────────────────────────────────────────────────────────
  {
    id: 'factory-electric-piano',
    name: 'Electric Piano',
    category: 'Keys',
    isFactory: true,
    waveform: 'triangle',
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
    legacyPreset: 'piano',
  },
  {
    id: 'factory-organ',
    name: 'Organ',
    category: 'Keys',
    isFactory: true,
    waveform: 'sine',
    envelope: { attack: 0.01, decay: 0.01, sustain: 1.0, release: 0.1 },
    legacyPreset: 'organ',
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Return all presets (factory + user) matching a category.
 */
export function getSynthPresetsByCategory(
  category: SynthPresetCategory,
  userPresets: SynthPresetDefinition[] = [],
): SynthPresetDefinition[] {
  return [...FACTORY_SYNTH_PRESETS, ...userPresets].filter(
    (p) => p.category === category,
  );
}

/**
 * Find a single preset by its ID (factory first, then user presets).
 */
export function getSynthPresetById(
  id: string,
  userPresets: SynthPresetDefinition[] = [],
): SynthPresetDefinition | undefined {
  return (
    FACTORY_SYNTH_PRESETS.find((p) => p.id === id) ??
    userPresets.find((p) => p.id === id)
  );
}

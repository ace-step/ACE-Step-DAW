/**
 * Factory presets for FM synthesis.
 *
 * Each preset provides a complete FmInstrumentSettings configuration
 * that can be applied to a track's FmTrackInstrument.
 */

import type { FmInstrumentSettings, FmAlgorithm, InstrumentWaveform } from '../types/project';

export interface FmPresetDefinition {
  id: string;
  name: string;
  category: 'Bass' | 'Lead' | 'Keys' | 'Pad' | 'Bell' | 'FX';
  isFactory: boolean;
  settings: FmInstrumentSettings;
}

function fmPreset(
  id: string,
  name: string,
  category: FmPresetDefinition['category'],
  overrides: Partial<FmInstrumentSettings> & {
    carrierWaveform?: InstrumentWaveform;
    modulatorWaveform?: InstrumentWaveform;
    algorithm?: FmAlgorithm;
  },
): FmPresetDefinition {
  const {
    carrierWaveform = 'sine',
    modulatorWaveform = 'sine',
    algorithm = 'serial',
    ...rest
  } = overrides;

  return {
    id,
    name,
    category,
    isFactory: true,
    settings: {
      carrier: { waveform: carrierWaveform, ratio: 1, level: 1 },
      modulator: { waveform: modulatorWaveform, ratio: 1, level: 1 },
      modulationIndex: 5,
      harmonicity: 1,
      feedback: 0,
      algorithm,
      ampEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 },
      outputGain: 0.55,
      ...rest,
    },
  };
}

export const FACTORY_FM_PRESETS: readonly FmPresetDefinition[] = [
  // ── Keys ──────────────────────────────────────────────────────────────
  fmPreset('fm-electric-piano', 'FM Electric Piano', 'Keys', {
    modulationIndex: 3.5,
    harmonicity: 2,
    ampEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.0 },
  }),
  fmPreset('fm-dx-keys', 'DX Keys', 'Keys', {
    modulationIndex: 5,
    harmonicity: 1,
    ampEnvelope: { attack: 0.001, decay: 0.5, sustain: 0.1, release: 0.8 },
  }),

  // ── Bell ──────────────────────────────────────────────────────────────
  fmPreset('fm-bell', 'FM Bell', 'Bell', {
    modulationIndex: 10,
    harmonicity: 3.5,
    ampEnvelope: { attack: 0.001, decay: 1.5, sustain: 0.0, release: 2.0 },
  }),
  fmPreset('fm-glass-bell', 'Glass Bell', 'Bell', {
    modulationIndex: 8,
    harmonicity: 5.07,
    ampEnvelope: { attack: 0.001, decay: 2.0, sustain: 0.0, release: 3.0 },
    outputGain: 0.4,
  }),

  // ── Bass ──────────────────────────────────────────────────────────────
  fmPreset('fm-bass', 'FM Bass', 'Bass', {
    modulationIndex: 8,
    harmonicity: 0.5,
    ampEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.3 },
  }),
  fmPreset('fm-growl-bass', 'Growl Bass', 'Bass', {
    modulationIndex: 12,
    harmonicity: 1,
    feedback: 0.3,
    algorithm: 'feedback',
    ampEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.4 },
  }),

  // ── Lead ──────────────────────────────────────────────────────────────
  fmPreset('fm-brass', 'FM Brass', 'Lead', {
    modulationIndex: 6,
    harmonicity: 1,
    carrierWaveform: 'sawtooth',
    ampEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.3 },
  }),
  fmPreset('fm-screech', 'Screech Lead', 'Lead', {
    modulationIndex: 15,
    harmonicity: 3,
    algorithm: 'stack',
    ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
    outputGain: 0.4,
  }),

  // ── Pad ───────────────────────────────────────────────────────────────
  fmPreset('fm-ethereal-pad', 'Ethereal Pad', 'Pad', {
    modulationIndex: 2,
    harmonicity: 2,
    algorithm: 'parallel',
    ampEnvelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 2.0 },
  }),

  // ── FX ────────────────────────────────────────────────────────────────
  fmPreset('fm-metallic', 'Metallic', 'FX', {
    modulationIndex: 20,
    harmonicity: 7.07,
    feedback: 0.5,
    algorithm: 'feedback',
    ampEnvelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 1.5 },
    outputGain: 0.35,
  }),
] as const;

export function getFmPresetById(id: string): FmPresetDefinition | undefined {
  return FACTORY_FM_PRESETS.find((p) => p.id === id);
}

import type { WavetableSettings, WavetableWaveform } from '../types/project';

// ─── Helper: generate harmonic partials ─────────────────────────────────────

/** Generate a sawtooth-like harmonic series: 1/n for n harmonics. */
function sawPartials(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 1 / (i + 1));
}

/** Generate a square-wave harmonic series: 1/n for odd harmonics only. */
function squarePartials(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 1 / (i + 1) : 0));
}

/** Generate a triangle-wave harmonic series: alternating sign 1/n^2 for odd harmonics. */
function trianglePartials(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    if (i % 2 !== 0) return 0; // even harmonics are zero
    const harmonic = i + 1;
    const sign = ((i / 2) % 2 === 0) ? 1 : -1;
    return sign / (harmonic * harmonic);
  });
}

// ─── Factory Waveforms ──────────────────────────────────────────────────────

export const WAVEFORM_SINE: WavetableWaveform = { name: 'Sine', partials: [1] };
export const WAVEFORM_TRIANGLE: WavetableWaveform = { name: 'Triangle', partials: trianglePartials(16) };
export const WAVEFORM_SAW: WavetableWaveform = { name: 'Saw', partials: sawPartials(16) };
export const WAVEFORM_SQUARE: WavetableWaveform = { name: 'Square', partials: squarePartials(16) };

export const WAVEFORM_FORMANT_A: WavetableWaveform = {
  name: 'Formant A',
  partials: [1, 0.0, 0.8, 0.0, 0.4, 0.0, 0.2, 0.0, 0.6, 0.0, 0.1, 0.0, 0.3, 0.0, 0.05, 0.0],
};
export const WAVEFORM_FORMANT_O: WavetableWaveform = {
  name: 'Formant O',
  partials: [1, 0.3, 0.0, 0.6, 0.0, 0.2, 0.0, 0.4, 0.0, 0.1, 0.0, 0.05, 0.0, 0.15, 0.0, 0.02],
};

export const WAVEFORM_ORGAN_8: WavetableWaveform = {
  name: 'Organ 8\'',
  partials: [1, 0, 0.5, 0, 0.33, 0, 0.25, 0, 0.2, 0, 0.167, 0, 0.143, 0, 0.125, 0],
};
export const WAVEFORM_ORGAN_4: WavetableWaveform = {
  name: 'Organ 4\'',
  partials: [0, 1, 0, 0.5, 0, 0.33, 0, 0.25, 0, 0.2, 0, 0.167, 0, 0.143, 0, 0.125],
};

export const WAVEFORM_DIGITAL_1: WavetableWaveform = {
  name: 'Digital 1',
  partials: [1, 0.7, 0.5, 0.9, 0.3, 0.6, 0.2, 0.8, 0.1, 0.4, 0.05, 0.3, 0.02, 0.15, 0.01, 0.1],
};
export const WAVEFORM_DIGITAL_2: WavetableWaveform = {
  name: 'Digital 2',
  partials: [0.5, 1, 0.3, 0.0, 0.8, 0.0, 0.6, 0.0, 0.4, 0.2, 0.0, 0.7, 0.0, 0.1, 0.0, 0.5],
};

// ─── Factory Wavetable Presets ──────────────────────────────────────────────

export interface WavetablePreset {
  id: string;
  name: string;
  settings: WavetableSettings;
}

const DEFAULT_ENVELOPE = { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 };

/** Default wavetable settings used when a track has no wavetable configured yet. */
export const DEFAULT_WAVETABLE_SETTINGS: WavetableSettings = {
  waveforms: [WAVEFORM_SINE, WAVEFORM_SAW],
  position: 0,
  morphSpeed: 0,
  ampEnvelope: { ...DEFAULT_ENVELOPE },
  outputGain: 0.55,
};

export const WAVETABLE_PRESETS: WavetablePreset[] = [
  {
    id: 'wt-basic',
    name: 'Basic',
    settings: {
      waveforms: [WAVEFORM_SINE, WAVEFORM_TRIANGLE, WAVEFORM_SAW, WAVEFORM_SQUARE],
      position: 0,
      morphSpeed: 0,
      ampEnvelope: { ...DEFAULT_ENVELOPE },
      outputGain: 0.55,
    },
  },
  {
    id: 'wt-saw-square-morph',
    name: 'Saw-Square Morph',
    settings: {
      waveforms: [WAVEFORM_SAW, WAVEFORM_SQUARE],
      position: 0,
      morphSpeed: 0.5,
      ampEnvelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.5 },
      outputGain: 0.55,
    },
  },
  {
    id: 'wt-vocal-formants',
    name: 'Vocal Formants',
    settings: {
      waveforms: [WAVEFORM_FORMANT_A, WAVEFORM_FORMANT_O, WAVEFORM_SINE],
      position: 0,
      morphSpeed: 0.2,
      ampEnvelope: { attack: 0.1, decay: 0.4, sustain: 0.6, release: 0.8 },
      outputGain: 0.5,
    },
  },
  {
    id: 'wt-organ',
    name: 'Organ',
    settings: {
      waveforms: [WAVEFORM_ORGAN_8, WAVEFORM_ORGAN_4, WAVEFORM_SINE],
      position: 0,
      morphSpeed: 0,
      ampEnvelope: { attack: 0.005, decay: 0.01, sustain: 1, release: 0.1 },
      outputGain: 0.55,
    },
  },
  {
    id: 'wt-digital',
    name: 'Digital',
    settings: {
      waveforms: [WAVEFORM_DIGITAL_1, WAVEFORM_DIGITAL_2, WAVEFORM_SAW],
      position: 0,
      morphSpeed: 1,
      ampEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.4 },
      outputGain: 0.5,
    },
  },
];

export function getWavetablePresetById(id: string): WavetablePreset | undefined {
  return WAVETABLE_PRESETS.find((p) => p.id === id);
}

// ─── Partials Interpolation ─────────────────────────────────────────────────

/**
 * Interpolate between two partial arrays based on a `t` value (0–1).
 * Arrays may have different lengths; missing entries are treated as 0.
 */
export function interpolatePartials(a: number[], b: number[], t: number): number[] {
  const len = Math.max(a.length, b.length);
  const result: number[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const va = i < a.length ? a[i] : 0;
    const vb = i < b.length ? b[i] : 0;
    result[i] = va + (vb - va) * t;
  }
  return result;
}

/**
 * Given an array of waveforms and a position (0–1), compute the interpolated
 * partials by blending between the two nearest waveforms.
 */
export function computePartialsAtPosition(
  waveforms: WavetableWaveform[],
  position: number,
): number[] {
  if (waveforms.length === 0) return [1]; // fallback sine
  if (waveforms.length === 1) return [...waveforms[0].partials];

  const clampedPos = Math.max(0, Math.min(1, position));
  const scaledPos = clampedPos * (waveforms.length - 1);
  const indexA = Math.floor(scaledPos);
  const indexB = Math.min(indexA + 1, waveforms.length - 1);
  const t = scaledPos - indexA;

  return interpolatePartials(waveforms[indexA].partials, waveforms[indexB].partials, t);
}

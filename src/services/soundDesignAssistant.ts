/**
 * AI Sound Design Assistant — rule-based text-to-parameters mapping.
 *
 * Interprets natural language sound descriptions and maps them to synth
 * parameter changes. Supports iterative refinement ("warmer", "brighter")
 * and variation generation.
 *
 * Part of #1229 (Sound Design & Timbre System epic), issue #1234.
 */

import type {
  SubtractiveInstrumentSettings,
  FmInstrumentSettings,
  WavetableSettings,
  InstrumentKind,
} from '../types/project';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export interface SoundDesignSuggestion {
  /** Human-readable name for this suggestion. */
  name?: string;
  /** What this change does. */
  description: string;
  /** Partial parameter overrides to apply. */
  changes: DeepPartial<SubtractiveInstrumentSettings>;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

interface KeywordRule {
  patterns: RegExp[];
  apply: (current: SubtractiveInstrumentSettings) => DeepPartial<SubtractiveInstrumentSettings>;
  description: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  // ── Tonal character ───────────────────────────────────────────────────
  {
    patterns: [/\bwarm\b/i, /\bwarmer\b/i, /\bmellow\b/i],
    apply: (current) => ({
      filter: {
        enabled: true,
        type: 'lowpass',
        cutoffHz: current.filter.enabled ? Math.max(200, current.filter.cutoffHz * 0.7) : 1200,
        resonance: Math.max(current.filter.resonance, 0.5),
      },
    }),
    description: 'Lower filter cutoff for warm tone',
  },
  {
    patterns: [/\bbright\b/i, /\bbrighter\b/i, /\bcrisp\b/i, /\bshimmer/i],
    apply: (current) => ({
      filter: {
        enabled: true,
        type: 'lowpass',
        cutoffHz: current.filter.enabled ? Math.min(18000, current.filter.cutoffHz * 1.5) : 8000,
        resonance: Math.max(current.filter.resonance, 1),
      },
    }),
    description: 'Raise filter cutoff for brightness',
  },
  {
    patterns: [/\bdark\b/i, /\bdarker\b/i, /\bsubdued\b/i],
    apply: (current) => ({
      filter: {
        enabled: true,
        type: 'lowpass',
        cutoffHz: current.filter.enabled ? Math.max(100, current.filter.cutoffHz * 0.5) : 800,
        resonance: 0.5,
      },
    }),
    description: 'Darken tone with low filter cutoff',
  },

  // ── Envelope character ────────────────────────────────────────────────
  {
    patterns: [/\bslow attack\b/i, /\bsoft(?:er)? attack\b/i, /\bpad\b/i, /\bswell/i],
    apply: () => ({
      ampEnvelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 1.5 },
    }),
    description: 'Slow attack for pad-like swells',
  },
  {
    patterns: [/\bfast attack\b/i, /\bsnappy\b/i, /\bpunchy\b/i, /\btight\b/i],
    apply: () => ({
      ampEnvelope: { attack: 0.001, decay: 0.15, sustain: 0.4, release: 0.2 },
    }),
    description: 'Fast attack for punchy sound',
  },
  {
    patterns: [/\bpluck/i, /\bstaccato\b/i, /\bshort\b/i],
    apply: () => ({
      ampEnvelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
    }),
    description: 'Short decay for plucky articulation',
  },
  {
    patterns: [/\blong release\b/i, /\bsustain/i, /\breverb(?:erant)?\b/i],
    apply: (current) => ({
      ampEnvelope: {
        sustain: Math.max(current.ampEnvelope.sustain, 0.7),
        release: Math.max(current.ampEnvelope.release, 2.0),
      },
    }),
    description: 'Extended sustain and release',
  },

  // ── Oscillator character ──────────────────────────────────────────────
  {
    patterns: [/\bsaw\b/i, /\bsaw(?:tooth)?\b/i, /\bbrassi?\b/i],
    apply: () => ({
      oscillator: { waveform: 'sawtooth' as const },
    }),
    description: 'Sawtooth waveform for brassy/rich tone',
  },
  {
    patterns: [/\bsquare\b/i, /\bhollow\b/i, /\breedy\b/i],
    apply: () => ({
      oscillator: { waveform: 'square' as const },
    }),
    description: 'Square waveform for hollow/reedy tone',
  },
  {
    patterns: [/\bsine\b/i, /\bpure\b/i, /\bsub\b/i, /\bclean\b/i],
    apply: () => ({
      oscillator: { waveform: 'sine' as const },
    }),
    description: 'Sine waveform for pure/clean tone',
  },
  {
    patterns: [/\btriangle\b/i, /\bsoft\b(?!.*attack)/i, /\bgentle\b/i],
    apply: () => ({
      oscillator: { waveform: 'triangle' as const },
    }),
    description: 'Triangle waveform for soft/gentle tone',
  },

  // ── Texture / density ─────────────────────────────────────────────────
  {
    patterns: [/\bfat\b/i, /\bthick\b/i, /\bdetun/i, /\bunison\b/i, /\bwide\b/i],
    apply: () => ({
      unison: { voices: 4, detuneCents: 15, stereoSpread: 0.7, blend: 0.5 },
    }),
    description: 'Detuned unison voices for fat/wide tone',
  },
  {
    patterns: [/\bthin\b/i, /\bnarrow\b/i, /\bmono\b/i],
    apply: () => ({
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 0.5 },
    }),
    description: 'Single voice for thin/mono tone',
  },

  // ── Aggression / drive ────────────────────────────────────────────────
  {
    patterns: [/\baggressive\b/i, /\bdistort/i, /\bdirty\b/i, /\bgritty\b/i, /\bnasty\b/i],
    apply: (current) => ({
      filter: {
        enabled: true,
        drive: Math.max(current.filter.drive, 0.5),
        resonance: Math.max(current.filter.resonance, 3),
      },
    }),
    description: 'Added drive and resonance for aggression',
  },

  // ── LFO / modulation ─────────────────────────────────────────────────
  {
    patterns: [/\bwobbl/i, /\blfo\b/i, /\bpuls(e|ing)\b/i],
    apply: () => ({
      lfo: { enabled: true, target: 'filterCutoff', rateHz: 3, depth: 0.5, waveform: 'sine', retrigger: false },
    }),
    description: 'LFO modulation on filter cutoff',
  },
  {
    patterns: [/\bvibrato\b/i, /\btremolo\b/i],
    apply: () => ({
      lfo: { enabled: true, target: 'pitch', rateHz: 5, depth: 0.1, waveform: 'sine', retrigger: false },
    }),
    description: 'Pitch vibrato modulation',
  },

  // ── Glide ─────────────────────────────────────────────────────────────
  {
    patterns: [/\bglide\b/i, /\bportamento\b/i, /\bslide\b/i],
    apply: () => ({
      glideTime: 0.15,
    }),
    description: 'Added portamento/glide between notes',
  },
];

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export function interpretSoundDescription(
  description: string,
  _instrumentKind: InstrumentKind,
  currentSettings: SubtractiveInstrumentSettings,
): SoundDesignSuggestion {
  const appliedDescriptions: string[] = [];
  let changes: DeepPartial<SubtractiveInstrumentSettings> = {};

  for (const rule of KEYWORD_RULES) {
    const matched = rule.patterns.some((p) => p.test(description));
    if (matched) {
      const ruleChanges = rule.apply(currentSettings);
      changes = deepMerge(changes, ruleChanges);
      appliedDescriptions.push(rule.description);
    }
  }

  // If nothing matched, provide a generic warm pad suggestion
  if (appliedDescriptions.length === 0) {
    changes = {
      filter: { enabled: true, type: 'lowpass', cutoffHz: 3000, resonance: 1 },
    };
    appliedDescriptions.push('Applied generic filter shaping');
  }

  return {
    description: appliedDescriptions.join('; '),
    changes,
  };
}

export function generateVariations(
  base: SubtractiveInstrumentSettings,
  _instrumentKind: InstrumentKind,
  count: number,
): SoundDesignSuggestion[] {
  const clampedCount = Math.max(0, Math.min(count, 8));
  const variationRecipes: { name: string; description: string; apply: (base: SubtractiveInstrumentSettings) => DeepPartial<SubtractiveInstrumentSettings> }[] = [
    {
      name: 'Brighter',
      description: 'Opened up filter for more brightness',
      apply: (b) => ({
        filter: { enabled: true, cutoffHz: Math.min(18000, (b.filter.cutoffHz || 2000) * 1.5), resonance: Math.max(b.filter.resonance, 1.5) },
      }),
    },
    {
      name: 'Warmer',
      description: 'Reduced highs for warmth',
      apply: (b) => ({
        filter: { enabled: true, cutoffHz: Math.max(200, (b.filter.cutoffHz || 2000) * 0.6) },
      }),
    },
    {
      name: 'Wider',
      description: 'Added unison detune for width',
      apply: (b) => ({
        unison: { voices: Math.max(b.unison.voices, 3), detuneCents: 20, stereoSpread: 0.8 },
      }),
    },
    {
      name: 'Punchier',
      description: 'Tightened envelope for punch',
      apply: () => ({
        ampEnvelope: { attack: 0.001, decay: 0.15, sustain: 0.3, release: 0.2 },
      }),
    },
    {
      name: 'Spacious',
      description: 'Extended release for spacious feel',
      apply: (b) => ({
        ampEnvelope: { attack: Math.max(b.ampEnvelope.attack, 0.1), release: Math.max(b.ampEnvelope.release, 2.5) },
      }),
    },
    {
      name: 'Aggressive',
      description: 'Added drive and resonance',
      apply: (b) => ({
        filter: { enabled: true, drive: Math.max(b.filter.drive, 0.6), resonance: Math.max(b.filter.resonance, 4) },
      }),
    },
    {
      name: 'Subtle Vibrato',
      description: 'Added gentle pitch vibrato',
      apply: () => ({
        lfo: { enabled: true, target: 'pitch', rateHz: 5, depth: 0.08, waveform: 'sine', retrigger: false },
      }),
    },
    {
      name: 'Detuned',
      description: 'Thick detuned unison',
      apply: () => ({
        unison: { voices: 5, detuneCents: 25, stereoSpread: 0.6, blend: 0.5 },
        oscillator: { waveform: 'sawtooth' as const },
      }),
    },
  ];

  return variationRecipes.slice(0, clampedCount).map((recipe) => ({
    name: recipe.name,
    description: recipe.description,
    changes: recipe.apply(base),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepMerge<T extends Record<string, unknown>>(a: T, b: DeepPartial<T>): T {
  const result = { ...a } as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    const bVal = (b as Record<string, unknown>)[key];
    const aVal = result[key];
    if (bVal && typeof bVal === 'object' && !Array.isArray(bVal) && aVal && typeof aVal === 'object' && !Array.isArray(aVal)) {
      result[key] = deepMerge(aVal as Record<string, unknown>, bVal as Record<string, unknown>);
    } else {
      result[key] = bVal;
    }
  }
  return result as T;
}

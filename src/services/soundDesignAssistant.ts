/**
 * Sound Design Assistant — maps natural language descriptors to synth parameter adjustments.
 *
 * This service provides a rule-based approach to translating descriptive words
 * (warmer, brighter, fatter, etc.) into concrete parameter changes that can be
 * applied to any subtractive synth instrument.
 */

export interface ParameterAdjustment {
  /** Dot-path to the parameter (e.g., 'filter.cutoffHz', 'ampEnvelope.attack'). */
  parameter: string;
  /** Relative change to apply (positive = increase, negative = decrease). */
  delta: number;
  /** Human-readable description of what this change does. */
  description: string;
}

/**
 * Mapping of sound descriptors to parameter adjustments.
 * Each descriptor produces one or more parameter changes.
 */
export const SOUND_DESCRIPTORS: Record<string, ParameterAdjustment[]> = {
  warmer: [
    { parameter: 'filter.cutoffHz', delta: -800, description: 'Lower filter cutoff for warmth' },
    { parameter: 'filter.resonance', delta: -1, description: 'Reduce resonance for smoother tone' },
    { parameter: 'ampEnvelope.attack', delta: 0.02, description: 'Slightly slower attack for softness' },
  ],
  brighter: [
    { parameter: 'filter.cutoffHz', delta: 1200, description: 'Raise filter cutoff for brightness' },
    { parameter: 'filter.resonance', delta: 1, description: 'Add slight resonance for presence' },
  ],
  darker: [
    { parameter: 'filter.cutoffHz', delta: -1500, description: 'Lower filter cutoff for darkness' },
    { parameter: 'ampEnvelope.attack', delta: 0.03, description: 'Soften attack for dark character' },
  ],
  fatter: [
    { parameter: 'oscillator.detuneCents', delta: 8, description: 'Add detuning for width' },
    { parameter: 'unison.voices', delta: 2, description: 'Add unison voices for thickness' },
    { parameter: 'unison.detuneCents', delta: 10, description: 'Spread unison for fatness' },
  ],
  thinner: [
    { parameter: 'oscillator.detuneCents', delta: -5, description: 'Reduce detuning' },
    { parameter: 'unison.voices', delta: -1, description: 'Fewer unison voices' },
    { parameter: 'filter.cutoffHz', delta: 500, description: 'Open filter slightly' },
  ],
  softer: [
    { parameter: 'ampEnvelope.attack', delta: 0.1, description: 'Slower attack for softness' },
    { parameter: 'ampEnvelope.release', delta: 0.3, description: 'Longer release for gentleness' },
    { parameter: 'filter.cutoffHz', delta: -600, description: 'Lower cutoff for mellowness' },
  ],
  sharper: [
    { parameter: 'ampEnvelope.attack', delta: -0.05, description: 'Faster attack for sharpness' },
    { parameter: 'ampEnvelope.decay', delta: -0.1, description: 'Shorter decay for punch' },
    { parameter: 'filter.cutoffHz', delta: 800, description: 'Higher cutoff for clarity' },
  ],
  punchier: [
    { parameter: 'ampEnvelope.attack', delta: -0.03, description: 'Faster attack for punch' },
    { parameter: 'ampEnvelope.decay', delta: 0.05, description: 'Slightly longer decay for body' },
    { parameter: 'ampEnvelope.sustain', delta: -0.1, description: 'Lower sustain for transient emphasis' },
  ],
  spacious: [
    { parameter: 'ampEnvelope.release', delta: 0.5, description: 'Longer release for spaciousness' },
    { parameter: 'unison.spread', delta: 0.2, description: 'Wider stereo spread' },
  ],
  tight: [
    { parameter: 'ampEnvelope.release', delta: -0.2, description: 'Shorter release for tightness' },
    { parameter: 'ampEnvelope.decay', delta: -0.1, description: 'Shorter decay for precision' },
  ],
  aggressive: [
    { parameter: 'filter.resonance', delta: 3, description: 'More resonance for aggression' },
    { parameter: 'ampEnvelope.attack', delta: -0.04, description: 'Fast attack for bite' },
    { parameter: 'oscillator.detuneCents', delta: 5, description: 'Add edge through detuning' },
  ],
  mellow: [
    { parameter: 'filter.cutoffHz', delta: -1000, description: 'Lower cutoff for mellowness' },
    { parameter: 'filter.resonance', delta: -2, description: 'Less resonance for smoothness' },
    { parameter: 'ampEnvelope.attack', delta: 0.08, description: 'Gentle attack' },
    { parameter: 'ampEnvelope.release', delta: 0.2, description: 'Longer release' },
  ],
  glassy: [
    { parameter: 'filter.cutoffHz', delta: 2000, description: 'High cutoff for glass-like tone' },
    { parameter: 'ampEnvelope.attack', delta: -0.02, description: 'Quick attack for clarity' },
    { parameter: 'ampEnvelope.decay', delta: 0.15, description: 'Medium decay for ring' },
    { parameter: 'ampEnvelope.sustain', delta: -0.15, description: 'Lower sustain for bell character' },
  ],
  plucky: [
    { parameter: 'ampEnvelope.attack', delta: -0.04, description: 'Very fast attack' },
    { parameter: 'ampEnvelope.decay', delta: -0.15, description: 'Short decay for pluck' },
    { parameter: 'ampEnvelope.sustain', delta: -0.3, description: 'Low sustain for transient focus' },
    { parameter: 'ampEnvelope.release', delta: -0.15, description: 'Short release' },
  ],
  dreamy: [
    { parameter: 'ampEnvelope.attack', delta: 0.15, description: 'Slow attack for dreaminess' },
    { parameter: 'ampEnvelope.release', delta: 0.8, description: 'Very long release' },
    { parameter: 'filter.cutoffHz', delta: -500, description: 'Slightly lower cutoff' },
    { parameter: 'unison.detuneCents', delta: 15, description: 'Wide detuning for shimmer' },
  ],
};

// Intensifier words that multiply the delta
const INTENSIFIERS: Record<string, number> = {
  much: 1.5,
  very: 1.5,
  slightly: 0.5,
  'a bit': 0.5,
  'a little': 0.5,
  really: 2.0,
  extremely: 2.5,
  super: 2.0,
};

/**
 * Parse a natural language sound description into parameter adjustments.
 *
 * When multiple descriptors match (e.g. "dark aggressive"), deltas for
 * the same parameter are summed so no adjustment is silently lost.
 *
 * Examples:
 *   "warmer" → lower filter cutoff, soften attack
 *   "much brighter" → raise filter cutoff (amplified)
 *   "dark aggressive" → combined adjustments with summed deltas
 */
export function parseSoundDescription(input: string): ParameterAdjustment[] {
  const normalized = input.toLowerCase().trim();
  // Accumulate deltas per parameter so multiple descriptors compose correctly
  const paramMap = new Map<string, ParameterAdjustment>();

  // Detect intensifier
  let intensifier = 1.0;
  for (const [word, multiplier] of Object.entries(INTENSIFIERS)) {
    if (normalized.includes(word)) {
      intensifier = multiplier;
      break;
    }
  }

  // Match descriptors — sum deltas for shared parameters
  for (const [descriptor, adjustments] of Object.entries(SOUND_DESCRIPTORS)) {
    if (normalized.includes(descriptor)) {
      for (const adj of adjustments) {
        const existing = paramMap.get(adj.parameter);
        if (existing) {
          existing.delta += adj.delta * intensifier;
        } else {
          paramMap.set(adj.parameter, {
            ...adj,
            delta: adj.delta * intensifier,
          });
        }
      }
    }
  }

  return Array.from(paramMap.values());
}

/**
 * Generate named variations of a base set of adjustments.
 *
 * Returns up to `count` variations, each with a descriptive name and
 * modified deltas. Useful for offering multiple sound design directions.
 */
export function generateVariations(
  baseAdjustments: ParameterAdjustment[],
  count: number = 5,
): { name: string; adjustments: ParameterAdjustment[] }[] {
  const safeCount = Math.max(0, Math.min(count, 10));
  const variations: { name: string; adjustments: ParameterAdjustment[] }[] = [
    { name: 'Brighter', adjustments: baseAdjustments.map((a) => ({ ...a, delta: a.delta * 1.3 })) },
    { name: 'Warmer', adjustments: baseAdjustments.map((a) => ({ ...a, delta: a.delta * 0.7 })) },
    { name: 'Wider', adjustments: baseAdjustments.map((a) => ({
      ...a,
      delta: a.parameter.includes('unison') || a.parameter.includes('spread') ? a.delta * 1.5 : a.delta,
    })) },
    { name: 'Punchier', adjustments: baseAdjustments.map((a) => ({
      ...a,
      delta: a.parameter.includes('attack') || a.parameter.includes('decay') ? a.delta * 1.4 : a.delta,
    })) },
    { name: 'Spacious', adjustments: baseAdjustments.map((a) => ({
      ...a,
      delta: a.parameter.includes('release') || a.parameter.includes('spread') ? a.delta * 1.6 : a.delta,
    })) },
    { name: 'Aggressive', adjustments: baseAdjustments.map((a) => ({ ...a, delta: a.delta * 1.8 })) },
    { name: 'Vibrato', adjustments: baseAdjustments.map((a) => ({
      ...a,
      delta: a.parameter.includes('lfo') ? a.delta * 2.0 : a.delta,
    })) },
    { name: 'Detuned', adjustments: baseAdjustments.map((a) => ({
      ...a,
      delta: a.parameter.includes('detune') ? a.delta * 2.0 : a.delta,
    })) },
    { name: 'Subtle', adjustments: baseAdjustments.map((a) => ({ ...a, delta: a.delta * 0.4 })) },
    { name: 'Extreme', adjustments: baseAdjustments.map((a) => ({ ...a, delta: a.delta * 2.5 })) },
  ];

  return variations.slice(0, safeCount);
}

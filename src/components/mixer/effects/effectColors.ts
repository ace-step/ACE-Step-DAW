/**
 * Effect color constants and CSS variable resolver.
 * Extracted from EffectCards.tsx.
 */
import type { TrackEffectType } from '../../../types/project';

/**
 * Effect colors — desaturated, category-grouped.
 * CSS custom properties are defined in src/styles/effect-colors.css.
 * These fallback hex values match the CSS vars for use in non-CSS contexts (canvas, SVG).
 */
export const EFFECT_COLORS: Record<TrackEffectType, string> = {
  /* EQ family (cool blue) */
  eq3: '#5b8ac4',
  parametricEq: '#6b9fd4',
  /* Dynamics family (warm amber/gold) */
  compressor: '#c4993b',
  gate: '#b8903a',
  deesser: '#c4a654',
  transientShaper: '#b89340',
  limiter: '#d4a040',
  /* Time-based family (deep purple/violet) */
  reverb: '#8b6fc0',
  delay: '#9478c4',
  convolver: '#a07cc8',
  algorithmicReverb: '#7a6fb8',
  /* Modulation family (teal/cyan) */
  filter: '#4a9da8',
  chorus: '#5aa8b4',
  flanger: '#4dab94',
  phaser: '#58a8a0',
  /* Distortion family (warm red/coral) */
  distortion: '#c46454',
  saturation: '#b87060',
  /* Utility (neutral) */
  stereoImager: '#7a8ab4',
  noiseReduction: '#8a8a8a',
};

/** Resolve a CSS custom property to its computed hex value (for canvas drawing contexts). */
export function resolveEffectColor(effectType: TrackEffectType): string {
  if (typeof document === 'undefined') return EFFECT_COLORS[effectType];
  const cssVarMap: Record<TrackEffectType, string> = {
    eq3: '--fx-eq3',
    parametricEq: '--fx-parametric-eq',
    compressor: '--fx-compressor',
    reverb: '--fx-reverb',
    delay: '--fx-delay',
    distortion: '--fx-distortion',
    filter: '--fx-filter',
    chorus: '--fx-chorus',
    flanger: '--fx-flanger',
    phaser: '--fx-phaser',
    convolver: '--fx-convolver',
    gate: '--fx-gate',
    deesser: '--fx-deesser',
    transientShaper: '--fx-transient-shaper',
    limiter: '--fx-limiter',
    saturation: '--fx-saturation',
    stereoImager: '--fx-stereo-imager',
    algorithmicReverb: '--fx-algorithmic-reverb',
    noiseReduction: '--fx-noise-reduction',
  };
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(cssVarMap[effectType]).trim();
  return resolved || EFFECT_COLORS[effectType];
}

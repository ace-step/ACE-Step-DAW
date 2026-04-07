/**
 * Stem Separation Engine Utilities (#737)
 *
 * Maps stem counts to compatible separation engines and provides
 * display names and descriptions for the UI engine selector.
 *
 * Engine capabilities:
 * - BS-RoFormer: State-of-the-art quality for vocals/accompaniment (2/4-stem)
 * - Demucs v4 (htdemucs): Fast, good quality for 4-stem separation
 * - HTDemucs 6-stem: Extended Demucs model for 6-stem (vocals, drums, bass, guitar, piano, other)
 */
import type { StemCount, StemSeparationEngine } from '../types/api';

/** Human-readable display names for each engine. */
export const ENGINE_DISPLAY_NAMES: Record<StemSeparationEngine, string> = {
  'auto': 'Auto',
  'bs-roformer': 'BS-RoFormer',
  'demucs-v4': 'Demucs v4',
  'htdemucs-6s': 'HTDemucs 6-stem',
};

/** Short descriptions explaining each engine's strengths. */
export const ENGINE_DESCRIPTIONS: Record<StemSeparationEngine, string> = {
  'auto': 'Automatically selects the best engine for the chosen stem count',
  'bs-roformer': 'Highest quality vocal/accompaniment separation — slower but more accurate',
  'demucs-v4': 'Fast hybrid transformer model — good balance of speed and quality',
  'htdemucs-6s': 'Extended model supporting 6 stems including guitar and piano',
};

/**
 * Engines compatible with each stem count.
 * 'auto' is always available and routes to the best engine per stem count.
 */
const ENGINES_BY_STEM_COUNT: Record<StemCount, StemSeparationEngine[]> = {
  2: ['auto', 'bs-roformer'],
  4: ['auto', 'bs-roformer', 'demucs-v4'],
  6: ['auto', 'htdemucs-6s'],
};

/**
 * Get the default engine for a given stem count.
 * Always returns 'auto' — the backend picks the best engine.
 */
export function getDefaultEngine(_stemCount: StemCount): StemSeparationEngine {
  return 'auto';
}

/**
 * Get the list of engines compatible with a given stem count.
 */
export function getAvailableEngines(stemCount: StemCount): StemSeparationEngine[] {
  return ENGINES_BY_STEM_COUNT[stemCount];
}

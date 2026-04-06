/**
 * Smart Defaults Service — queries Recipe Wiki for empirically-derived
 * generation parameters, falling back to static defaults when wiki
 * data is insufficient.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1454
 */

import { getRecipeWiki } from './recipeWiki';
import { DEFAULT_GENERATION } from '../constants/defaults';
import type { RecipeSuggestion } from '../types/recipeWiki';

/** Minimum confidence threshold to prefer wiki defaults over static ones. */
const MIN_CONFIDENCE_THRESHOLD = 0.2;

/** Minimum sample size to consider wiki data reliable. */
const MIN_SAMPLE_SIZE = 2;

/** A resolved set of generation parameters with source attribution. */
export interface SmartDefaultsResult {
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  /** Where these values came from. */
  source: 'wiki' | 'static';
  /** Confidence in the wiki suggestion (0–1). Only set when source is 'wiki'. */
  confidence?: number;
  /** Number of past generations informing the suggestion. */
  sampleSize?: number;
}

/**
 * Get smart defaults for a given genre. Queries RecipeWiki for the genre,
 * and returns wiki-derived parameters if confidence is sufficient,
 * otherwise falls back to static defaults.
 */
export async function getSmartDefaults(genre: string): Promise<SmartDefaultsResult> {
  if (!genre) return staticDefaults();

  try {
    const wiki = await getRecipeWiki();
    const suggestion = wiki.suggestParameters(genre);

    if (suggestion && isReliable(suggestion)) {
      return {
        inferenceSteps: suggestion.steps || DEFAULT_GENERATION.inferenceSteps,
        guidanceScale: suggestion.cfgStrength || DEFAULT_GENERATION.guidanceScale,
        shift: suggestion.shift || DEFAULT_GENERATION.shift,
        source: 'wiki',
        confidence: suggestion.confidence,
        sampleSize: suggestion.sampleSize,
      };
    }
  } catch {
    // RecipeWiki unavailable — fall through to static
  }

  return staticDefaults();
}

/**
 * Get smart defaults for multiple genres (union of all matching recipes).
 * Uses the genre with the highest confidence.
 */
export async function getSmartDefaultsForGenres(genres: string[]): Promise<SmartDefaultsResult> {
  if (genres.length === 0) return staticDefaults();

  let bestResult: SmartDefaultsResult | null = null;
  let bestConfidence = -1;

  for (const genre of genres) {
    const result = await getSmartDefaults(genre);
    if (result.source === 'wiki' && (result.confidence ?? 0) > bestConfidence) {
      bestConfidence = result.confidence ?? 0;
      bestResult = result;
    }
  }

  return bestResult ?? staticDefaults();
}

/** Check if a suggestion meets reliability thresholds. */
function isReliable(suggestion: RecipeSuggestion): boolean {
  return (
    suggestion.confidence >= MIN_CONFIDENCE_THRESHOLD &&
    suggestion.sampleSize >= MIN_SAMPLE_SIZE
  );
}

/** Return static defaults with source attribution. */
function staticDefaults(): SmartDefaultsResult {
  return {
    inferenceSteps: DEFAULT_GENERATION.inferenceSteps,
    guidanceScale: DEFAULT_GENERATION.guidanceScale,
    shift: DEFAULT_GENERATION.shift,
    source: 'static',
  };
}

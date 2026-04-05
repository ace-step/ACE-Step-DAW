/**
 * Smart Defaults Service — Wiki-powered parameter recommendations.
 * Queries RecipeWiki for empirically-derived parameter suggestions,
 * with confidence scoring and fallback to static defaults.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1454
 */

import { get, set } from 'idb-keyval';
import { getRecipeWiki } from './recipeWiki';
import { GENERATION_PRESETS } from '../constants/generationPresets';
import type { ParameterSuggestion, RecipeParams } from '../types/recipeWiki';

const TRACKING_KEY = 'wiki:smart-defaults:tracking';

// ─── Suggestion Result ──────────────────────────────────────────────────────

export interface SmartDefaultsResult {
  params: RecommendedParams;
  source: 'wiki' | 'static' | 'fallback';
  confidence: number;
  sampleSize: number;
  reasoning: string;
}

export interface RecommendedParams {
  guidanceScale?: number;
  inferenceSteps?: number;
  shift?: number;
  bpm?: number;
  keyScale?: string;
}

// ─── A/B Tracking ───────────────────────────────────────────────────────────

export interface DefaultsTrackingEntry {
  timestamp: number;
  genre: string;
  source: 'wiki' | 'static' | 'fallback';
  paramsUsed: RecommendedParams;
  outcome: 'kept' | 'regenerated' | 'adjusted' | 'deleted';
  rating?: number;
}

export interface DefaultsTrackingState {
  entries: DefaultsTrackingEntry[];
}

// ─── Service ────────────────────────────────────────────────────────────────

export class SmartDefaults {
  /**
   * Get recommended parameters for a genre.
   * Priority: wiki suggestion → static preset → generic fallback.
   */
  async suggest(genre: string): Promise<SmartDefaultsResult> {
    // Try wiki first
    const wiki = getRecipeWiki();
    const suggestion = await wiki.query(genre, 'text2music');

    if (suggestion && suggestion.confidence >= 0.2) {
      return {
        params: mapRecipeToRecommended(suggestion.params),
        source: 'wiki',
        confidence: suggestion.confidence,
        sampleSize: suggestion.sampleSize,
        reasoning: suggestion.reasoning,
      };
    }

    // Fall back to static preset
    const preset = GENERATION_PRESETS.find(p =>
      p.category.toLowerCase() === genre.toLowerCase() ||
      p.name.toLowerCase().includes(genre.toLowerCase())
    );

    if (preset) {
      return {
        params: {
          bpm: preset.suggestedBpm,
          keyScale: preset.suggestedKey,
        },
        source: 'static',
        confidence: 0.5,
        sampleSize: 0,
        reasoning: `Using static preset "${preset.name}"`,
      };
    }

    // Generic fallback
    return {
      params: {},
      source: 'fallback',
      confidence: 0,
      sampleSize: 0,
      reasoning: 'No data available for this genre',
    };
  }

  /**
   * Record which defaults were used and the outcome, for A/B tracking.
   */
  async trackOutcome(entry: DefaultsTrackingEntry): Promise<void> {
    const state = await this.loadTracking();
    state.entries.push(entry);

    // Keep last 500 entries to prevent unbounded growth
    if (state.entries.length > 500) {
      state.entries = state.entries.slice(-500);
    }

    await set(TRACKING_KEY, state);
  }

  /**
   * Get A/B comparison stats: wiki vs static defaults.
   */
  async getTrackingStats(): Promise<{
    wiki: { count: number; keptRate: number; avgRating: number | null };
    static: { count: number; keptRate: number; avgRating: number | null };
  }> {
    const state = await this.loadTracking();

    const wikiEntries = state.entries.filter(e => e.source === 'wiki');
    const staticEntries = state.entries.filter(e => e.source === 'static');

    return {
      wiki: computeStats(wikiEntries),
      static: computeStats(staticEntries),
    };
  }

  private async loadTracking(): Promise<DefaultsTrackingState> {
    const stored = await get<DefaultsTrackingState>(TRACKING_KEY);
    return stored ?? { entries: [] };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapRecipeToRecommended(params: RecipeParams): RecommendedParams {
  return {
    guidanceScale: params.cfgStrength,
    inferenceSteps: params.steps,
    shift: params.shift,
    bpm: params.bpm,
    keyScale: params.keyScale,
  };
}

function computeStats(entries: DefaultsTrackingEntry[]): {
  count: number;
  keptRate: number;
  avgRating: number | null;
} {
  if (entries.length === 0) {
    return { count: 0, keptRate: 0, avgRating: null };
  }

  const kept = entries.filter(e => e.outcome === 'kept').length;
  const ratings = entries.filter(e => e.rating !== undefined).map(e => e.rating!);
  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;

  return {
    count: entries.length,
    keptRate: kept / entries.length,
    avgRating,
  };
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: SmartDefaults | null = null;

export function getSmartDefaultsService(): SmartDefaults {
  if (!_instance) {
    _instance = new SmartDefaults();
  }
  return _instance;
}

export function resetSmartDefaults(): void {
  _instance = null;
}

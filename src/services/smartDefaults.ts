/**
 * Wiki-Powered Smart Defaults — replaces static presets with empirically-derived recommendations.
 * Queries RecipeWiki for best-known parameters by genre, provides confidence scoring,
 * and discovers parameter-to-quality correlations.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1454
 */

import type { RecipeSuggestion } from '../types/recipeWiki';
import type { RecipeWiki } from './recipeWiki';

export interface SmartDefaultResult {
  source: 'wiki' | 'static';
  suggestion: RecipeSuggestion | null;
  confidence: number;
  sampleSize: number;
  explanation: string;
}

export interface GenrePerformance {
  genre: string;
  totalGenerations: number;
  keptRate: number;
  regeneratedRate: number;
  averageRating: number;
}

export interface ParameterInsight {
  parameter: string;
  finding: string;
  highRatingAvg: number;
  lowRatingAvg: number;
  sampleSize: number;
}

export class SmartDefaultsService {
  private recipeWiki: RecipeWiki;

  constructor(recipeWiki: RecipeWiki) {
    this.recipeWiki = recipeWiki;
  }

  // ─── Smart Defaults ─────────────────────────────────────────────────

  getSmartDefaults(genre: string): SmartDefaultResult {
    const suggestion = this.recipeWiki.suggestParameters(genre);

    if (!suggestion) {
      return {
        source: 'static',
        suggestion: null,
        confidence: 0,
        sampleSize: 0,
        explanation: `No wiki data for "${genre}" yet — using static defaults.`,
      };
    }

    return {
      source: 'wiki',
      suggestion,
      confidence: suggestion.confidence,
      sampleSize: suggestion.sampleSize,
      explanation: `Based on ${suggestion.sampleSize} previous generation${suggestion.sampleSize === 1 ? '' : 's'}, CFG=${suggestion.cfgStrength.toFixed(1)} works best for ${genre}.`,
    };
  }

  // ─── Genre Performance ──────────────────────────────────────────────

  getGenrePerformance(genre: string): GenrePerformance | null {
    const entries = this.recipeWiki.query({ genre });
    if (entries.length === 0) return null;

    const kept = entries.filter(e => e.success && e.rating !== undefined && e.rating >= 3).length;
    const regenerated = entries.filter(e => !e.success || (e.rating !== undefined && e.rating < 3)).length;
    const ratings: number[] = [];
    for (const e of entries) {
      if (e.rating !== undefined) ratings.push(e.rating);
    }

    return {
      genre,
      totalGenerations: entries.length,
      keptRate: kept / entries.length,
      regeneratedRate: regenerated / entries.length,
      averageRating: ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0,
    };
  }

  // ─── Discover Insights ──────────────────────────────────────────────

  discoverInsights(genre: string): ParameterInsight[] {
    const entries = this.recipeWiki.query({ genre });
    if (entries.length < 4) return [];

    const insights: ParameterInsight[] = [];

    const highRated = entries.filter(e => e.rating !== undefined && e.rating >= 4);
    const lowRated = entries.filter(e => e.rating !== undefined && e.rating <= 2);

    if (highRated.length < 2 || lowRated.length < 2) return insights;

    const params: Array<{ name: string; getter: (e: typeof entries[0]) => number | undefined }> = [
      { name: 'cfgStrength', getter: e => e.params.cfgStrength },
      { name: 'steps', getter: e => e.params.steps },
      { name: 'shift', getter: e => e.params.shift },
    ];

    for (const { name, getter } of params) {
      const highVals = highRated.map(getter).filter((v): v is number => v !== undefined);
      const lowVals = lowRated.map(getter).filter((v): v is number => v !== undefined);

      if (highVals.length < 2 || lowVals.length < 2) continue;

      const highAvg = highVals.reduce((a, b) => a + b, 0) / highVals.length;
      const lowAvg = lowVals.reduce((a, b) => a + b, 0) / lowVals.length;

      const diff = Math.abs(highAvg - lowAvg);
      const range = Math.max(...[...highVals, ...lowVals]) - Math.min(...[...highVals, ...lowVals]);

      // Only report if there's a meaningful difference (>10% of range)
      if (range > 0 && diff / range > 0.1) {
        const direction = highAvg > lowAvg ? 'higher' : 'lower';
        insights.push({
          parameter: name,
          finding: `High-rated ${genre} generations use ${direction} ${name} (avg ${highAvg.toFixed(1)} vs ${lowAvg.toFixed(1)}).`,
          highRatingAvg: highAvg,
          lowRatingAvg: lowAvg,
          sampleSize: highVals.length + lowVals.length,
        });
      }
    }

    return insights;
  }
}

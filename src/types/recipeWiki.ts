/**
 * Generation Recipe Wiki types — structured knowledge about effective generation parameters.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1452
 */

export interface RecipeEntry {
  id: string;
  prompt: string;
  genres: string[];
  params: RecipeParams;
  success: boolean;
  rating?: number;
  timestamp: number;
  bpm?: number;
  keyScale?: string;
  modelId?: string;
  errorMessage?: string;
}

export interface RecipeParams {
  taskType: string;
  cfgStrength?: number;
  steps?: number;
  shift?: number;
  duration?: number;
}

export interface RecipeQuery {
  genre?: string;
  minRating?: number;
  taskType?: string;
  successOnly?: boolean;
}

export interface RecipeSuggestion {
  cfgStrength: number;
  steps: number;
  shift: number;
  confidence: number;
  sampleSize: number;
}

export interface GenreStat {
  count: number;
  averageRating: number;
  successRate: number;
}

export interface RecipeWikiExport {
  version: number;
  entries: RecipeEntry[];
  exportedAt: number;
}

export const RECIPE_WIKI_VERSION = 1;

/**
 * Recipe Wiki Types — Generation knowledge base that improves over time.
 * Stores empirical data about generation parameters, prompts, and outcomes
 * organized by genre/style/technique.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1452
 */

// ─── Recipe Entry (single generation record) ────────────────────────────────

export interface RecipeEntry {
  id: string;
  timestamp: number;
  genre: string;
  prompt: string;
  lyrics?: string;
  taskType: string;
  params: RecipeParams;
  outcome: RecipeOutcome;
  userRating?: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface RecipeParams {
  cfgStrength?: number;
  steps?: number;
  shift?: number;
  duration?: number;
  modelId?: string;
  seed?: number;
  bpm?: number;
  keyScale?: string;
}

export type RecipeOutcome = 'kept' | 'regenerated' | 'adjusted' | 'deleted' | 'failed';

// ─── Genre Recipe (aggregated knowledge) ─────────────────────────────────────

export interface GenreRecipe {
  genre: string;
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  averageRating: number | null;
  bestPrompts: PromptStat[];
  recommendedParams: RecipeParams;
  knownFailures: FailureRecord[];
  lastUpdated: number;
}

export interface PromptStat {
  prompt: string;
  count: number;
  averageRating: number | null;
  keptRate: number;
}

export interface FailureRecord {
  prompt: string;
  params: RecipeParams;
  errorMessage?: string;
  count: number;
  lastSeen: number;
}

// ─── Parameter Suggestion ────────────────────────────────────────────────────

export interface ParameterSuggestion {
  genre: string;
  params: RecipeParams;
  confidence: number;
  sampleSize: number;
  reasoning: string;
}

// ─── Export/Import ───────────────────────────────────────────────────────────

export interface RecipeWikiExport {
  version: 1;
  exportedAt: number;
  entries: RecipeEntry[];
  genres: GenreRecipe[];
}

/**
 * Wiki Lint & Health Dashboard types — automated lint checks for wiki knowledge decay.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1456
 */

export type LintSeverity = 'error' | 'warning' | 'info';

export type LintCategory =
  | 'contradiction'
  | 'stale'
  | 'orphan'
  | 'gap'
  | 'pattern';

export interface LintResult {
  ruleId: string;
  severity: LintSeverity;
  category: LintCategory;
  wikiType: 'recipe' | 'project' | 'dev';
  message: string;
  suggestion?: string;
  context?: Record<string, unknown>;
}

export interface LintRule {
  id: string;
  name: string;
  description: string;
  wikiType: 'recipe' | 'project' | 'dev' | 'all';
  severity: LintSeverity;
  category: LintCategory;
}

export interface WikiHealthReport {
  timestamp: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  infos: number;
  results: LintResult[];
  recipeStats: { entryCount: number; genreCount: number };
  projectStats: { pageCount: number };
  devStats: { entryCount: number; tagCount: number };
}

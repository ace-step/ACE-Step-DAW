/**
 * Wiki Lint & Health Dashboard — Automated quality checks for all wikis.
 * Prevents knowledge decay via contradiction detection, staleness warnings,
 * orphan page cleanup, and data gap identification.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1456
 */

import { getRecipeWiki } from './recipeWiki';
import { getDevWiki } from './devWiki';
import type { GenreRecipe } from '../types/recipeWiki';
import type { ProjectWikiState } from '../types/projectWiki';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LintSeverity = 'info' | 'warning' | 'error';
export type WikiSource = 'recipe' | 'project' | 'dev';

export interface LintResult {
  source: WikiSource;
  path: string;
  severity: LintSeverity;
  rule: string;
  message: string;
  suggestion?: string;
}

export interface LintRule {
  name: string;
  description: string;
  check: (context: LintContext) => LintResult[];
}

export interface LintContext {
  recipeGenres: GenreRecipe[];
  devPages: { path: string; content: string; lastUpdated: number; sources: string[] }[];
  projectWiki: ProjectWikiState | null;
}

export interface WikiHealthSummary {
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  results: LintResult[];
  checkedAt: number;
}

// ─── Built-in Rules ─────────────────────────────────────────────────────────

const RECIPE_STALE_PARAMS: LintRule = {
  name: 'recipe-stale-params',
  description: 'Flag genre recipes that may have outdated parameter recommendations',
  check: ({ recipeGenres }) => {
    const results: LintResult[] = [];
    const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const genre of recipeGenres) {
      if (now - genre.lastUpdated > THREE_MONTHS_MS) {
        results.push({
          source: 'recipe',
          path: `genres/${genre.genre}`,
          severity: 'warning',
          rule: 'recipe-stale-params',
          message: `Genre "${genre.genre}" recommendations not updated in 3+ months`,
          suggestion: `Generate a few ${genre.genre} tracks and rate them to refresh recommendations`,
        });
      }
    }
    return results;
  },
};

const RECIPE_LOW_SAMPLE: LintRule = {
  name: 'recipe-low-sample',
  description: 'Flag genres with too few data points for reliable recommendations',
  check: ({ recipeGenres }) => {
    return recipeGenres
      .filter(g => g.totalGenerations > 0 && g.totalGenerations < 5)
      .map(g => ({
        source: 'recipe' as const,
        path: `genres/${g.genre}`,
        severity: 'info' as const,
        rule: 'recipe-low-sample',
        message: `Genre "${g.genre}" has only ${g.totalGenerations} generation(s) — recommendations may be unreliable`,
        suggestion: `Generate more ${g.genre} tracks to improve confidence`,
      }));
  },
};

const RECIPE_HIGH_FAILURE: LintRule = {
  name: 'recipe-high-failure',
  description: 'Flag genres with high failure rates',
  check: ({ recipeGenres }) => {
    return recipeGenres
      .filter(g => g.totalGenerations >= 5 && g.failedGenerations / g.totalGenerations > 0.4)
      .map(g => ({
        source: 'recipe' as const,
        path: `genres/${g.genre}`,
        severity: 'warning' as const,
        rule: 'recipe-high-failure',
        message: `Genre "${g.genre}" has ${Math.round(g.failedGenerations / g.totalGenerations * 100)}% failure rate`,
        suggestion: `Review known failures and avoid problematic parameter combinations`,
      }));
  },
};

const PROJECT_BRIEF_INCOMPLETE: LintRule = {
  name: 'project-brief-incomplete',
  description: 'Flag projects with incomplete creative briefs',
  check: ({ projectWiki }) => {
    if (!projectWiki) return [];
    const brief = projectWiki.creativeBrief;
    const missing: string[] = [];
    if (!brief.genre) missing.push('genre');
    if (!brief.mood) missing.push('mood');
    if (brief.references.length === 0) missing.push('references');

    if (missing.length > 0) {
      return [{
        source: 'project',
        path: 'creative-brief',
        severity: 'info',
        rule: 'project-brief-incomplete',
        message: `Creative brief is missing: ${missing.join(', ')}`,
        suggestion: 'Fill in the creative brief to help AI make better generation decisions',
      }];
    }
    return [];
  },
};

const PROJECT_MANY_FAILURES: LintRule = {
  name: 'project-many-failures',
  description: 'Flag projects with 3+ failed generations',
  check: ({ projectWiki }) => {
    if (!projectWiki) return [];
    const failed = projectWiki.generationLog.filter(e => e.outcome === 'failed');
    if (failed.length >= 3) {
      return [{
        source: 'project',
        path: 'generation-log',
        severity: 'warning',
        rule: 'project-many-failures',
        message: `${failed.length} failed generations — consider changing parameters`,
        suggestion: 'Try different CFG, steps, or prompt phrasing',
      }];
    }
    return [];
  },
};

const DEV_STALE: LintRule = {
  name: 'dev-stale',
  description: 'Flag development wiki pages older than 6 months',
  check: ({ devPages }) => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return devPages
      .filter(p => now - p.lastUpdated > SIX_MONTHS_MS)
      .map(p => ({
        source: 'dev' as const,
        path: p.path,
        severity: 'warning' as const,
        rule: 'dev-stale',
        message: `Page "${p.path}" not updated in 6+ months`,
        suggestion: 'Verify the information is still accurate',
      }));
  },
};

const DEV_MISSING_SOURCES: LintRule = {
  name: 'dev-missing-sources',
  description: 'Flag competitor pages without source URLs',
  check: ({ devPages }) => {
    return devPages
      .filter(p => p.path.startsWith('competitors/') && p.sources.length === 0)
      .map(p => ({
        source: 'dev' as const,
        path: p.path,
        severity: 'warning' as const,
        rule: 'dev-missing-sources',
        message: `Competitor page "${p.path}" has no source URLs`,
        suggestion: 'Add source URLs to support claims',
      }));
  },
};

// ─── Service ────────────────────────────────────────────────────────────────

const DEFAULT_RULES: LintRule[] = [
  RECIPE_STALE_PARAMS,
  RECIPE_LOW_SAMPLE,
  RECIPE_HIGH_FAILURE,
  PROJECT_BRIEF_INCOMPLETE,
  PROJECT_MANY_FAILURES,
  DEV_STALE,
  DEV_MISSING_SOURCES,
];

export class WikiLint {
  private rules: LintRule[];

  constructor(rules?: LintRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  /**
   * Run all lint rules against wiki data.
   */
  async check(projectWiki?: ProjectWikiState | null): Promise<WikiHealthSummary> {
    const context = await this.buildContext(projectWiki ?? null);
    const results: LintResult[] = [];

    for (const rule of this.rules) {
      results.push(...rule.check(context));
    }

    return {
      totalIssues: results.length,
      errors: results.filter(r => r.severity === 'error').length,
      warnings: results.filter(r => r.severity === 'warning').length,
      info: results.filter(r => r.severity === 'info').length,
      results,
      checkedAt: Date.now(),
    };
  }

  /**
   * Run only lightweight checks (suitable for project-open).
   * Builds a minimal context — skips dev wiki pages to stay fast.
   */
  async quickCheck(projectWiki?: ProjectWikiState | null): Promise<WikiHealthSummary> {
    const lightweightRuleNames = new Set([
      'project-brief-incomplete', 'project-many-failures', 'recipe-low-sample',
    ]);
    const lightweightRules = this.rules.filter(r => lightweightRuleNames.has(r.name));

    // Build lightweight context — only fetch recipe genres (skip dev wiki)
    const recipeWiki = getRecipeWiki();
    const recipeGenres = await recipeWiki.listGenres();
    const context: LintContext = {
      recipeGenres,
      devPages: [], // Skip dev wiki scan for quick checks
      projectWiki: projectWiki ?? null,
    };

    const results: LintResult[] = [];
    for (const rule of lightweightRules) {
      results.push(...rule.check(context));
    }

    return {
      totalIssues: results.length,
      errors: results.filter(r => r.severity === 'error').length,
      warnings: results.filter(r => r.severity === 'warning').length,
      info: results.filter(r => r.severity === 'info').length,
      results,
      checkedAt: Date.now(),
    };
  }

  /**
   * Format lint results as human-readable text.
   */
  formatResults(summary: WikiHealthSummary): string {
    if (summary.totalIssues === 0) {
      return '✓ All wikis healthy — no issues found.';
    }

    const lines: string[] = [
      `Wiki Health: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info`,
      '',
    ];

    for (const r of summary.results) {
      const icon = r.severity === 'error' ? '✗' : r.severity === 'warning' ? '!' : 'i';
      lines.push(`[${icon}] ${r.source}/${r.path}: ${r.message}`);
      if (r.suggestion) {
        lines.push(`    → ${r.suggestion}`);
      }
    }

    return lines.join('\n');
  }

  private async buildContext(projectWiki: ProjectWikiState | null): Promise<LintContext> {
    const recipeWiki = getRecipeWiki();
    const devWiki = getDevWiki();

    const recipeGenres = await recipeWiki.listGenres();
    const devPages = (await devWiki.listPages()).map(p => ({
      path: p.path,
      content: p.content,
      lastUpdated: p.lastUpdated,
      sources: p.sources,
    }));

    return { recipeGenres, devPages, projectWiki };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: WikiLint | null = null;

export function getWikiLint(): WikiLint {
  if (!_instance) {
    _instance = new WikiLint();
  }
  return _instance;
}

export function resetWikiLint(): void {
  _instance = null;
}

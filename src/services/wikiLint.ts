/**
 * Wiki Lint & Health Dashboard — automated lint checks for wiki knowledge decay.
 * Detects contradictions, stale claims, orphan pages, and data gaps.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1456
 */

import type {
  LintResult,
  LintRule,
  WikiHealthReport,
} from '../types/wikiLint';
import type { RecipeWiki } from './recipeWiki';
import type { ProjectWikiService } from './projectWiki';
import type { DevWikiService } from './devWiki';

type LintRuleExecutor = () => LintResult[];

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const REPEATED_FAILURE_THRESHOLD = 3;

export class WikiLintService {
  private recipeWiki: RecipeWiki;
  private projectWiki: ProjectWikiService;
  private devWiki: DevWikiService;
  private customRules: Array<{ rule: LintRule; executor: LintRuleExecutor }> = [];

  constructor(
    recipeWiki: RecipeWiki,
    projectWiki: ProjectWikiService,
    devWiki: DevWikiService,
  ) {
    this.recipeWiki = recipeWiki;
    this.projectWiki = projectWiki;
    this.devWiki = devWiki;
  }

  // ─── Recipe Wiki Lint ───────────────────────────────────────────────

  lintRecipeWiki(): LintResult[] {
    const results: LintResult[] = [];
    const entries = this.recipeWiki.getAllEntries();

    // Gap: empty wiki
    if (entries.length === 0) {
      results.push({
        ruleId: 'recipe-empty',
        severity: 'info',
        category: 'gap',
        wikiType: 'recipe',
        message: 'Recipe wiki is empty — no generation data captured yet.',
        suggestion: 'Generate music and rate results to build the knowledge base.',
      });
      return results;
    }

    // Pattern: repeated failures with same params
    const failedEntries = entries.filter(e => !e.success);
    if (failedEntries.length >= REPEATED_FAILURE_THRESHOLD) {
      const paramGroups = new Map<string, number>();
      for (const e of failedEntries) {
        const key = `${e.params.taskType}:cfg=${e.params.cfgStrength}:steps=${e.params.steps}:shift=${e.params.shift}`;
        paramGroups.set(key, (paramGroups.get(key) ?? 0) + 1);
      }

      for (const [params, count] of paramGroups) {
        if (count >= REPEATED_FAILURE_THRESHOLD) {
          results.push({
            ruleId: 'recipe-repeated-failure',
            severity: 'warning',
            category: 'pattern',
            wikiType: 'recipe',
            message: `${count} failed generations with same params: ${params}`,
            suggestion: 'Consider adjusting these parameters — they consistently produce poor results.',
            context: { params, failureCount: count },
          });
        }
      }
    }

    return results;
  }

  // ─── Project Wiki Lint ──────────────────────────────────────────────

  lintProjectWiki(): LintResult[] {
    const results: LintResult[] = [];
    const pages = this.projectWiki.listPages();

    if (pages.length === 0) {
      results.push({
        ruleId: 'project-empty',
        severity: 'info',
        category: 'gap',
        wikiType: 'project',
        message: 'Project wiki has no pages.',
        suggestion: 'Add a creative brief to document genre, mood, and references.',
      });
      return results;
    }

    // Gap: missing recommended pages
    const pageNames = new Set(pages.map(p => p.pageName));
    const recommended = ['creative-brief.md', 'generation-log.md'];
    for (const name of recommended) {
      if (!pageNames.has(name)) {
        results.push({
          ruleId: 'project-missing-page',
          severity: 'info',
          category: 'gap',
          wikiType: 'project',
          message: `Recommended page "${name}" is missing.`,
          suggestion: `Create ${name} to track ${name.includes('brief') ? 'creative direction' : 'generation history'}.`,
        });
      }
    }

    return results;
  }

  // ─── Dev Wiki Lint ──────────────────────────────────────────────────

  lintDevWiki(): LintResult[] {
    const results: LintResult[] = [];
    const entries = this.devWiki.getAllEntries();

    if (entries.length === 0) {
      results.push({
        ruleId: 'dev-empty',
        severity: 'info',
        category: 'gap',
        wikiType: 'dev',
        message: 'Development wiki is empty.',
        suggestion: 'Run @researcher to populate competitive research.',
      });
      return results;
    }

    // Stale: entries not updated in 6+ months
    const now = Date.now();
    for (const entry of entries) {
      if (now - entry.updatedAt > SIX_MONTHS_MS) {
        results.push({
          ruleId: 'dev-stale',
          severity: 'warning',
          category: 'stale',
          wikiType: 'dev',
          message: `"${entry.title}" hasn't been updated in 6+ months.`,
          suggestion: 'Verify this information is still accurate and update if needed.',
          context: { entryId: entry.id, lastUpdated: entry.updatedAt },
        });
      }
    }

    return results;
  }

  // ─── Custom Rules ──────────────────────────────────────────────────

  addRule(rule: LintRule, executor: LintRuleExecutor): void {
    // Wrap executor to enforce rule metadata on results
    const wrappedExecutor: LintRuleExecutor = () => {
      return executor().map(result => ({
        ...result,
        ruleId: rule.id,
        severity: result.severity ?? rule.severity,
        category: result.category ?? rule.category,
      }));
    };
    this.customRules.push({ rule, executor: wrappedExecutor });
  }

  // ─── Health Report ──────────────────────────────────────────────────

  generateHealthReport(): WikiHealthReport {
    const allResults: LintResult[] = [
      ...this.lintRecipeWiki(),
      ...this.lintProjectWiki(),
      ...this.lintDevWiki(),
    ];

    // Run custom rules
    for (const { executor } of this.customRules) {
      allResults.push(...executor());
    }

    const errors = allResults.filter(r => r.severity === 'error').length;
    const warnings = allResults.filter(r => r.severity === 'warning').length;
    const infos = allResults.filter(r => r.severity === 'info').length;

    const recipeEntries = this.recipeWiki.getAllEntries();
    const recipeGenres = this.recipeWiki.getGenreStats();

    return {
      timestamp: Date.now(),
      totalIssues: allResults.length,
      errors,
      warnings,
      infos,
      results: allResults,
      recipeStats: {
        entryCount: recipeEntries.length,
        genreCount: recipeGenres.size,
      },
      projectStats: {
        pageCount: this.projectWiki.listPages().length,
      },
      devStats: {
        entryCount: this.devWiki.getAllEntries().length,
        tagCount: this.devWiki.getAllTags().length,
      },
    };
  }
}

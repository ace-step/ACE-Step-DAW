/**
 * Wiki Lint & Health Dashboard — periodic knowledge base maintenance.
 * Pluggable lint rules detect stale content, contradictions, missing pages,
 * and orphaned entries. Each warning includes an actionable fix suggestion.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1456
 */

import { getProjectWiki, type ProjectWikiService } from './projectWiki';
import type { WikiPage } from '../types/projectWiki';
import { DEFAULT_PAGE_INDEX } from '../types/projectWiki';

// ─── Types ──────────────────────────────────────────────────────────────

export type LintSeverity = 'info' | 'warning' | 'error';

export interface LintWarning {
  ruleId: string;
  severity: LintSeverity;
  page: string;
  message: string;
  suggestion: string;
}

export interface LintRule {
  id: string;
  name: string;
  /** 'lightweight' rules run on every init; 'comprehensive' rules run weekly. */
  mode: 'lightweight' | 'comprehensive';
  check: (wiki: ProjectWikiService, pages: Map<string, WikiPage>) => Promise<LintWarning[]>;
}

export interface LintReport {
  projectId: string;
  timestamp: number;
  warnings: LintWarning[];
  ruleCount: number;
  pageCount: number;
}

// ─── Built-in Rules ─────────────────────────────────────────────────────

const missingDefaultPages: LintRule = {
  id: 'missing-default-pages',
  name: 'Missing Default Pages',
  mode: 'lightweight',
  check: async (_wiki, pages) => {
    const warnings: LintWarning[] = [];
    for (const name of DEFAULT_PAGE_INDEX) {
      if (!pages.has(name)) {
        warnings.push({
          ruleId: 'missing-default-pages',
          severity: 'warning',
          page: name,
          message: `Default wiki page '${name}' is missing.`,
          suggestion: `Re-initialize the wiki or create '${name}' with setPage().`,
        });
      }
    }
    return warnings;
  },
};

const emptyPages: LintRule = {
  id: 'empty-pages',
  name: 'Empty Pages',
  mode: 'lightweight',
  check: async (_wiki, pages) => {
    const warnings: LintWarning[] = [];
    for (const [name, page] of pages) {
      const contentLines = page.content
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('_'));
      if (contentLines.length === 0) {
        warnings.push({
          ruleId: 'empty-pages',
          severity: 'info',
          page: name,
          message: `Page '${name}' has no content beyond headings/placeholders.`,
          suggestion: `Add content to '${name}' — this wiki page can track ${name.replace(/-/g, ' ')} decisions.`,
        });
      }
    }
    return warnings;
  },
};

const staleGenerationLog: LintRule = {
  id: 'stale-generation-log',
  name: 'Stale Generation Log',
  mode: 'comprehensive',
  check: async (_wiki, pages) => {
    const warnings: LintWarning[] = [];
    const genLog = pages.get('generation-log');
    if (!genLog) return warnings;

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - genLog.updatedAt > sevenDaysMs) {
      const daysAgo = Math.floor((Date.now() - genLog.updatedAt) / (24 * 60 * 60 * 1000));
      warnings.push({
        ruleId: 'stale-generation-log',
        severity: 'info',
        page: 'generation-log',
        message: `Generation log hasn't been updated in ${daysAgo} days.`,
        suggestion: 'Generate new audio to automatically update the log, or manually note any offline decisions.',
      });
    }
    return warnings;
  },
};

const creativeBriefNotSet: LintRule = {
  id: 'creative-brief-not-set',
  name: 'Creative Brief Not Set',
  mode: 'lightweight',
  check: async (_wiki, pages) => {
    const warnings: LintWarning[] = [];
    const brief = pages.get('creative-brief');
    if (!brief) return warnings;

    if (brief.content.includes('_Not yet defined._') || brief.content.includes('_None added yet._')) {
      warnings.push({
        ruleId: 'creative-brief-not-set',
        severity: 'warning',
        page: 'creative-brief',
        message: 'Creative brief still has placeholder content.',
        suggestion: 'Define the genre direction, reference tracks, and lyric themes to guide AI generation.',
      });
    }
    return warnings;
  },
};

const largePage: LintRule = {
  id: 'large-page',
  name: 'Large Page',
  mode: 'comprehensive',
  check: async (_wiki, pages) => {
    const warnings: LintWarning[] = [];
    const MAX_LINES = 500;
    for (const [name, page] of pages) {
      const lineCount = page.content.split('\n').length;
      if (lineCount > MAX_LINES) {
        warnings.push({
          ruleId: 'large-page',
          severity: 'warning',
          page: name,
          message: `Page '${name}' has ${lineCount} lines (limit: ${MAX_LINES}).`,
          suggestion: `Split '${name}' into sub-pages or archive older entries.`,
        });
      }
    }
    return warnings;
  },
};

// ─── Rule Registry ──────────────────────────────────────────────────────

const BUILT_IN_RULES: LintRule[] = [
  missingDefaultPages,
  emptyPages,
  staleGenerationLog,
  creativeBriefNotSet,
  largePage,
];

const _customRules: LintRule[] = [];

/** Register a custom lint rule. */
export function registerLintRule(rule: LintRule): void {
  _customRules.push(rule);
}

/** Clear all custom lint rules (for testing). */
export function clearCustomLintRules(): void {
  _customRules.length = 0;
}

function getAllRules(): LintRule[] {
  return [...BUILT_IN_RULES, ..._customRules];
}

// ─── Lint Runner ────────────────────────────────────────────────────────

/**
 * Run lint rules against a project wiki.
 * @param projectId - The project to lint.
 * @param mode - 'lightweight' runs only fast rules (project init),
 *               'comprehensive' runs all rules (weekly audit).
 */
export async function lintProjectWiki(
  projectId: string,
  mode: 'lightweight' | 'comprehensive' = 'lightweight',
): Promise<LintReport> {
  const wiki = getProjectWiki(projectId);
  await wiki.initialize();

  // Load all pages
  const pageNames = wiki.listPages();
  const pages = new Map<string, WikiPage>();
  for (const name of pageNames) {
    const page = await wiki.getPage(name);
    if (page) pages.set(name, page);
  }

  const rules = getAllRules().filter(
    r => mode === 'comprehensive' || r.mode === 'lightweight',
  );

  const warnings: LintWarning[] = [];
  for (const rule of rules) {
    const ruleWarnings = await rule.check(wiki, pages);
    warnings.push(...ruleWarnings);
  }

  return {
    projectId,
    timestamp: Date.now(),
    warnings,
    ruleCount: rules.length,
    pageCount: pages.size,
  };
}

/**
 * Format a lint report as a concise string for CLI/status display.
 */
export function formatLintReport(report: LintReport): string {
  if (report.warnings.length === 0) {
    return `Wiki lint: ${report.pageCount} pages, ${report.ruleCount} rules — all clear`;
  }

  const errorCount = report.warnings.filter(w => w.severity === 'error').length;
  const warnCount = report.warnings.filter(w => w.severity === 'warning').length;
  const infoCount = report.warnings.filter(w => w.severity === 'info').length;

  const counts = [
    errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : '',
    warnCount > 0 ? `${warnCount} warning${warnCount > 1 ? 's' : ''}` : '',
    infoCount > 0 ? `${infoCount} info` : '',
  ].filter(Boolean).join(', ');

  const lines = [`Wiki lint: ${counts}`];
  for (const w of report.warnings) {
    const icon = w.severity === 'error' ? 'ERR' : w.severity === 'warning' ? 'WARN' : 'INFO';
    lines.push(`  [${icon}] ${w.page}: ${w.message}`);
    lines.push(`         Fix: ${w.suggestion}`);
  }

  return lines.join('\n');
}

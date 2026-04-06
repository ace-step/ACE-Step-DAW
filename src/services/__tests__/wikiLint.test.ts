import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import {
  lintProjectWiki,
  formatLintReport,
  registerLintRule,
  clearCustomLintRules,
} from '../wikiLint';
import type { LintRule, LintReport } from '../wikiLint';
import { resetProjectWiki } from '../projectWiki';
import type { WikiPage } from '../../types/projectWiki';
import { WIKI_PAGE_TEMPLATES, DEFAULT_PAGE_INDEX } from '../../types/projectWiki';

const PROJECT_ID = 'lint-test-proj';

function makeMeta(pageIndex: string[] = DEFAULT_PAGE_INDEX) {
  return {
    projectId: PROJECT_ID,
    pageIndex,
    createdAt: 1000,
    updatedAt: Date.now(),
  };
}

function makePage(name: string, content?: string, updatedAt?: number): WikiPage {
  return {
    name,
    content: content ?? WIKI_PAGE_TEMPLATES[name] ?? `# ${name}`,
    createdAt: 1000,
    updatedAt: updatedAt ?? Date.now(),
  };
}

describe('WikiLint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectWiki();
    clearCustomLintRules();
    mockGet.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
  });

  describe('lintProjectWiki', () => {
    it('reports no warnings for a healthy wiki', async () => {
      const pages: Record<string, WikiPage> = {};
      for (const name of DEFAULT_PAGE_INDEX) {
        pages[name] = makePage(name, `# ${name}\n\nSome real content here about ${name}.`);
      }

      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta());
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(pages[pageName]);
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      expect(report.warnings).toHaveLength(0);
      expect(report.projectId).toBe(PROJECT_ID);
      expect(report.pageCount).toBe(4);
    });

    it('warns about missing default pages', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve(makeMeta(['index']));
        }
        if (key === `wiki:${PROJECT_ID}:index`) {
          return Promise.resolve(makePage('index', '# Wiki\n\nSome content here.'));
        }
        return Promise.resolve(undefined);
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      const missingWarnings = report.warnings.filter(w => w.ruleId === 'missing-default-pages');
      expect(missingWarnings.length).toBeGreaterThanOrEqual(2); // creative-brief, generation-log, mix-decisions
    });

    it('warns about empty pages', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta());
        if (key === `wiki:${PROJECT_ID}:index`) {
          return Promise.resolve(makePage('index', '# Index\n\n'));
        }
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(makePage(pageName, `# ${pageName}\n\nReal content for ${pageName}.`));
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      const emptyWarnings = report.warnings.filter(w => w.ruleId === 'empty-pages');
      expect(emptyWarnings.length).toBe(1);
      expect(emptyWarnings[0].page).toBe('index');
    });

    it('warns about placeholder creative brief', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta());
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(makePage(pageName)); // uses templates with placeholders
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      const briefWarnings = report.warnings.filter(w => w.ruleId === 'creative-brief-not-set');
      expect(briefWarnings.length).toBe(1);
      expect(briefWarnings[0].suggestion).toContain('genre direction');
    });

    it('comprehensive mode includes stale generation log check', async () => {
      const staleDate = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 days ago
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta());
        if (key === `wiki:${PROJECT_ID}:generation-log`) {
          return Promise.resolve(makePage('generation-log', '# Log\n\nEntry from 2 weeks ago.', staleDate));
        }
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(makePage(pageName, `# ${pageName}\n\nReal content for ${pageName}.`));
      });

      const report = await lintProjectWiki(PROJECT_ID, 'comprehensive');
      const staleWarnings = report.warnings.filter(w => w.ruleId === 'stale-generation-log');
      expect(staleWarnings.length).toBe(1);
      expect(staleWarnings[0].message).toContain('14 days');
    });

    it('lightweight mode skips comprehensive-only rules', async () => {
      const staleDate = Date.now() - 14 * 24 * 60 * 60 * 1000;
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta());
        if (key === `wiki:${PROJECT_ID}:generation-log`) {
          return Promise.resolve(makePage('generation-log', '# Log\n\nRecent entry.', staleDate));
        }
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(makePage(pageName, `# ${pageName}\n\nReal content for ${pageName}.`));
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      const staleWarnings = report.warnings.filter(w => w.ruleId === 'stale-generation-log');
      expect(staleWarnings.length).toBe(0);
    });
  });

  describe('registerLintRule', () => {
    it('custom rules are included in lint runs', async () => {
      const customRule: LintRule = {
        id: 'custom-test-rule',
        name: 'Custom Test',
        mode: 'lightweight',
        check: async () => [{
          ruleId: 'custom-test-rule',
          severity: 'info',
          page: 'index',
          message: 'Custom check passed',
          suggestion: 'No action needed',
        }],
      };

      registerLintRule(customRule);

      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(makeMeta(['index']));
        if (key === `wiki:${PROJECT_ID}:index`) {
          return Promise.resolve(makePage('index', '# Wiki\n\nContent.'));
        }
        return Promise.resolve(undefined);
      });

      const report = await lintProjectWiki(PROJECT_ID, 'lightweight');
      const customWarnings = report.warnings.filter(w => w.ruleId === 'custom-test-rule');
      expect(customWarnings.length).toBe(1);
    });
  });

  describe('formatLintReport', () => {
    it('shows all-clear for zero warnings', () => {
      const report: LintReport = {
        projectId: PROJECT_ID,
        timestamp: Date.now(),
        warnings: [],
        ruleCount: 5,
        pageCount: 4,
      };

      const formatted = formatLintReport(report);
      expect(formatted).toContain('all clear');
      expect(formatted).toContain('4 pages');
    });

    it('formats warnings with severity counts and suggestions', () => {
      const report: LintReport = {
        projectId: PROJECT_ID,
        timestamp: Date.now(),
        warnings: [
          { ruleId: 'test', severity: 'warning', page: 'brief', message: 'Stale content', suggestion: 'Update it' },
          { ruleId: 'test', severity: 'info', page: 'log', message: 'Old log', suggestion: 'Refresh' },
        ],
        ruleCount: 3,
        pageCount: 4,
      };

      const formatted = formatLintReport(report);
      expect(formatted).toContain('1 warning');
      expect(formatted).toContain('1 info');
      expect(formatted).toContain('[WARN]');
      expect(formatted).toContain('[INFO]');
      expect(formatted).toContain('Fix: Update it');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

const mockSuggestParameters = vi.fn();
const mockGetGenreStats = vi.fn();
const mockGetAllEntries = vi.fn();
vi.mock('../recipeWiki', () => ({
  getRecipeWiki: vi.fn().mockResolvedValue({
    suggestParameters: (...args: unknown[]) => mockSuggestParameters(...args),
    getGenreStats: (...args: unknown[]) => mockGetGenreStats(...args),
    getAllEntries: (...args: unknown[]) => mockGetAllEntries(...args),
  }),
}));

const mockDevWikiListPages = vi.fn();
vi.mock('../devWiki', () => ({
  getDevWiki: vi.fn().mockReturnValue({
    listPages: (...args: unknown[]) => mockDevWikiListPages(...args),
  }),
}));

import { WikiLint, resetWikiLint } from '../wikiLint';
import type { ProjectWikiState } from '../../types/projectWiki';

function makeProjectWiki(overrides: Partial<ProjectWikiState> = {}): ProjectWikiState {
  return {
    projectId: 'test-project',
    creativeBrief: { genre: 'Jazz', mood: 'mellow', references: ['Coltrane'], audience: '', notes: '' },
    generationLog: [],
    mixDecisions: [],
    trackNotes: [],
    customPages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('WikiLint', () => {
  let lint: WikiLint;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    mockGetGenreStats.mockReturnValue(new Map());
    mockGetAllEntries.mockReturnValue([]);
    mockDevWikiListPages.mockResolvedValue([]);
    resetWikiLint();
    lint = new WikiLint();
  });

  describe('check', () => {
    it('returns healthy summary when no issues', async () => {
      const summary = await lint.check();
      expect(summary.totalIssues).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.warnings).toBe(0);
    });

    it('detects low-sample genres', async () => {
      mockGetGenreStats.mockReturnValue(new Map([
        ['jazz', { count: 2, averageRating: 4, successRate: 1 }],
      ]));
      const summary = await lint.check();
      expect(summary.info).toBe(1);
      expect(summary.results[0].rule).toBe('recipe-low-sample');
    });

    it('detects high-failure genres', async () => {
      mockGetGenreStats.mockReturnValue(new Map([
        ['metal', { count: 10, averageRating: 2, successRate: 0.3 }],
      ]));
      const summary = await lint.check();
      expect(summary.warnings).toBeGreaterThanOrEqual(1);
      expect(summary.results.some(r => r.rule === 'recipe-high-failure')).toBe(true);
    });

    it('detects incomplete creative brief', async () => {
      const wiki = makeProjectWiki({
        creativeBrief: { genre: '', mood: '', references: [], audience: '', notes: '' },
      });
      const summary = await lint.check(wiki);
      expect(summary.results.some(r => r.rule === 'project-brief-incomplete')).toBe(true);
    });

    it('detects many failed generations', async () => {
      const wiki = makeProjectWiki({
        generationLog: [
          { timestamp: 1, trackId: 't', prompt: 'p', params: {}, outcome: 'failed' },
          { timestamp: 2, trackId: 't', prompt: 'p', params: {}, outcome: 'failed' },
          { timestamp: 3, trackId: 't', prompt: 'p', params: {}, outcome: 'failed' },
        ],
      });
      const summary = await lint.check(wiki);
      expect(summary.results.some(r => r.rule === 'project-many-failures')).toBe(true);
    });

    it('detects stale dev wiki pages', async () => {
      const sixMonthsAgo = Date.now() - 7 * 30 * 24 * 60 * 60 * 1000;
      mockDevWikiListPages.mockResolvedValueOnce([
        { path: 'old-page', content: 'old info', lastUpdated: sixMonthsAgo, sources: [] },
      ]);
      const summary = await lint.check();
      expect(summary.results.some(r => r.rule === 'dev-stale')).toBe(true);
    });

    it('detects missing sources on competitor pages', async () => {
      mockDevWikiListPages.mockResolvedValueOnce([
        { path: 'competitors/bitwig.md', content: 'Bitwig info', lastUpdated: Date.now(), sources: [] },
      ]);
      const summary = await lint.check();
      expect(summary.results.some(r => r.rule === 'dev-missing-sources')).toBe(true);
    });
  });

  describe('quickCheck', () => {
    it('only runs lightweight rules', async () => {
      mockGetGenreStats.mockReturnValue(new Map([
        ['jazz', { count: 2, averageRating: 4, successRate: 1 }],
      ]));
      // Add a stale dev page that should NOT be checked in quickCheck
      mockDevWikiListPages.mockResolvedValueOnce([
        { path: 'competitors/old', content: 'old', lastUpdated: 0, sources: [] },
      ]);

      const summary = await lint.quickCheck();
      // Should find low-sample but NOT stale dev page
      expect(summary.results.some(r => r.rule === 'recipe-low-sample')).toBe(true);
      expect(summary.results.some(r => r.rule === 'dev-stale')).toBe(false);
    });
  });

  describe('formatResults', () => {
    it('formats healthy summary', () => {
      const result = lint.formatResults({
        totalIssues: 0, errors: 0, warnings: 0, info: 0, results: [], checkedAt: Date.now(),
      });
      expect(result).toContain('healthy');
    });

    it('formats issues with icons', () => {
      const result = lint.formatResults({
        totalIssues: 2,
        errors: 1,
        warnings: 1,
        info: 0,
        results: [
          { source: 'recipe', path: 'test', severity: 'error', rule: 'test', message: 'Error msg' },
          { source: 'dev', path: 'test2', severity: 'warning', rule: 'test', message: 'Warn msg', suggestion: 'Fix it' },
        ],
        checkedAt: Date.now(),
      });
      expect(result).toContain('1 errors');
      expect(result).toContain('1 warnings');
      expect(result).toContain('Fix it');
    });
  });
});

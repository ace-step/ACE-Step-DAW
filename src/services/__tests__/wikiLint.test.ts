import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: vi.fn(),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import { WikiLint, resetWikiLint } from '../wikiLint';
import { resetRecipeWiki } from '../recipeWiki';
import { resetDevWiki } from '../devWiki';
import type { GenreRecipe } from '../../types/recipeWiki';
import type { ProjectWikiState } from '../../types/projectWiki';

function makeGenreRecipe(overrides: Partial<GenreRecipe> = {}): GenreRecipe {
  return {
    genre: 'Lo-Fi',
    totalGenerations: 20,
    successfulGenerations: 18,
    failedGenerations: 2,
    averageRating: 4.0,
    bestPrompts: [],
    recommendedParams: {},
    knownFailures: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

function makeProjectWiki(overrides: Partial<ProjectWikiState> = {}): ProjectWikiState {
  return {
    projectId: 'proj-1',
    creativeBrief: { genre: 'Lo-Fi', mood: 'chill', references: ['ref1'], audience: 'test', notes: '' },
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
    mockSet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockKeys.mockReset();
    mockKeys.mockResolvedValue([]);
    resetWikiLint();
    resetRecipeWiki();
    resetDevWiki();
    lint = new WikiLint();
  });

  // ─── Recipe Wiki Lint ──────────────────────────────────────────────────

  describe('recipe wiki rules', () => {
    it('flags stale genre recipes', async () => {
      const old = Date.now() - 4 * 30 * 24 * 60 * 60 * 1000; // 4 months
      mockKeys.mockResolvedValue(['recipe:genre:Jazz']);
      mockGet.mockResolvedValue(makeGenreRecipe({ genre: 'Jazz', lastUpdated: old }));

      const summary = await lint.check();
      expect(summary.results.some(r => r.rule === 'recipe-stale-params')).toBe(true);
    });

    it('flags genres with low sample size', async () => {
      mockKeys.mockResolvedValue(['recipe:genre:Rare']);
      mockGet.mockResolvedValue(makeGenreRecipe({
        genre: 'Rare',
        totalGenerations: 2,
        successfulGenerations: 1,
      }));

      const summary = await lint.check();
      expect(summary.results.some(r => r.rule === 'recipe-low-sample')).toBe(true);
    });

    it('flags high failure rate genres', async () => {
      mockKeys.mockResolvedValue(['recipe:genre:Broken']);
      mockGet.mockResolvedValue(makeGenreRecipe({
        genre: 'Broken',
        totalGenerations: 10,
        failedGenerations: 6,
      }));

      const summary = await lint.check();
      expect(summary.results.some(r => r.rule === 'recipe-high-failure')).toBe(true);
    });
  });

  // ─── Project Wiki Lint ─────────────────────────────────────────────────

  describe('project wiki rules', () => {
    it('flags incomplete creative brief', async () => {
      const wiki = makeProjectWiki({
        creativeBrief: { genre: '', mood: '', references: [], audience: '', notes: '' },
      });

      const summary = await lint.check(wiki);
      expect(summary.results.some(r => r.rule === 'project-brief-incomplete')).toBe(true);
    });

    it('flags projects with many failures', async () => {
      const wiki = makeProjectWiki({
        generationLog: [
          { timestamp: 1, trackId: 't', prompt: 'a', params: {}, outcome: 'failed' },
          { timestamp: 2, trackId: 't', prompt: 'b', params: {}, outcome: 'failed' },
          { timestamp: 3, trackId: 't', prompt: 'c', params: {}, outcome: 'failed' },
        ],
      });

      const summary = await lint.check(wiki);
      expect(summary.results.some(r => r.rule === 'project-many-failures')).toBe(true);
    });

    it('passes for complete project', async () => {
      const wiki = makeProjectWiki();

      const summary = await lint.check(wiki);
      const projectResults = summary.results.filter(r => r.source === 'project');
      expect(projectResults).toHaveLength(0);
    });
  });

  // ─── Health Summary ────────────────────────────────────────────────────

  describe('health summary', () => {
    it('returns clean summary when no issues', async () => {
      const summary = await lint.check();
      expect(summary.totalIssues).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.warnings).toBe(0);
    });

    it('counts severity levels correctly', async () => {
      // Set up: stale recipe (warning) + incomplete brief (info) + low sample (info)
      mockKeys.mockResolvedValue(['recipe:genre:Old']);
      const old = Date.now() - 4 * 30 * 24 * 60 * 60 * 1000;
      mockGet.mockResolvedValue(makeGenreRecipe({ lastUpdated: old, totalGenerations: 3 }));

      const wiki = makeProjectWiki({
        creativeBrief: { genre: '', mood: '', references: [], audience: '', notes: '' },
      });

      const summary = await lint.check(wiki);
      expect(summary.totalIssues).toBeGreaterThan(0);
      expect(summary.checkedAt).toBeGreaterThan(0);
    });
  });

  // ─── Quick Check ───────────────────────────────────────────────────────

  describe('quickCheck', () => {
    it('only runs lightweight rules', async () => {
      const old = Date.now() - 4 * 30 * 24 * 60 * 60 * 1000;
      mockKeys.mockResolvedValue(['recipe:genre:Old']);
      mockGet.mockResolvedValue(makeGenreRecipe({ lastUpdated: old }));

      const summary = await lint.quickCheck();

      // recipe-stale-params should NOT be in quick check
      expect(summary.results.some(r => r.rule === 'recipe-stale-params')).toBe(false);
    });
  });

  // ─── Format ────────────────────────────────────────────────────────────

  describe('formatResults', () => {
    it('formats clean results', () => {
      const summary = {
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        info: 0,
        results: [],
        checkedAt: Date.now(),
      };

      const text = lint.formatResults(summary);
      expect(text).toContain('healthy');
    });

    it('formats results with suggestions', () => {
      const summary = {
        totalIssues: 1,
        errors: 0,
        warnings: 1,
        info: 0,
        results: [{
          source: 'recipe' as const,
          path: 'genres/Jazz',
          severity: 'warning' as const,
          rule: 'recipe-stale-params',
          message: 'Jazz recommendations stale',
          suggestion: 'Generate more Jazz tracks',
        }],
        checkedAt: Date.now(),
      };

      const text = lint.formatResults(summary);
      expect(text).toContain('1 warnings');
      expect(text).toContain('Jazz recommendations stale');
      expect(text).toContain('Generate more Jazz tracks');
    });
  });

  // ─── Custom Rules ──────────────────────────────────────────────────────

  describe('custom rules', () => {
    it('accepts custom lint rules', async () => {
      const customRule = {
        name: 'custom-always-warn',
        description: 'Always warns',
        check: () => [{
          source: 'recipe' as const,
          path: 'test',
          severity: 'warning' as const,
          rule: 'custom-always-warn',
          message: 'Custom warning',
        }],
      };

      const customLint = new WikiLint([customRule]);
      const summary = await customLint.check();

      expect(summary.totalIssues).toBe(1);
      expect(summary.results[0].rule).toBe('custom-always-warn');
    });
  });
});

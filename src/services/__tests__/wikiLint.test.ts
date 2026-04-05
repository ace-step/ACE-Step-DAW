import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: vi.fn(),
  keys: vi.fn(() => Promise.resolve([])),
}));

import { WikiLintService } from '../wikiLint';
import { RecipeWiki } from '../recipeWiki';
import { ProjectWikiService } from '../projectWiki';
import { DevWikiService } from '../devWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenerationEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: `clip-${Math.random().toString(36).slice(2, 6)}`,
    trackId: 'track-1',
    prompt: 'lo-fi beat',
    params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
    result: 'kept',
    inferredMetas: { genres: ['lo-fi'], bpm: 85 },
    userRating: 4,
    ...overrides,
  };
}

describe('WikiLintService', () => {
  let recipeWiki: RecipeWiki;
  let projectWiki: ProjectWikiService;
  let devWiki: DevWikiService;
  let lintService: WikiLintService;

  beforeEach(async () => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);

    recipeWiki = new RecipeWiki();
    await recipeWiki.initialize();

    projectWiki = new ProjectWikiService('test-proj');
    await projectWiki.initialize();

    devWiki = new DevWikiService();
    await devWiki.initialize();

    lintService = new WikiLintService(recipeWiki, projectWiki, devWiki);
  });

  // ─── Recipe Wiki Lint ───────────────────────────────────────────────

  describe('recipe wiki lint', () => {
    it('detects repeated failures with same params', async () => {
      // Add 5 failed generations with identical params
      for (let i = 0; i < 5; i++) {
        await recipeWiki.ingest(makeGenerationEvent({
          clipId: `fail-${i}`,
          type: 'generation_failed',
          result: 'regenerated',
          userRating: 1,
          params: { taskType: 'text2music', cfgStrength: 7, steps: 60, shift: 5 },
        }));
      }

      const results = lintService.lintRecipeWiki();
      const patternIssues = results.filter(r => r.category === 'pattern');
      expect(patternIssues.length).toBeGreaterThan(0);
      expect(patternIssues[0].suggestion).toBeTruthy();
    });

    it('detects empty recipe wiki', () => {
      const results = lintService.lintRecipeWiki();
      const gaps = results.filter(r => r.category === 'gap');
      expect(gaps.length).toBeGreaterThan(0);
    });

    it('passes clean for healthy wiki', async () => {
      // Add varied successful generations
      for (let i = 0; i < 5; i++) {
        await recipeWiki.ingest(makeGenerationEvent({
          clipId: `ok-${i}`,
          userRating: 4,
          inferredMetas: { genres: ['lo-fi'], bpm: 85 + i },
        }));
      }

      const results = lintService.lintRecipeWiki();
      const errors = results.filter(r => r.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  // ─── Project Wiki Lint ──────────────────────────────────────────────

  describe('project wiki lint', () => {
    it('detects empty project wiki', () => {
      const results = lintService.lintProjectWiki();
      const gaps = results.filter(r => r.category === 'gap');
      expect(gaps.length).toBeGreaterThan(0);
    });

    it('passes clean when pages exist', async () => {
      await projectWiki.setPage('creative-brief.md', 'Genre: lo-fi');
      await projectWiki.setPage('generation-log.md', 'Entries here');

      const results = lintService.lintProjectWiki();
      const gaps = results.filter(r =>
        r.category === 'gap' && r.message.includes('creative-brief')
      );
      expect(gaps).toHaveLength(0);
    });
  });

  // ─── Dev Wiki Lint ──────────────────────────────────────────────────

  describe('dev wiki lint', () => {
    it('detects stale entries', async () => {
      const sixMonthsAgo = Date.now() - 200 * 24 * 60 * 60 * 1000;
      // Restore from IndexedDB with a stale entry
      mockGet.mockReset();
      mockGet.mockResolvedValueOnce({
        entries: [{
          id: 'stale-1',
          category: 'competitor',
          title: 'Old Competitor Info',
          content: 'Feature from last year',
          tags: ['stale-test'],
          createdAt: sixMonthsAgo,
          updatedAt: sixMonthsAgo,
        }],
        lastUpdated: sixMonthsAgo,
        version: 1,
      });
      const staleDevWiki = new DevWikiService();
      await staleDevWiki.initialize();
      const staleLint = new WikiLintService(recipeWiki, projectWiki, staleDevWiki);

      const results = staleLint.lintDevWiki();
      const stale = results.filter(r => r.category === 'stale');
      expect(stale.length).toBeGreaterThan(0);
    });

    it('detects empty dev wiki', () => {
      const results = lintService.lintDevWiki();
      const gaps = results.filter(r => r.category === 'gap');
      expect(gaps.length).toBeGreaterThan(0);
    });
  });

  // ─── Full Health Report ─────────────────────────────────────────────

  describe('health report', () => {
    it('generates comprehensive health report', () => {
      const report = lintService.generateHealthReport();
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.totalIssues).toBe(report.errors + report.warnings + report.infos);
      expect(report.recipeStats).toBeTruthy();
      expect(report.projectStats).toBeTruthy();
      expect(report.devStats).toBeTruthy();
    });

    it('counts severity levels correctly', async () => {
      // Empty wikis will have gap warnings
      const report = lintService.generateHealthReport();
      expect(report.totalIssues).toBeGreaterThan(0);
      expect(report.warnings + report.infos).toBeGreaterThan(0);
    });
  });

  // ─── Custom Rules ───────────────────────────────────────────────────

  describe('custom rules', () => {
    it('allows adding custom lint rules', () => {
      lintService.addRule({
        id: 'custom-1',
        name: 'Custom Rule',
        description: 'A custom lint rule',
        wikiType: 'all',
        severity: 'info',
        category: 'gap',
      }, () => [{
        ruleId: 'custom-1',
        severity: 'info',
        category: 'gap',
        wikiType: 'recipe',
        message: 'Custom check passed',
      }]);

      const report = lintService.generateHealthReport();
      const customResults = report.results.filter(r => r.ruleId === 'custom-1');
      expect(customResults).toHaveLength(1);
    });
  });
});

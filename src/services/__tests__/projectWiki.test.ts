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

import { ProjectWikiService, getProjectWiki, resetProjectWiki } from '../projectWiki';
import type { WikiPage, ProjectWikiExport } from '../../types/projectWiki';
import {
  DEFAULT_PAGE_INDEX,
  WIKI_PAGE_TEMPLATES,
  PROJECT_WIKI_VERSION,
} from '../../types/projectWiki';

const PROJECT_ID = 'proj-123';

describe('ProjectWikiService', () => {
  let wiki: ProjectWikiService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    resetProjectWiki();
    wiki = new ProjectWikiService(PROJECT_ID);
  });

  // ─── Initialization ──────────────────────────────────────────────────

  describe('initialize', () => {
    it('creates default pages for a new project', async () => {
      await wiki.initialize();

      // Should store the wiki metadata
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:__meta__`,
        expect.objectContaining({
          projectId: PROJECT_ID,
          pageIndex: DEFAULT_PAGE_INDEX,
        }),
      );

      // Should create each default page
      for (const name of DEFAULT_PAGE_INDEX) {
        expect(mockSet).toHaveBeenCalledWith(
          `wiki:${PROJECT_ID}:${name}`,
          expect.objectContaining({
            name,
            content: WIKI_PAGE_TEMPLATES[name],
          }),
        );
      }
    });

    it('loads existing wiki without recreating pages', async () => {
      const existingMeta = {
        projectId: PROJECT_ID,
        pageIndex: ['index', 'custom-page'],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) return Promise.resolve(existingMeta);
        return Promise.resolve(undefined);
      });

      await wiki.initialize();

      // Should NOT write meta again — it already existed
      const metaSetCalls = mockSet.mock.calls.filter(
        (c) => c[0] === `wiki:${PROJECT_ID}:__meta__`,
      );
      expect(metaSetCalls).toHaveLength(0);
    });

    it('is idempotent — second call is a no-op', async () => {
      await wiki.initialize();
      const callCount = mockSet.mock.calls.length;
      await wiki.initialize();
      expect(mockSet.mock.calls.length).toBe(callCount);
    });
  });

  // ─── CRUD ────────────────────────────────────────────────────────────

  describe('getPage', () => {
    it('returns a page by name', async () => {
      const page: WikiPage = {
        name: 'creative-brief',
        content: '# Brief\nJazz fusion project',
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['creative-brief'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        if (key === `wiki:${PROJECT_ID}:creative-brief`) return Promise.resolve(page);
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      const result = await wiki.getPage('creative-brief');
      expect(result).toEqual(page);
    });

    it('returns null for nonexistent page', async () => {
      await wiki.initialize();
      const result = await wiki.getPage('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('setPage', () => {
    it('creates a new page and updates the index', async () => {
      await wiki.initialize();
      mockSet.mockClear();

      await wiki.setPage('track-notes-drums', '# Drums\nAcoustic kit, tight snare');

      // Should write the page
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:track-notes-drums`,
        expect.objectContaining({
          name: 'track-notes-drums',
          content: '# Drums\nAcoustic kit, tight snare',
        }),
      );

      // Should update the meta with new pageIndex
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:__meta__`,
        expect.objectContaining({
          pageIndex: expect.arrayContaining(['track-notes-drums']),
        }),
      );
    });

    it('updates existing page content without duplicating index', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'creative-brief'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        if (key === `wiki:${PROJECT_ID}:creative-brief`) {
          return Promise.resolve({
            name: 'creative-brief',
            content: 'old content',
            createdAt: 1000,
            updatedAt: 1000,
          });
        }
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      mockSet.mockClear();

      await wiki.setPage('creative-brief', 'new content');

      // Should update page
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:creative-brief`,
        expect.objectContaining({
          name: 'creative-brief',
          content: 'new content',
          createdAt: 1000, // preserves original createdAt
        }),
      );

      // Meta should NOT duplicate index entry
      const metaCalls = mockSet.mock.calls.filter(
        (c) => c[0] === `wiki:${PROJECT_ID}:__meta__`,
      );
      if (metaCalls.length > 0) {
        const pageIndex = metaCalls[0][1].pageIndex as string[];
        const briefCount = pageIndex.filter((p: string) => p === 'creative-brief').length;
        expect(briefCount).toBe(1);
      }
    });
  });

  describe('deletePage', () => {
    it('removes a page and updates the index', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'creative-brief', 'custom'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      mockSet.mockClear();

      await wiki.deletePage('custom');

      expect(mockDel).toHaveBeenCalledWith(`wiki:${PROJECT_ID}:custom`);
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:__meta__`,
        expect.objectContaining({
          pageIndex: ['index', 'creative-brief'],
        }),
      );
    });

    it('is a no-op for nonexistent page', async () => {
      await wiki.initialize();
      mockSet.mockClear();
      mockDel.mockClear();

      await wiki.deletePage('nonexistent');

      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe('listPages', () => {
    it('returns the page index', async () => {
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'creative-brief', 'generation-log'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      expect(wiki.listPages()).toEqual(['index', 'creative-brief', 'generation-log']);
    });
  });

  // ─── Generation Log Integration ─────────────────────────────────────

  describe('appendGenerationLog', () => {
    it('appends a generation entry to the generation-log page', async () => {
      const existingPage: WikiPage = {
        name: 'generation-log',
        content: '# Generation Log\n\n_Automatically updated when AI generates audio._\n',
        createdAt: 1000,
        updatedAt: 1000,
      };

      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: DEFAULT_PAGE_INDEX,
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        if (key === `wiki:${PROJECT_ID}:generation-log`) return Promise.resolve(existingPage);
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      mockSet.mockClear();

      await wiki.appendGenerationLog({
        clipId: 'clip-1',
        trackName: 'drums',
        prompt: 'Punchy acoustic drums',
        success: true,
        timestamp: 1700000000000,
      });

      const pageCalls = mockSet.mock.calls.filter(
        (c) => c[0] === `wiki:${PROJECT_ID}:generation-log`,
      );
      expect(pageCalls).toHaveLength(1);
      const updatedContent = pageCalls[0][1].content as string;
      expect(updatedContent).toContain('Punchy acoustic drums');
      expect(updatedContent).toContain('drums');
      expect(updatedContent).toContain('clip-1');
    });

    it('creates generation-log page if it does not exist', async () => {
      await wiki.initialize();
      mockSet.mockClear();

      await wiki.appendGenerationLog({
        clipId: 'clip-2',
        trackName: 'bass',
        prompt: 'Deep sub bass',
        success: true,
        timestamp: 1700000000000,
      });

      const pageCalls = mockSet.mock.calls.filter(
        (c) => c[0] === `wiki:${PROJECT_ID}:generation-log`,
      );
      expect(pageCalls).toHaveLength(1);
      expect(pageCalls[0][1].content).toContain('Deep sub bass');
    });
  });

  // ─── Export / Import ────────────────────────────────────────────────

  describe('export', () => {
    it('exports all pages with metadata', async () => {
      const pages: Record<string, WikiPage> = {
        index: { name: 'index', content: '# Wiki', createdAt: 1000, updatedAt: 2000 },
        brief: { name: 'brief', content: '# Brief', createdAt: 1000, updatedAt: 1500 },
      };
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'brief'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(pages[pageName] ?? undefined);
      });

      await wiki.initialize();
      const exported = await wiki.export();

      expect(exported.version).toBe(PROJECT_WIKI_VERSION);
      expect(exported.projectId).toBe(PROJECT_ID);
      expect(exported.pages).toHaveLength(2);
      expect(exported.pageIndex).toEqual(['index', 'brief']);
      expect(exported.exportedAt).toBeGreaterThan(0);
    });
  });

  describe('import', () => {
    it('imports pages and overwrites existing wiki', async () => {
      await wiki.initialize();
      mockSet.mockClear();

      const importData: ProjectWikiExport = {
        version: PROJECT_WIKI_VERSION,
        projectId: PROJECT_ID,
        pages: [
          { name: 'index', content: '# Imported Wiki', createdAt: 500, updatedAt: 600 },
          { name: 'custom', content: '# Custom Page', createdAt: 500, updatedAt: 700 },
        ],
        pageIndex: ['index', 'custom'],
        exportedAt: 800,
      };

      await wiki.import(importData);

      // Should write each page
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:index`,
        expect.objectContaining({ name: 'index', content: '# Imported Wiki' }),
      );
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:custom`,
        expect.objectContaining({ name: 'custom', content: '# Custom Page' }),
      );

      // Should update meta
      expect(mockSet).toHaveBeenCalledWith(
        `wiki:${PROJECT_ID}:__meta__`,
        expect.objectContaining({ pageIndex: ['index', 'custom'] }),
      );
    });
  });

  // ─── Delete All (project cleanup) ──────────────────────────────────

  describe('deleteAll', () => {
    it('removes all wiki keys for the project', async () => {
      mockKeys.mockResolvedValue([
        `wiki:${PROJECT_ID}:__meta__`,
        `wiki:${PROJECT_ID}:index`,
        `wiki:${PROJECT_ID}:creative-brief`,
        'wiki:other-project:index',
        'audio:proj-123:clip-1',
      ]);
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'creative-brief'],
            createdAt: 1000,
            updatedAt: 2000,
          });
        }
        return Promise.resolve(undefined);
      });

      await wiki.initialize();
      await wiki.deleteAll();

      expect(mockDel).toHaveBeenCalledWith(`wiki:${PROJECT_ID}:__meta__`);
      expect(mockDel).toHaveBeenCalledWith(`wiki:${PROJECT_ID}:index`);
      expect(mockDel).toHaveBeenCalledWith(`wiki:${PROJECT_ID}:creative-brief`);
      // Should NOT delete keys for other projects or non-wiki keys
      expect(mockDel).not.toHaveBeenCalledWith('wiki:other-project:index');
      expect(mockDel).not.toHaveBeenCalledWith('audio:proj-123:clip-1');
    });
  });

  // ─── Summarize ─────────────────────────────────────────────────────

  describe('summarize', () => {
    it('returns a concise summary of wiki content', async () => {
      const pages: Record<string, WikiPage> = {
        index: { name: 'index', content: '# Project Wiki\n\n## Pages\n- Brief\n- Log', createdAt: 1000, updatedAt: 2000 },
        'creative-brief': { name: 'creative-brief', content: '# Creative Brief\n\n## Genre & Direction\nJazz fusion with electronic elements', createdAt: 1000, updatedAt: 1500 },
        'generation-log': { name: 'generation-log', content: '# Generation Log\n\n## clip-1 (drums) — 2024-01-01\nPrompt: Acoustic drums\nResult: success', createdAt: 1000, updatedAt: 3000 },
      };
      mockGet.mockImplementation((key: string) => {
        if (key === `wiki:${PROJECT_ID}:__meta__`) {
          return Promise.resolve({
            projectId: PROJECT_ID,
            pageIndex: ['index', 'creative-brief', 'generation-log'],
            createdAt: 1000,
            updatedAt: 3000,
          });
        }
        const pageName = key.replace(`wiki:${PROJECT_ID}:`, '');
        return Promise.resolve(pages[pageName] ?? undefined);
      });

      await wiki.initialize();
      const summary = await wiki.summarize();

      expect(summary).toContain('3 pages');
      expect(summary).toContain('creative-brief');
      expect(summary).toContain('generation-log');
    });

    it('returns minimal summary for empty wiki', async () => {
      await wiki.initialize();
      const summary = await wiki.summarize();
      expect(summary).toContain(`${DEFAULT_PAGE_INDEX.length} pages`);
    });
  });

  // ─── Singleton ─────────────────────────────────────────────────────

  describe('getProjectWiki', () => {
    it('returns same instance for same projectId', async () => {
      const a = getProjectWiki(PROJECT_ID);
      const b = getProjectWiki(PROJECT_ID);
      expect(a).toBe(b);
    });

    it('returns different instance for different projectId', async () => {
      const a = getProjectWiki('proj-1');
      const b = getProjectWiki('proj-2');
      expect(a).not.toBe(b);
    });
  });
});

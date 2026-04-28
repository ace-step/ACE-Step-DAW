import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import { DevWiki, resetDevWiki, type DevWikiPage } from '../devWiki';

function makePage(overrides: Partial<DevWikiPage> = {}): DevWikiPage {
  return {
    path: 'competitors/ableton.md',
    title: 'Ableton Live',
    content: 'Ableton Live 12 is a professional DAW',
    lastUpdated: Date.now(),
    sources: ['https://ableton.com'],
    tags: ['daw', 'competitor'],
    ...overrides,
  };
}

describe('DevWiki', () => {
  let wiki: DevWiki;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset().mockResolvedValue(undefined);
    mockKeys.mockReset().mockResolvedValue([]);
    resetDevWiki();
    wiki = new DevWiki();
  });

  describe('readPage', () => {
    it('returns page when found', async () => {
      const page = makePage();
      mockGet.mockResolvedValueOnce(page);
      const result = await wiki.readPage('competitors/ableton.md');
      expect(result).toEqual(page);
    });

    it('returns null when not found', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      expect(await wiki.readPage('nonexistent')).toBeNull();
    });
  });

  describe('writePage', () => {
    it('stores page with updated timestamp', async () => {
      const page = makePage({ lastUpdated: 1000 });
      await wiki.writePage(page);
      expect(mockSet).toHaveBeenCalled();
      const storedPage = mockSet.mock.calls[0][1] as DevWikiPage;
      expect(storedPage.lastUpdated).toBeGreaterThan(1000);
      // Should not mutate input
      expect(page.lastUpdated).toBe(1000);
    });
  });

  describe('appendToPage', () => {
    it('appends to existing page', async () => {
      mockGet.mockResolvedValueOnce(makePage({ content: 'Original' }));
      await wiki.appendToPage('competitors/ableton.md', 'New info', 'https://new.com');
      const storedPage = mockSet.mock.calls[0][1] as DevWikiPage;
      expect(storedPage.content).toContain('Original');
      expect(storedPage.content).toContain('New info');
      expect(storedPage.sources).toContain('https://new.com');
    });

    it('creates new page when not found', async () => {
      mockGet.mockResolvedValueOnce(null);
      await wiki.appendToPage('new/page.md', 'Content', 'src');
      expect(mockSet).toHaveBeenCalled();
      const storedPage = mockSet.mock.calls[0][1] as DevWikiPage;
      expect(storedPage.content).toBe('Content');
      expect(storedPage.path).toBe('new/page.md');
    });
  });

  describe('listPages', () => {
    it('returns all wiki pages', async () => {
      const p1 = makePage({ path: 'p1' });
      const p2 = makePage({ path: 'p2' });
      mockKeys.mockResolvedValueOnce(['wiki:dev:p1', 'wiki:dev:p2', 'other:key']);
      mockGet.mockResolvedValueOnce(p1);
      mockGet.mockResolvedValueOnce(p2);
      const pages = await wiki.listPages();
      expect(pages).toHaveLength(2);
    });
  });

  describe('search', () => {
    it('finds pages by title', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:p1']);
      mockGet.mockResolvedValueOnce(makePage({ title: 'Ableton Live', content: 'details' }));
      const results = await wiki.search('ableton');
      expect(results).toHaveLength(1);
    });

    it('finds pages by content', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:p1']);
      mockGet.mockResolvedValueOnce(makePage({ title: 'DAW', content: 'session view details' }));
      const results = await wiki.search('session');
      expect(results).toHaveLength(1);
    });

    it('finds pages by tag', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:p1']);
      mockGet.mockResolvedValueOnce(makePage({ tags: ['competitor'] }));
      const results = await wiki.search('competitor');
      expect(results).toHaveLength(1);
    });
  });

  describe('lint', () => {
    it('flags stale pages', async () => {
      const sixMonthsAgo = Date.now() - 7 * 30 * 24 * 60 * 60 * 1000;
      mockKeys.mockResolvedValueOnce(['wiki:dev:old']);
      mockGet.mockResolvedValueOnce(makePage({ lastUpdated: sixMonthsAgo }));
      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'stale-page')).toBe(true);
    });

    it('flags empty pages', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:empty']);
      mockGet.mockResolvedValueOnce(makePage({ content: '' }));
      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'empty-page')).toBe(true);
    });

    it('flags competitor pages without sources', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:competitors/test.md']);
      mockGet.mockResolvedValueOnce(makePage({ path: 'competitors/test.md', sources: [] }));
      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'missing-sources')).toBe(true);
    });

    it('returns empty for healthy pages', async () => {
      mockKeys.mockResolvedValueOnce(['wiki:dev:ok']);
      mockGet.mockResolvedValueOnce(makePage({ path: 'architecture/design.md' }));
      const results = await wiki.lint();
      expect(results).toHaveLength(0);
    });
  });
});

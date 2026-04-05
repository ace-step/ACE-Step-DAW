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

import { DevWiki, resetDevWiki, type DevWikiPage } from '../devWiki';

function makePage(overrides: Partial<DevWikiPage> = {}): DevWikiPage {
  return {
    path: 'competitors/ableton.md',
    title: 'Ableton Live',
    content: '# Ableton Live\n\nMixer uses channel strips.',
    lastUpdated: Date.now(),
    sources: ['https://ableton.com/docs'],
    tags: ['competitor', 'mixer'],
    ...overrides,
  };
}

describe('DevWiki', () => {
  let wiki: DevWiki;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockReset();
    mockKeys.mockResolvedValue([]);
    resetDevWiki();
    wiki = new DevWiki();
  });

  // ─── Read/Write ─────────────────────────────────────────────────────────

  describe('read/write', () => {
    it('writes a page to IndexedDB', async () => {
      const page = makePage();
      await wiki.writePage(page);

      expect(mockSet).toHaveBeenCalledWith(
        'wiki:dev:competitors/ableton.md',
        expect.objectContaining({ path: 'competitors/ableton.md' })
      );
    });

    it('reads a page from IndexedDB', async () => {
      const page = makePage();
      mockGet.mockResolvedValue(page);

      const result = await wiki.readPage('competitors/ableton.md');

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Ableton Live');
    });

    it('returns null for nonexistent page', async () => {
      mockGet.mockResolvedValue(undefined);
      const result = await wiki.readPage('nonexistent.md');
      expect(result).toBeNull();
    });
  });

  // ─── Append ─────────────────────────────────────────────────────────────

  describe('append', () => {
    it('appends to existing page', async () => {
      const page = makePage({ content: 'Line 1' });
      mockGet.mockResolvedValue(page);

      await wiki.appendToPage('competitors/ableton.md', 'Line 2', 'new-source');

      const saved = mockSet.mock.calls[0][1] as DevWikiPage;
      expect(saved.content).toContain('Line 1');
      expect(saved.content).toContain('Line 2');
      expect(saved.sources).toContain('new-source');
    });

    it('creates new page if not exists', async () => {
      mockGet.mockResolvedValue(undefined);

      await wiki.appendToPage('new-page.md', 'New content');

      expect(mockSet).toHaveBeenCalledWith(
        'wiki:dev:new-page.md',
        expect.objectContaining({ content: 'New content' })
      );
    });
  });

  // ─── List/Search ────────────────────────────────────────────────────────

  describe('list and search', () => {
    it('lists all pages', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:page1.md', 'wiki:dev:page2.md', 'other:key']);
      mockGet
        .mockResolvedValueOnce(makePage({ path: 'page1.md', title: 'Page 1' }))
        .mockResolvedValueOnce(makePage({ path: 'page2.md', title: 'Page 2' }));

      const pages = await wiki.listPages();
      expect(pages).toHaveLength(2);
    });

    it('searches by keyword in title', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:p1', 'wiki:dev:p2']);
      mockGet
        .mockResolvedValueOnce(makePage({ path: 'p1', title: 'Ableton Live', content: 'DAW', tags: [] }))
        .mockResolvedValueOnce(makePage({ path: 'p2', title: 'FL Studio', content: 'DAW', tags: [] }));

      const results = await wiki.search('ableton');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Ableton Live');
    });

    it('searches by keyword in content', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:p1']);
      mockGet.mockResolvedValueOnce(makePage({ content: 'Uses channel strip mixer' }));

      const results = await wiki.search('channel strip');
      expect(results).toHaveLength(1);
    });

    it('searches by tag', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:p1']);
      mockGet.mockResolvedValueOnce(makePage({ tags: ['competitor', 'mixer'] }));

      const results = await wiki.search('mixer');
      expect(results).toHaveLength(1);
    });
  });

  // ─── Lint ───────────────────────────────────────────────────────────────

  describe('lint', () => {
    it('flags stale pages', async () => {
      const oldDate = Date.now() - 7 * 30 * 24 * 60 * 60 * 1000; // 7 months ago
      mockKeys.mockResolvedValue(['wiki:dev:old-page.md']);
      mockGet.mockResolvedValueOnce(makePage({ lastUpdated: oldDate }));

      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'stale-page')).toBe(true);
    });

    it('flags empty pages', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:empty.md']);
      mockGet.mockResolvedValueOnce(makePage({ content: '' }));

      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'empty-page')).toBe(true);
    });

    it('flags competitor pages without sources', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:competitors/test.md']);
      mockGet.mockResolvedValueOnce(makePage({ path: 'competitors/test.md', sources: [] }));

      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'missing-sources')).toBe(true);
    });

    it('flags unresolved conflicts', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:page.md']);
      mockGet.mockResolvedValueOnce(makePage({ content: '⚠️ CONFLICT: contradictory info' }));

      const results = await wiki.lint();
      expect(results.some(r => r.rule === 'unresolved-conflict')).toBe(true);
    });

    it('returns empty for healthy wiki', async () => {
      mockKeys.mockResolvedValue(['wiki:dev:page.md']);
      mockGet.mockResolvedValueOnce(makePage());

      const results = await wiki.lint();
      expect(results).toHaveLength(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { ProjectWikiService } from '../projectWiki';
import type { GenerationLogEntry, ProjectWikiSerialized } from '../../types/projectWiki';

describe('ProjectWikiService', () => {
  let wiki: ProjectWikiService;
  const PROJECT_ID = 'proj-test-1';

  beforeEach(async () => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    wiki = new ProjectWikiService(PROJECT_ID);
    await wiki.initialize();
  });

  // ─── CRUD ────────────────────────────────────────────────────────────

  describe('CRUD operations', () => {
    it('creates a new page', async () => {
      await wiki.setPage('creative-brief.md', 'Genre: lo-fi hip hop');
      const page = wiki.getPage('creative-brief.md');
      expect(page).toBeTruthy();
      expect(page!.content).toBe('Genre: lo-fi hip hop');
      expect(page!.pageName).toBe('creative-brief.md');
    });

    it('reads a page', async () => {
      await wiki.setPage('notes.md', 'some notes');
      expect(wiki.getPage('notes.md')?.content).toBe('some notes');
    });

    it('updates an existing page', async () => {
      await wiki.setPage('mix-decisions.md', 'v1');
      await wiki.setPage('mix-decisions.md', 'v2');
      expect(wiki.getPage('mix-decisions.md')?.content).toBe('v2');
    });

    it('deletes a page', async () => {
      await wiki.setPage('temp.md', 'temp content');
      await wiki.deletePage('temp.md');
      expect(wiki.getPage('temp.md')).toBeUndefined();
    });

    it('lists all pages', async () => {
      await wiki.setPage('a.md', 'a');
      await wiki.setPage('b.md', 'b');
      const pages = wiki.listPages();
      expect(pages).toHaveLength(2);
      expect(pages.map(p => p.pageName).sort()).toEqual(['a.md', 'b.md']);
    });

    it('returns undefined for non-existent page', () => {
      expect(wiki.getPage('nonexistent.md')).toBeUndefined();
    });
  });

  // ─── Append ──────────────────────────────────────────────────────────

  describe('append', () => {
    it('appends to existing page', async () => {
      await wiki.setPage('log.md', 'line 1');
      await wiki.appendToPage('log.md', '\nline 2');
      expect(wiki.getPage('log.md')?.content).toBe('line 1\nline 2');
    });

    it('creates page if not exists on append', async () => {
      await wiki.appendToPage('new.md', 'first line');
      expect(wiki.getPage('new.md')?.content).toBe('first line');
    });
  });

  // ─── Generation Log ─────────────────────────────────────────────────

  describe('generation log', () => {
    it('appends generation log entry', async () => {
      const entry: GenerationLogEntry = {
        timestamp: 1000,
        clipId: 'clip-1',
        trackId: 'track-1',
        prompt: 'chill beat',
        params: { cfgStrength: 5, steps: 60 },
        result: 'kept',
        rating: 4,
      };
      await wiki.logGeneration(entry);

      const page = wiki.getPage('generation-log.md');
      expect(page).toBeTruthy();
      expect(page!.content).toContain('chill beat');
      expect(page!.content).toContain('kept');
      expect(page!.content).toContain('4/5');
    });

    it('accumulates multiple log entries', async () => {
      await wiki.logGeneration({
        timestamp: 1000, clipId: 'c1', trackId: 't1',
        prompt: 'first', params: {}, result: 'kept',
      });
      await wiki.logGeneration({
        timestamp: 2000, clipId: 'c2', trackId: 't2',
        prompt: 'second', params: {}, result: 'regenerated',
      });

      const page = wiki.getPage('generation-log.md');
      expect(page!.content).toContain('first');
      expect(page!.content).toContain('second');
    });
  });

  // ─── Summary ────────────────────────────────────────────────────────

  describe('summary', () => {
    it('generates a wiki summary', async () => {
      await wiki.setPage('creative-brief.md', 'Genre: jazz fusion');
      await wiki.logGeneration({
        timestamp: 1000, clipId: 'c1', trackId: 't1',
        prompt: 'jazz piano', params: {}, result: 'kept', rating: 5,
      });

      const summary = wiki.getSummary();
      expect(summary.projectId).toBe(PROJECT_ID);
      expect(summary.pageCount).toBe(2);
      expect(summary.generationCount).toBe(1);
    });
  });

  // ─── Persistence ────────────────────────────────────────────────────

  describe('persistence', () => {
    it('persists on page set', async () => {
      await wiki.setPage('test.md', 'data');
      expect(mockSet).toHaveBeenCalled();
      const key = mockSet.mock.calls[0][0] as string;
      expect(key).toBe(`wiki:${PROJECT_ID}`);
    });

    it('restores from IndexedDB on initialize', async () => {
      const stored: ProjectWikiSerialized = {
        projectId: PROJECT_ID,
        pages: [['saved.md', {
          pageName: 'saved.md',
          content: 'saved content',
          updatedAt: 1000,
          createdAt: 1000,
        }]],
        createdAt: 500,
        updatedAt: 1000,
      };
      mockGet.mockResolvedValueOnce(stored);

      const fresh = new ProjectWikiService(PROJECT_ID);
      await fresh.initialize();
      expect(fresh.getPage('saved.md')?.content).toBe('saved content');
    });
  });

  // ─── Serialization ─────────────────────────────────────────────────

  describe('serialization', () => {
    it('serializes for .acedaw export', async () => {
      await wiki.setPage('brief.md', 'test brief');
      const serialized = wiki.serialize();
      expect(serialized.projectId).toBe(PROJECT_ID);
      expect(serialized.pages).toHaveLength(1);
      expect(serialized.pages[0][0]).toBe('brief.md');
    });

    it('deserializes from .acedaw import', async () => {
      const data: ProjectWikiSerialized = {
        projectId: 'other-proj',
        pages: [['imported.md', {
          pageName: 'imported.md',
          content: 'imported content',
          updatedAt: 2000,
          createdAt: 2000,
        }]],
        createdAt: 1000,
        updatedAt: 2000,
      };

      const imported = new ProjectWikiService(PROJECT_ID);
      imported.deserialize(data);
      expect(imported.getPage('imported.md')?.content).toBe('imported content');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: vi.fn(),
  keys: vi.fn(() => Promise.resolve([])),
}));

import { DevWikiService } from '../devWiki';
import type { DevWikiEntry, DevWikiCategory } from '../../types/devWiki';

function makeEntry(overrides: Partial<DevWikiEntry> = {}): Omit<DevWikiEntry, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    category: 'competitor' as DevWikiCategory,
    title: 'Ableton Group Tracks',
    content: 'Ableton Group Track: nestable, shows sub-clip overview when folded',
    source: 'Ableton Live 12 manual',
    tags: ['ableton', 'tracks', 'grouping'],
    ...overrides,
  };
}

describe('DevWikiService', () => {
  let wiki: DevWikiService;

  beforeEach(async () => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    wiki = new DevWikiService();
    await wiki.initialize();
  });

  // ─── CRUD ────────────────────────────────────────────────────────────

  describe('CRUD', () => {
    it('adds an entry', async () => {
      const id = await wiki.addEntry(makeEntry());
      expect(id).toBeTruthy();
      expect(wiki.getAllEntries()).toHaveLength(1);
    });

    it('reads an entry by id', async () => {
      const id = await wiki.addEntry(makeEntry());
      const entry = wiki.getEntry(id);
      expect(entry).toBeTruthy();
      expect(entry!.title).toBe('Ableton Group Tracks');
    });

    it('updates an entry', async () => {
      const id = await wiki.addEntry(makeEntry());
      await wiki.updateEntry(id, { content: 'Updated content' });
      expect(wiki.getEntry(id)!.content).toBe('Updated content');
    });

    it('deletes an entry', async () => {
      const id = await wiki.addEntry(makeEntry());
      await wiki.deleteEntry(id);
      expect(wiki.getEntry(id)).toBeUndefined();
    });

    it('lists all entries', async () => {
      await wiki.addEntry(makeEntry({ title: 'A' }));
      await wiki.addEntry(makeEntry({ title: 'B' }));
      expect(wiki.getAllEntries()).toHaveLength(2);
    });
  });

  // ─── Query ──────────────────────────────────────────────────────────

  describe('query', () => {
    beforeEach(async () => {
      await wiki.addEntry(makeEntry({
        category: 'competitor',
        title: 'Ableton Group Tracks',
        tags: ['ableton', 'tracks'],
      }));
      await wiki.addEntry(makeEntry({
        category: 'competitor',
        title: 'FL Studio Mixer Routing',
        content: 'FL Studio uses flexible mixer routing',
        tags: ['fl-studio', 'mixer'],
      }));
      await wiki.addEntry(makeEntry({
        category: 'architecture',
        title: 'Audio Engine Design',
        content: 'AudioWorklet-based DSP pipeline',
        tags: ['audio', 'engine'],
      }));
    });

    it('queries by category', () => {
      const results = wiki.query({ category: 'competitor' });
      expect(results).toHaveLength(2);
    });

    it('queries by tags', () => {
      const results = wiki.query({ tags: ['mixer'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('FL Studio Mixer Routing');
    });

    it('queries by search text', () => {
      const results = wiki.query({ search: 'AudioWorklet' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Audio Engine Design');
    });

    it('combines filters', () => {
      const results = wiki.query({ category: 'competitor', search: 'FL Studio' });
      expect(results).toHaveLength(1);
    });

    it('returns all for empty query', () => {
      expect(wiki.query({})).toHaveLength(3);
    });
  });

  // ─── Log ────────────────────────────────────────────────────────────

  describe('log', () => {
    it('appends to chronological log', async () => {
      await wiki.addEntry(makeEntry({ title: 'First' }));
      await wiki.addEntry(makeEntry({ title: 'Second' }));
      const log = wiki.getLog();
      expect(log).toHaveLength(2);
      expect(log[0].title).toBe('First');
    });
  });

  // ─── Persistence ────────────────────────────────────────────────────

  describe('persistence', () => {
    it('persists on add', async () => {
      await wiki.addEntry(makeEntry());
      expect(mockSet).toHaveBeenCalled();
      const key = mockSet.mock.calls[0][0] as string;
      expect(key).toBe('wiki:dev');
    });

    it('restores from IndexedDB', async () => {
      mockGet.mockResolvedValueOnce({
        entries: [{
          id: 'existing-1',
          category: 'competitor',
          title: 'Stored entry',
          content: 'content',
          tags: ['test'],
          createdAt: 1000,
          updatedAt: 1000,
        }],
        lastUpdated: 1000,
        version: 1,
      });

      const fresh = new DevWikiService();
      await fresh.initialize();
      expect(fresh.getAllEntries()).toHaveLength(1);
      expect(fresh.getAllEntries()[0].title).toBe('Stored entry');
    });
  });

  // ─── Tags ───────────────────────────────────────────────────────────

  describe('tags', () => {
    it('lists all unique tags', async () => {
      await wiki.addEntry(makeEntry({ tags: ['ableton', 'mixer'] }));
      await wiki.addEntry(makeEntry({ tags: ['fl-studio', 'mixer'] }));

      const tags = wiki.getAllTags();
      expect(tags).toContain('ableton');
      expect(tags).toContain('fl-studio');
      expect(tags).toContain('mixer');
      expect(tags).toHaveLength(3);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  SavedPrompt,
  PromptLibraryFilter,
  PromptLibrarySortKey,
  PromptLibraryExport,
} from '../../types/promptLibrary';
import {
  createPromptLibrarySlice,
  type PromptLibrarySlice,
} from '../slices/promptLibrarySlice';

function makeSlice(): PromptLibrarySlice {
  return createPromptLibrarySlice();
}

function makeSavedPrompt(overrides: Partial<SavedPrompt> = {}): SavedPrompt {
  return {
    id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: 'A funky bass groove with slap technique',
    title: 'Funky Bass',
    tags: ['funk', 'bass'],
    category: 'bass',
    isFavorite: false,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0,
    metadata: { bpm: 120, keyScale: 'C minor', genre: 'funk' },
    ...overrides,
  };
}

describe('promptLibrarySlice', () => {
  let slice: PromptLibrarySlice;

  beforeEach(() => {
    slice = makeSlice();
  });

  describe('savePrompt', () => {
    it('adds a new prompt to the library', () => {
      const result = slice.savePrompt({
        prompt: 'Dreamy ambient pad with reverb',
        title: 'Ambient Pad',
        tags: ['ambient', 'pad'],
        category: 'synth',
        metadata: { bpm: 80, keyScale: 'D major' },
      });

      expect(result.id).toBeTruthy();
      expect(result.prompt).toBe('Dreamy ambient pad with reverb');
      expect(result.title).toBe('Ambient Pad');
      expect(result.tags).toEqual(['ambient', 'pad']);
      expect(result.category).toBe('synth');
      expect(result.isFavorite).toBe(false);
      expect(result.useCount).toBe(0);
      expect(result.metadata.bpm).toBe(80);
      expect(slice.getAll()).toHaveLength(1);
    });

    it('auto-generates title from prompt when title is empty', () => {
      const result = slice.savePrompt({
        prompt: 'Heavy distorted electric guitar riff in E minor with palm muting extra words to truncate',
        title: '',
        tags: [],
        category: '',
        metadata: {},
      });

      expect(result.title.length).toBeGreaterThan(0);
      expect(result.title.length).toBeLessThanOrEqual(50);
    });

    it('deduplicates tags and lowercases them', () => {
      const result = slice.savePrompt({
        prompt: 'test',
        title: 'test',
        tags: ['Rock', 'rock', 'GUITAR', 'guitar'],
        category: '',
        metadata: {},
      });

      expect(result.tags).toEqual(['rock', 'guitar']);
    });

    it('trims prompt text before saving', () => {
      const result = slice.savePrompt({
        prompt: '  airy synth pad  ',
        title: '',
        tags: [],
        category: '',
        metadata: {},
      });

      expect(result.prompt).toBe('airy synth pad');
      expect(result.title).toBe('airy synth pad');
    });
  });

  describe('updatePrompt', () => {
    it('updates an existing prompt', () => {
      const saved = slice.savePrompt({
        prompt: 'original',
        title: 'Original',
        tags: ['test'],
        category: '',
        metadata: {},
      });

      const updated = slice.updatePrompt(saved.id, {
        title: 'Updated Title',
        tags: ['updated'],
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated Title');
      expect(updated!.tags).toEqual(['updated']);
      expect(updated!.prompt).toBe('original');
    });

    it('trims updated prompt text', () => {
      const saved = slice.savePrompt({
        prompt: 'original',
        title: 'Original',
        tags: [],
        category: '',
        metadata: {},
      });

      const updated = slice.updatePrompt(saved.id, {
        prompt: '  updated prompt  ',
        title: '',
      });

      expect(updated!.prompt).toBe('updated prompt');
      expect(updated!.title).toBe('updated prompt');
    });

    it('returns null for non-existent prompt', () => {
      const result = slice.updatePrompt('non-existent', { title: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('deletePrompt', () => {
    it('removes a prompt from the library', () => {
      const saved = slice.savePrompt({
        prompt: 'to delete',
        title: 'Delete Me',
        tags: [],
        category: '',
        metadata: {},
      });

      expect(slice.getAll()).toHaveLength(1);
      const deleted = slice.deletePrompt(saved.id);
      expect(deleted).toBe(true);
      expect(slice.getAll()).toHaveLength(0);
    });

    it('returns false for non-existent prompt', () => {
      expect(slice.deletePrompt('non-existent')).toBe(false);
    });
  });

  describe('toggleFavorite', () => {
    it('toggles the favorite state', () => {
      const saved = slice.savePrompt({
        prompt: 'fav test',
        title: 'Fav',
        tags: [],
        category: '',
        metadata: {},
      });

      expect(saved.isFavorite).toBe(false);

      const toggled = slice.toggleFavorite(saved.id);
      expect(toggled).not.toBeNull();
      expect(toggled!.isFavorite).toBe(true);

      const toggledBack = slice.toggleFavorite(saved.id);
      expect(toggledBack!.isFavorite).toBe(false);
    });
  });

  describe('recordUse', () => {
    it('increments useCount and updates lastUsedAt', () => {
      const saved = slice.savePrompt({
        prompt: 'use test',
        title: 'Use Test',
        tags: [],
        category: '',
        metadata: {},
      });

      const before = saved.lastUsedAt;
      const used = slice.recordUse(saved.id);
      expect(used).not.toBeNull();
      expect(used!.useCount).toBe(1);
      expect(used!.lastUsedAt).toBeGreaterThanOrEqual(before);

      const usedAgain = slice.recordUse(saved.id);
      expect(usedAgain!.useCount).toBe(2);
    });
  });

  describe('search and filter', () => {
    beforeEach(() => {
      slice.savePrompt({
        prompt: 'Funky bass groove',
        title: 'Funk Bass',
        tags: ['funk', 'bass'],
        category: 'bass',
        metadata: { genre: 'funk', bpm: 120 },
      });
      slice.savePrompt({
        prompt: 'Ambient pad with reverb',
        title: 'Ambient Pad',
        tags: ['ambient', 'synth'],
        category: 'synth',
        metadata: { genre: 'ambient', bpm: 80 },
      });
      slice.savePrompt({
        prompt: 'Rock guitar riff',
        title: 'Rock Riff',
        tags: ['rock', 'guitar'],
        category: 'guitar',
        metadata: { genre: 'rock', bpm: 140 },
      });
    });

    it('searches by text in prompt and title', () => {
      const results = slice.search({ search: 'bass' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Funk Bass');
    });

    it('search is case-insensitive', () => {
      const results = slice.search({ search: 'AMBIENT' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Ambient Pad');
    });

    it('filters by tags', () => {
      const results = slice.search({ tags: ['rock'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Rock Riff');
    });

    it('filters by category', () => {
      const results = slice.search({ category: 'synth' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Ambient Pad');
    });

    it('filters by favorites only', () => {
      const all = slice.getAll();
      slice.toggleFavorite(all[0].id);

      const results = slice.search({ favoritesOnly: true });
      expect(results).toHaveLength(1);
    });

    it('combines multiple filters', () => {
      const results = slice.search({ search: 'groove', tags: ['funk'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Funk Bass');
    });

    it('returns all when no filters', () => {
      const results = slice.search({});
      expect(results).toHaveLength(3);
    });
  });

  describe('sort', () => {
    it('sorts by dateCreated (newest first)', () => {
      slice.savePrompt({ prompt: 'a', title: 'A', tags: [], category: '', metadata: {} });
      slice.savePrompt({ prompt: 'b', title: 'B', tags: [], category: '', metadata: {} });

      const results = slice.getSorted('dateCreated');
      // Both created nearly simultaneously; verify they're both present and newest-first order
      expect(results).toHaveLength(2);
      expect(results[0].createdAt).toBeGreaterThanOrEqual(results[1].createdAt);
    });

    it('sorts by alphabetical', () => {
      slice.savePrompt({ prompt: 'z', title: 'Zebra', tags: [], category: '', metadata: {} });
      slice.savePrompt({ prompt: 'a', title: 'Apple', tags: [], category: '', metadata: {} });

      const results = slice.getSorted('alphabetical');
      expect(results[0].title).toBe('Apple');
      expect(results[1].title).toBe('Zebra');
    });

    it('sorts by most used', () => {
      const a = slice.savePrompt({ prompt: 'a', title: 'A', tags: [], category: '', metadata: {} });
      const b = slice.savePrompt({ prompt: 'b', title: 'B', tags: [], category: '', metadata: {} });

      slice.recordUse(a.id);
      slice.recordUse(a.id);
      slice.recordUse(b.id);

      const results = slice.getSorted('mostUsed');
      expect(results[0].title).toBe('A');
      expect(results[1].title).toBe('B');
    });

    it('sorts by recent (lastUsedAt, newest first)', () => {
      const a = slice.savePrompt({ prompt: 'a', title: 'A', tags: [], category: '', metadata: {} });
      const b = slice.savePrompt({ prompt: 'b', title: 'B', tags: [], category: '', metadata: {} });

      slice.recordUse(a.id);

      const results = slice.getSorted('recent');
      expect(results[0].title).toBe('A');
    });
  });

  describe('getAllTags', () => {
    it('returns all unique tags across prompts', () => {
      slice.savePrompt({ prompt: 'a', title: 'A', tags: ['rock', 'guitar'], category: '', metadata: {} });
      slice.savePrompt({ prompt: 'b', title: 'B', tags: ['rock', 'bass'], category: '', metadata: {} });

      const tags = slice.getAllTags();
      expect(tags.sort()).toEqual(['bass', 'guitar', 'rock']);
    });
  });

  describe('getAllCategories', () => {
    it('returns all unique non-empty categories', () => {
      slice.savePrompt({ prompt: 'a', title: 'A', tags: [], category: 'bass', metadata: {} });
      slice.savePrompt({ prompt: 'b', title: 'B', tags: [], category: 'synth', metadata: {} });
      slice.savePrompt({ prompt: 'c', title: 'C', tags: [], category: '', metadata: {} });

      const cats = slice.getAllCategories();
      expect(cats.sort()).toEqual(['bass', 'synth']);
    });
  });

  describe('export/import', () => {
    it('exports all prompts as JSON-serializable object', () => {
      slice.savePrompt({ prompt: 'a', title: 'A', tags: ['rock'], category: 'guitar', metadata: { bpm: 120 } });
      slice.savePrompt({ prompt: 'b', title: 'B', tags: ['jazz'], category: 'bass', metadata: { bpm: 90 } });

      const exported = slice.exportLibrary();
      expect(exported.version).toBe(1);
      expect(exported.prompts).toHaveLength(2);
      expect(exported.exportedAt).toBeGreaterThan(0);
    });

    it('imports prompts from exported data', () => {
      const exportData: PromptLibraryExport = {
        version: 1,
        exportedAt: Date.now(),
        prompts: [
          makeSavedPrompt({ id: 'imp-1', prompt: 'imported prompt 1', title: 'Import 1' }),
          makeSavedPrompt({ id: 'imp-2', prompt: 'imported prompt 2', title: 'Import 2' }),
        ],
      };

      const count = slice.importLibrary(exportData);
      expect(count).toBe(2);
      expect(slice.getAll()).toHaveLength(2);
    });

    it('import skips duplicates by prompt text', () => {
      slice.savePrompt({ prompt: 'existing prompt', title: 'Existing', tags: [], category: '', metadata: {} });

      const exportData: PromptLibraryExport = {
        version: 1,
        exportedAt: Date.now(),
        prompts: [
          makeSavedPrompt({ prompt: 'existing prompt', title: 'Duplicate' }),
          makeSavedPrompt({ prompt: 'new prompt', title: 'New' }),
        ],
      };

      const count = slice.importLibrary(exportData);
      expect(count).toBe(1);
      expect(slice.getAll()).toHaveLength(2);
    });

    it('normalizes imported prompts and skips duplicate payload entries', () => {
      const exportData: PromptLibraryExport = {
        version: 1,
        exportedAt: Date.now(),
        prompts: [
          makeSavedPrompt({
            prompt: '  Imported Prompt  ',
            title: '  Imported  ',
            tags: ['Rock', 'rock', 'GUITAR '],
            category: '  hooks  ',
          }),
          makeSavedPrompt({ prompt: 'imported prompt', title: 'Duplicate casing' }),
        ],
      };

      const count = slice.importLibrary(exportData);
      const imported = slice.getAll()[0];
      expect(count).toBe(1);
      expect(imported.prompt).toBe('Imported Prompt');
      expect(imported.title).toBe('Imported');
      expect(imported.tags).toEqual(['rock', 'guitar']);
      expect(imported.category).toBe('hooks');
    });

    it('adds empty metadata for imported prompts that omit metadata', () => {
      const exportData: PromptLibraryExport = {
        version: 1,
        exportedAt: Date.now(),
        prompts: [
          {
            ...makeSavedPrompt({ prompt: 'metadata-free import', title: 'No Metadata' }),
            metadata: undefined,
          } as unknown as SavedPrompt,
        ],
      };

      const count = slice.importLibrary(exportData);
      expect(count).toBe(1);
      expect(slice.getAll()[0].metadata).toEqual({});
    });
  });

  describe('getById', () => {
    it('returns the prompt by id', () => {
      const saved = slice.savePrompt({ prompt: 'test', title: 'Test', tags: [], category: '', metadata: {} });
      const found = slice.getById(saved.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
    });

    it('returns null for non-existent id', () => {
      expect(slice.getById('non-existent')).toBeNull();
    });
  });
});

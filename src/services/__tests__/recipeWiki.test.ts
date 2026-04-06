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

import { RecipeWiki } from '../recipeWiki';
import type { RecipeEntry, GenreRecipe, RecipeWikiExport } from '../../types/recipeWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'lo-fi chill hip-hop, vinyl crackle, mellow piano',
    params: {
      taskType: 'text2music',
      duration: 30,
      cfgStrength: 5,
      steps: 32,
      shift: 1.0,
      modelId: 'ace-step-base',
    },
    result: 'kept',
    inferredMetas: {
      bpm: 85,
      keyScale: 'F major',
      genres: ['Lo-Fi', 'Hip-Hop'],
      seed: 42,
    },
    userRating: 4,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RecipeEntry> = {}): RecipeEntry {
  return {
    id: 'entry-1',
    timestamp: Date.now(),
    genre: 'Lo-Fi',
    prompt: 'lo-fi chill beat',
    taskType: 'text2music',
    params: { cfgStrength: 5, steps: 32, bpm: 85, keyScale: 'F major' },
    outcome: 'kept',
    userRating: 4,
    tags: ['chill', 'lo-fi'],
    ...overrides,
  };
}

describe('RecipeWiki', () => {
  let wiki: RecipeWiki;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    wiki = new RecipeWiki();
  });

  // ─── Ingest ────────────────────────────────────────────────────────────

  describe('ingest', () => {
    it('converts a GenerationEvent into a RecipeEntry and stores it', async () => {
      const event = makeGenEvent();
      const entry = await wiki.ingest(event);

      expect(entry.genre).toBe('lo-fi');
      expect(entry.prompt).toBe(event.prompt);
      expect(entry.taskType).toBe('text2music');
      expect(entry.params.cfgStrength).toBe(5);
      expect(entry.params.bpm).toBe(85);
      expect(entry.params.seed).toBe(42);
      expect(entry.outcome).toBe('kept');
      expect(entry.userRating).toBe(4);
      expect(entry.id).toBeTruthy();
      expect(mockSet).toHaveBeenCalled();
    });

    it('uses first inferred genre or "Unknown"', async () => {
      const event = makeGenEvent({ inferredMetas: undefined });
      const entry = await wiki.ingest(event);
      expect(entry.genre).toBe('unknown');
    });

    it('maps failed generation events', async () => {
      const event = makeGenEvent({
        type: 'generation_failed',
        result: 'regenerated',
        errorMessage: 'timeout',
      });
      const entry = await wiki.ingest(event);
      expect(entry.outcome).toBe('failed');
    });

    it('extracts tags from prompt keywords', async () => {
      const event = makeGenEvent({ prompt: 'chill lo-fi jazz piano' });
      const entry = await wiki.ingest(event);
      expect(entry.tags.length).toBeGreaterThan(0);
    });

    it('updates genre recipe after ingest', async () => {
      mockKeys.mockResolvedValue([]);
      mockGet.mockResolvedValue(undefined);

      await wiki.ingest(makeGenEvent({ inferredMetas: { genres: ['Jazz'] } }));

      // Should persist the entry AND update genre recipe
      expect(mockSet.mock.calls.length).toBeGreaterThanOrEqual(2);
      const genreCall = mockSet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('recipe:genre:')
      );
      expect(genreCall).toBeTruthy();
    });
  });

  // ─── Query ─────────────────────────────────────────────────────────────

  describe('query', () => {
    it('returns parameter suggestions for a genre', async () => {
      const genre: GenreRecipe = {
        genre: 'Lo-Fi',
        totalGenerations: 10,
        successfulGenerations: 8,
        failedGenerations: 2,
        averageRating: 3.8,
        bestPrompts: [
          { prompt: 'lo-fi chill', count: 5, averageRating: 4.2, keptRate: 0.8 },
        ],
        recommendedParams: {
          cfgStrength: 5.5,
          steps: 32,
          shift: 1.0,
          bpm: 85,
          keyScale: 'F major',
        },
        knownFailures: [],
        lastUpdated: Date.now(),
      };
      mockGet.mockResolvedValue(genre);

      const suggestion = await wiki.query('Lo-Fi', 'text2music');

      expect(suggestion).not.toBeNull();
      expect(suggestion!.genre).toBe('Lo-Fi');
      expect(suggestion!.params.cfgStrength).toBe(5.5);
      expect(suggestion!.sampleSize).toBe(10);
      expect(suggestion!.confidence).toBeGreaterThan(0);
    });

    it('returns null for unknown genre', async () => {
      mockGet.mockResolvedValue(undefined);
      const suggestion = await wiki.query('Nonexistent', 'text2music');
      expect(suggestion).toBeNull();
    });

    it('uses taskType-filtered entries when enough data exists', async () => {
      const recipe: GenreRecipe = {
        genre: 'lo-fi',
        totalGenerations: 10,
        successfulGenerations: 8,
        failedGenerations: 2,
        averageRating: 3.5,
        bestPrompts: [],
        recommendedParams: { cfgStrength: 5, steps: 32, bpm: 85 },
        knownFailures: [],
        lastUpdated: Date.now(),
      };
      const entryIds = ['e1', 'e2', 'e3', 'e4'];
      const t2mEntries = [
        makeEntry({ id: 'e1', taskType: 'text2music', params: { cfgStrength: 6, steps: 40, bpm: 90 }, userRating: 5 }),
        makeEntry({ id: 'e2', taskType: 'text2music', params: { cfgStrength: 7, steps: 40, bpm: 95 }, userRating: 4 }),
        makeEntry({ id: 'e3', taskType: 'text2music', params: { cfgStrength: 6.5, steps: 38, bpm: 92 }, userRating: 4 }),
      ];
      const otherEntry = makeEntry({ id: 'e4', taskType: 'extend', params: { cfgStrength: 3 }, userRating: 3 });

      mockGet
        .mockResolvedValueOnce(recipe) // genre recipe
        .mockResolvedValueOnce(entryIds) // genre index
        .mockResolvedValueOnce(t2mEntries[0])
        .mockResolvedValueOnce(t2mEntries[1])
        .mockResolvedValueOnce(t2mEntries[2])
        .mockResolvedValueOnce(otherEntry);

      const suggestion = await wiki.query('Lo-Fi', 'text2music');
      expect(suggestion).not.toBeNull();
      expect(suggestion!.sampleSize).toBe(3);
      expect(suggestion!.reasoning).toContain('text2music');
    });

    it('falls back to genre recipe when insufficient taskType entries', async () => {
      const recipe: GenreRecipe = {
        genre: 'lo-fi',
        totalGenerations: 10,
        successfulGenerations: 8,
        failedGenerations: 2,
        averageRating: 3.5,
        bestPrompts: [],
        recommendedParams: { cfgStrength: 5, steps: 32, bpm: 85 },
        knownFailures: [],
        lastUpdated: Date.now(),
      };
      mockGet
        .mockResolvedValueOnce(recipe)
        .mockResolvedValueOnce(['e1']) // only 1 entry
        .mockResolvedValueOnce(makeEntry({ id: 'e1', taskType: 'text2music' }));

      const suggestion = await wiki.query('Lo-Fi', 'text2music');
      expect(suggestion).not.toBeNull();
      expect(suggestion!.sampleSize).toBe(10); // uses genre-level data
    });

    it('confidence scales with sample size', async () => {
      const small: GenreRecipe = {
        genre: 'Jazz',
        totalGenerations: 3,
        successfulGenerations: 2,
        failedGenerations: 1,
        averageRating: 3.0,
        bestPrompts: [],
        recommendedParams: { cfgStrength: 5 },
        knownFailures: [],
        lastUpdated: Date.now(),
      };
      const large = { ...small, totalGenerations: 50, successfulGenerations: 45 };

      mockGet.mockResolvedValueOnce(small);
      const s1 = await wiki.query('Jazz', 'text2music');

      mockGet.mockResolvedValueOnce(large);
      const s2 = await wiki.query('Jazz', 'text2music');

      expect(s2!.confidence).toBeGreaterThan(s1!.confidence);
    });
  });

  // ─── Genre Recipe Aggregation ──────────────────────────────────────────

  describe('genre recipe aggregation', () => {
    it('builds genre recipe from entries', () => {
      const entries: RecipeEntry[] = [
        makeEntry({ userRating: 5, outcome: 'kept', params: { cfgStrength: 5 } }),
        makeEntry({ userRating: 3, outcome: 'kept', params: { cfgStrength: 6 } }),
        makeEntry({ userRating: undefined, outcome: 'deleted', params: { cfgStrength: 7 } }),
        makeEntry({ outcome: 'failed', params: { cfgStrength: 4 } }),
      ];

      const recipe = wiki.buildGenreRecipe('Lo-Fi', entries);

      expect(recipe.genre).toBe('Lo-Fi');
      expect(recipe.totalGenerations).toBe(4);
      expect(recipe.successfulGenerations).toBe(2); // only 'kept' count as successful
      expect(recipe.failedGenerations).toBe(1);
      expect(recipe.averageRating).toBe(4); // (5+3)/2
    });

    it('recommends params from highest-rated entries', () => {
      const entries: RecipeEntry[] = [
        makeEntry({ userRating: 5, params: { cfgStrength: 5, steps: 32 } }),
        makeEntry({ userRating: 5, params: { cfgStrength: 5.5, steps: 32 } }),
        makeEntry({ userRating: 2, params: { cfgStrength: 8, steps: 64 } }),
      ];

      const recipe = wiki.buildGenreRecipe('Lo-Fi', entries);

      // Should favor params from high-rated entries
      expect(recipe.recommendedParams.cfgStrength).toBeCloseTo(5.25, 1);
    });

    it('tracks best prompts with stats', () => {
      const entries: RecipeEntry[] = [
        makeEntry({ prompt: 'lo-fi chill', outcome: 'kept', userRating: 4 }),
        makeEntry({ prompt: 'lo-fi chill', outcome: 'kept', userRating: 5 }),
        makeEntry({ prompt: 'lo-fi chill', outcome: 'regenerated', userRating: undefined }),
        makeEntry({ prompt: 'jazz piano', outcome: 'kept', userRating: 3 }),
      ];

      const recipe = wiki.buildGenreRecipe('Lo-Fi', entries);

      expect(recipe.bestPrompts.length).toBeGreaterThan(0);
      const lofiPrompt = recipe.bestPrompts.find(p => p.prompt === 'lo-fi chill');
      expect(lofiPrompt).toBeTruthy();
      expect(lofiPrompt!.count).toBe(3);
      expect(lofiPrompt!.averageRating).toBe(4.5);
      expect(lofiPrompt!.keptRate).toBeCloseTo(2 / 3);
    });

    it('tracks known failures', () => {
      const entries: RecipeEntry[] = [
        makeEntry({
          outcome: 'failed',
          prompt: 'bad prompt',
          params: { cfgStrength: 10 },
        }),
        makeEntry({
          outcome: 'failed',
          prompt: 'bad prompt',
          params: { cfgStrength: 10 },
        }),
      ];

      const recipe = wiki.buildGenreRecipe('Lo-Fi', entries);
      expect(recipe.knownFailures.length).toBe(1);
      expect(recipe.knownFailures[0].count).toBe(2);
    });
  });

  // ─── Export / Import ───────────────────────────────────────────────────

  describe('export/import', () => {
    it('exports all entries and genre recipes', async () => {
      const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
      const genre: GenreRecipe = {
        genre: 'Lo-Fi',
        totalGenerations: 2,
        successfulGenerations: 2,
        failedGenerations: 0,
        averageRating: 4,
        bestPrompts: [],
        recommendedParams: {},
        knownFailures: [],
        lastUpdated: Date.now(),
      };

      mockKeys.mockResolvedValue([
        'recipe:entry:e1',
        'recipe:entry:e2',
        'recipe:genre:Lo-Fi',
      ]);
      mockGet
        .mockResolvedValueOnce(entries[0])
        .mockResolvedValueOnce(entries[1])
        .mockResolvedValueOnce(genre);

      const exported = await wiki.exportWiki();

      expect(exported.version).toBe(1);
      expect(exported.entries).toHaveLength(2);
      expect(exported.genres).toHaveLength(1);
      expect(exported.exportedAt).toBeGreaterThan(0);
    });

    it('imports entries and rebuilds genre recipes', async () => {
      const data: RecipeWikiExport = {
        version: 1,
        exportedAt: Date.now(),
        entries: [makeEntry({ id: 'e1', genre: 'Jazz' }), makeEntry({ id: 'e2', genre: 'Jazz' })],
        genres: [],
      };

      await wiki.importWiki(data);

      // Should store each entry
      const entryCalls = mockSet.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:entry:')
      );
      expect(entryCalls.length).toBeGreaterThanOrEqual(2);

      const genreCalls = mockSet.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:genre:')
      );
      expect(genreCalls.length).toBeGreaterThan(0);
    });

    it('rejects invalid import version', async () => {
      const data = { version: 99, exportedAt: 0, entries: [], genres: [] } as unknown as RecipeWikiExport;
      await expect(wiki.importWiki(data)).rejects.toThrow('Unsupported wiki export version');
    });
  });

  // ─── List Genres ───────────────────────────────────────────────────────

  describe('listGenres', () => {
    it('returns all genre recipes', async () => {
      const jazz: GenreRecipe = {
        genre: 'Jazz',
        totalGenerations: 5,
        successfulGenerations: 4,
        failedGenerations: 1,
        averageRating: 3.5,
        bestPrompts: [],
        recommendedParams: {},
        knownFailures: [],
        lastUpdated: Date.now(),
      };
      const lofi: GenreRecipe = {
        genre: 'Lo-Fi',
        totalGenerations: 10,
        successfulGenerations: 8,
        failedGenerations: 2,
        averageRating: 4.0,
        bestPrompts: [],
        recommendedParams: {},
        knownFailures: [],
        lastUpdated: Date.now(),
      };

      mockKeys.mockResolvedValue(['recipe:genre:Jazz', 'recipe:genre:Lo-Fi']);
      mockGet.mockResolvedValueOnce(jazz).mockResolvedValueOnce(lofi);

      const genres = await wiki.listGenres();
      expect(genres).toHaveLength(2);
      expect(genres.map(g => g.genre)).toContain('Jazz');
      expect(genres.map(g => g.genre)).toContain('Lo-Fi');
    });
  });

  // ─── Persistence Keys ─────────────────────────────────────────────────

  describe('persistence', () => {
    it('uses recipe:entry: prefix for entries', async () => {
      await wiki.ingest(makeGenEvent());
      const entryCall = mockSet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:entry:')
      );
      expect(entryCall).toBeTruthy();
    });

    it('uses recipe:genre: prefix for genre recipes', async () => {
      mockKeys.mockResolvedValue([]);
      mockGet.mockResolvedValue(undefined);

      await wiki.ingest(makeGenEvent({ inferredMetas: { genres: ['Rock'] } }));

      const genreCall = mockSet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('recipe:genre:')
      );
      expect(genreCall).toBeTruthy();
    });
  });
});

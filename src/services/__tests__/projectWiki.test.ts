import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
}));

import { ProjectWiki, resetProjectWikiCache } from '../projectWiki';
import type { GenerationEvent } from '../../types/sessionMemory';

function makeGenEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'lo-fi chill beat',
    params: { taskType: 'text2music', cfgStrength: 5, steps: 60, shift: 3 },
    result: 'kept',
    userRating: 4,
    ...overrides,
  };
}

describe('ProjectWiki', () => {
  let wiki: ProjectWiki;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    resetProjectWikiCache();
    wiki = new ProjectWiki('project-1');
  });

  describe('lifecycle', () => {
    it('initializes with empty state', () => {
      const state = wiki.getState();
      expect(state.projectId).toBe('project-1');
      expect(state.creativeBrief.genre).toBe('');
      expect(state.generationLog).toEqual([]);
      expect(state.mixDecisions).toEqual([]);
      expect(state.trackNotes).toEqual([]);
    });

    it('loads existing wiki from IndexedDB', async () => {
      const stored = {
        projectId: 'project-1',
        creativeBrief: { genre: 'Jazz', mood: 'mellow', references: [], audience: '', notes: '' },
        generationLog: [],
        mixDecisions: [],
        trackNotes: [],
        customPages: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockGet.mockResolvedValueOnce(stored);
      await wiki.load();
      expect(wiki.getState().creativeBrief.genre).toBe('Jazz');
    });

    it('creates fresh state when no stored data', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      await wiki.load();
      expect(wiki.getState().projectId).toBe('project-1');
      expect(wiki.getState().creativeBrief.genre).toBe('');
    });
  });

  describe('creative brief', () => {
    it('updates creative brief and persists', async () => {
      await wiki.updateCreativeBrief({
        genre: 'Jazz', mood: 'mellow', references: ['Miles Davis'], audience: 'adults', notes: '',
      });
      expect(wiki.getState().creativeBrief.genre).toBe('Jazz');
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe('generation log', () => {
    it('logs a generation event', async () => {
      await wiki.logGeneration(makeGenEvent());
      const log = wiki.getState().generationLog;
      expect(log).toHaveLength(1);
      expect(log[0].prompt).toBe('lo-fi chill beat');
      expect(log[0].outcome).toBe('kept');
    });

    it('logs failed generation', async () => {
      await wiki.logGeneration(makeGenEvent({ type: 'generation_failed', result: 'regenerated' }));
      expect(wiki.getState().generationLog[0].outcome).toBe('failed');
    });
  });

  describe('mix decisions', () => {
    it('adds a mix decision', async () => {
      await wiki.addMixDecision({
        timestamp: Date.now(), description: 'Lowered bass', rationale: 'Too muddy', trackId: 't1',
      });
      expect(wiki.getState().mixDecisions).toHaveLength(1);
      expect(wiki.getState().mixDecisions[0].description).toBe('Lowered bass');
    });
  });

  describe('track notes', () => {
    it('adds a new track note', async () => {
      await wiki.setTrackNote({
        trackId: 't1', trackName: 'Bass', role: 'bass', notes: 'Sub bass', updatedAt: Date.now(),
      });
      expect(wiki.getState().trackNotes).toHaveLength(1);
    });

    it('updates existing track note', async () => {
      await wiki.setTrackNote({
        trackId: 't1', trackName: 'Bass', role: 'bass', notes: 'Sub bass', updatedAt: Date.now(),
      });
      await wiki.setTrackNote({
        trackId: 't1', trackName: 'Bass', role: 'bass', notes: 'Updated bass', updatedAt: Date.now(),
      });
      expect(wiki.getState().trackNotes).toHaveLength(1);
      expect(wiki.getState().trackNotes[0].notes).toBe('Updated bass');
    });
  });

  describe('summarize', () => {
    it('returns empty string for empty wiki', () => {
      expect(wiki.summarize()).toBe('');
    });

    it('includes creative brief in summary', async () => {
      await wiki.updateCreativeBrief({
        genre: 'Jazz', mood: 'mellow', references: ['Coltrane'], audience: '', notes: '',
      });
      const summary = wiki.summarize();
      expect(summary).toContain('Jazz');
      expect(summary).toContain('mellow');
      expect(summary).toContain('Coltrane');
    });

    it('includes generation stats in summary', async () => {
      await wiki.logGeneration(makeGenEvent({ userRating: 5 }));
      await wiki.logGeneration(makeGenEvent({ userRating: 3 }));
      const summary = wiki.summarize();
      expect(summary).toContain('2 generations');
    });
  });

  describe('export/import', () => {
    it('exports wiki state', async () => {
      await wiki.updateCreativeBrief({
        genre: 'Rock', mood: 'aggressive', references: [], audience: '', notes: '',
      });
      const exported = wiki.exportWiki();
      expect(exported.version).toBe(1);
      expect(exported.wiki.creativeBrief.genre).toBe('Rock');
    });

    it('imports wiki state', async () => {
      const data = {
        version: 1 as const,
        exportedAt: Date.now(),
        wiki: {
          projectId: 'other-project',
          creativeBrief: { genre: 'Pop', mood: 'happy', references: [], audience: '', notes: '' },
          generationLog: [],
          mixDecisions: [],
          trackNotes: [],
          customPages: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      };
      await wiki.importWiki(data);
      // Should remap to current project
      expect(wiki.getState().projectId).toBe('project-1');
      expect(wiki.getState().creativeBrief.genre).toBe('Pop');
    });

    it('rejects unsupported version', async () => {
      await expect(wiki.importWiki({ version: 99 as never, exportedAt: 0, wiki: {} as never }))
        .rejects.toThrow('Unsupported');
    });
  });
});

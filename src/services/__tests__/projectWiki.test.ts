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

import { ProjectWiki } from '../projectWiki';
import type {
  ProjectWikiState,
  CreativeBrief,
  GenerationLogEntry,
  MixDecision,
  TrackNote,
  ProjectWikiExport,
} from '../../types/projectWiki';
import type { GenerationEvent, CreativeEvent } from '../../types/sessionMemory';

function makeGenEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'lo-fi chill beat with jazz piano',
    params: {
      taskType: 'text2music',
      cfgStrength: 5,
      steps: 32,
    },
    result: 'kept',
    userRating: 4,
    ...overrides,
  };
}

function makeCreativeEvent(overrides: Partial<CreativeEvent> = {}): CreativeEvent {
  return {
    type: 'mix_adjusted',
    timestamp: Date.now(),
    description: 'Lowered bass volume to -6dB',
    trackId: 'track-bass',
    ...overrides,
  };
}

describe('ProjectWiki', () => {
  let wiki: ProjectWiki;
  const projectId = 'project-123';

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    wiki = new ProjectWiki(projectId);
  });

  // ─── Initialization ────────────────────────────────────────────────────

  describe('initialization', () => {
    it('creates wiki with project ID', () => {
      expect(wiki.getProjectId()).toBe(projectId);
    });

    it('loads existing wiki from IndexedDB', async () => {
      const existing: ProjectWikiState = {
        projectId,
        creativeBrief: { genre: 'Jazz', mood: 'relaxed', references: [], audience: '', notes: '' },
        generationLog: [],
        mixDecisions: [],
        trackNotes: [],
        customPages: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockGet.mockResolvedValue(existing);

      await wiki.load();
      const state = wiki.getState();

      expect(state.creativeBrief.genre).toBe('Jazz');
      expect(state.createdAt).toBe(1000);
    });

    it('creates empty wiki if none exists', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();
      const state = wiki.getState();

      expect(state.projectId).toBe(projectId);
      expect(state.generationLog).toEqual([]);
      expect(state.creativeBrief.genre).toBe('');
    });
  });

  // ─── Creative Brief ────────────────────────────────────────────────���───

  describe('creative brief', () => {
    it('updates creative brief', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      const brief: CreativeBrief = {
        genre: 'Lo-Fi Hip-Hop',
        mood: 'chill, nostalgic',
        references: ['Nujabes - Feather', 'J Dilla - Donuts'],
        audience: 'study/focus listeners',
        notes: 'Emphasis on vinyl crackle and warm piano',
      };

      await wiki.updateCreativeBrief(brief);
      const state = wiki.getState();

      expect(state.creativeBrief).toEqual(brief);
      expect(mockSet).toHaveBeenCalled();
    });

    it('partial brief update merges with existing', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      await wiki.updateCreativeBrief({ genre: 'Jazz', mood: '', references: [], audience: '', notes: '' });
      await wiki.updateCreativeBrief({ genre: 'Jazz', mood: 'smooth', references: [], audience: '', notes: '' });

      expect(wiki.getState().creativeBrief.genre).toBe('Jazz');
      expect(wiki.getState().creativeBrief.mood).toBe('smooth');
    });
  });

  // ─── Generation Log ──────────────────────────────────────────────���─────

  describe('generation log', () => {
    it('appends generation event to log', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      const event = makeGenEvent();
      await wiki.logGeneration(event);

      const log = wiki.getState().generationLog;
      expect(log).toHaveLength(1);
      expect(log[0].prompt).toBe('lo-fi chill beat with jazz piano');
      expect(log[0].outcome).toBe('kept');
      expect(log[0].rating).toBe(4);
    });

    it('maps failed events correctly', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      await wiki.logGeneration(makeGenEvent({ type: 'generation_failed', result: 'regenerated' }));

      expect(wiki.getState().generationLog[0].outcome).toBe('failed');
    });

    it('accumulates multiple entries', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      await wiki.logGeneration(makeGenEvent({ clipId: 'a' }));
      await wiki.logGeneration(makeGenEvent({ clipId: 'b', prompt: 'rock riff' }));

      expect(wiki.getState().generationLog).toHaveLength(2);
    });
  });

  // ─── Mix Decisions ─────────────────────────────────────────────────────

  describe('mix decisions', () => {
    it('records a mix decision with rationale', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      const decision: MixDecision = {
        timestamp: Date.now(),
        description: 'Boosted high-shelf EQ on vocals',
        rationale: 'Vocals were getting buried by the synth pad',
        trackId: 'track-vocals',
      };

      await wiki.addMixDecision(decision);

      const decisions = wiki.getState().mixDecisions;
      expect(decisions).toHaveLength(1);
      expect(decisions[0].description).toBe('Boosted high-shelf EQ on vocals');
    });
  });

  // ─── Track Notes ───────────────────────────────────────────────────────

  describe('track notes', () => {
    it('adds a track note', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      const note: TrackNote = {
        trackId: 'track-drums',
        trackName: 'Drums',
        role: 'Foundation rhythm',
        notes: 'Using boom-bap pattern, keep it understated',
        updatedAt: Date.now(),
      };

      await wiki.setTrackNote(note);

      const notes = wiki.getState().trackNotes;
      expect(notes).toHaveLength(1);
      expect(notes[0].trackName).toBe('Drums');
    });

    it('updates existing track note by trackId', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();

      await wiki.setTrackNote({
        trackId: 'track-drums',
        trackName: 'Drums',
        role: 'Rhythm',
        notes: 'Initial notes',
        updatedAt: 1000,
      });

      await wiki.setTrackNote({
        trackId: 'track-drums',
        trackName: 'Drums',
        role: 'Foundation rhythm',
        notes: 'Updated notes with more detail',
        updatedAt: 2000,
      });

      const notes = wiki.getState().trackNotes;
      expect(notes).toHaveLength(1);
      expect(notes[0].notes).toBe('Updated notes with more detail');
    });
  });

  // ─── Summary ───────────────────────────────────────────────────────────

  describe('summary', () => {
    it('generates a text summary of the wiki', async () => {
      const state: ProjectWikiState = {
        projectId,
        creativeBrief: {
          genre: 'Lo-Fi',
          mood: 'chill',
          references: ['Nujabes'],
          audience: 'study listeners',
          notes: '',
        },
        generationLog: [
          { timestamp: 1, trackId: 't1', prompt: 'lo-fi beat', params: {}, outcome: 'kept', rating: 4 },
          { timestamp: 2, trackId: 't2', prompt: 'jazz piano', params: {}, outcome: 'kept', rating: 5 },
        ],
        mixDecisions: [
          { timestamp: 1, description: 'Lowered bass', rationale: 'Too boomy' },
        ],
        trackNotes: [
          { trackId: 't1', trackName: 'Drums', role: 'Rhythm', notes: 'Boom bap', updatedAt: 1 },
        ],
        customPages: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockGet.mockResolvedValue(state);
      await wiki.load();

      const summary = wiki.summarize();

      expect(summary).toContain('Lo-Fi');
      expect(summary).toContain('chill');
      expect(summary).toContain('2 generations');
      expect(summary).toContain('Drums');
    });
  });

  // ─── Export / Import ───────────────────────────────────────────���───────

  describe('export/import', () => {
    it('exports wiki state', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();
      await wiki.updateCreativeBrief({
        genre: 'Jazz', mood: 'smooth', references: [], audience: '', notes: '',
      });

      const exported = wiki.exportWiki();

      expect(exported.version).toBe(1);
      expect(exported.wiki.creativeBrief.genre).toBe('Jazz');
      expect(exported.exportedAt).toBeGreaterThan(0);
    });

    it('imports wiki state', async () => {
      const data: ProjectWikiExport = {
        version: 1,
        exportedAt: Date.now(),
        wiki: {
          projectId: 'other-project',
          creativeBrief: { genre: 'Rock', mood: 'energetic', references: [], audience: '', notes: '' },
          generationLog: [],
          mixDecisions: [],
          trackNotes: [],
          customPages: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      };

      await wiki.importWiki(data);
      const state = wiki.getState();

      // projectId should be remapped to current wiki's project
      expect(state.projectId).toBe(projectId);
      expect(state.creativeBrief.genre).toBe('Rock');
    });

    it('rejects invalid version', async () => {
      const data = { version: 99, exportedAt: 0, wiki: {} } as unknown as ProjectWikiExport;
      await expect(wiki.importWiki(data)).rejects.toThrow('Unsupported');
    });
  });

  // ─── Persistence ───────────────────────────────────────────────────────

  describe('persistence', () => {
    it('uses wiki:<projectId> key prefix', async () => {
      mockGet.mockResolvedValue(undefined);
      await wiki.load();
      await wiki.updateCreativeBrief({ genre: 'Pop', mood: '', references: [], audience: '', notes: '' });

      const key = mockSet.mock.calls[0][0] as string;
      expect(key).toBe(`wiki:project:${projectId}`);
    });
  });
});

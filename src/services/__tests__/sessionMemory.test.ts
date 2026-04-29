import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import { SessionMemory } from '../sessionMemory';
import type {
  GenerationEvent,
  CreativeEvent,
  ResearchEvent,
  SessionMemoryConfig,
} from '../../types/sessionMemory';
import { DEFAULT_SESSION_MEMORY_CONFIG } from '../../types/sessionMemory';

function makeGenerationEvent(overrides: Partial<GenerationEvent> = {}): GenerationEvent {
  return {
    type: 'generation_complete',
    timestamp: Date.now(),
    clipId: 'clip-1',
    trackId: 'track-1',
    prompt: 'A chill lo-fi beat',
    params: {
      taskType: 'text2music',
      duration: 30,
      cfgStrength: 5,
      steps: 60,
    },
    result: 'kept',
    ...overrides,
  };
}

function makeCreativeEvent(overrides: Partial<CreativeEvent> = {}): CreativeEvent {
  return {
    type: 'track_added',
    timestamp: Date.now(),
    description: 'Added drums track',
    ...overrides,
  };
}

function makeResearchEvent(overrides: Partial<ResearchEvent> = {}): ResearchEvent {
  return {
    type: 'competitor_analysis',
    timestamp: Date.now(),
    source: 'Ableton docs',
    findings: ['Ableton uses nested group tracks'],
    ...overrides,
  };
}

describe('SessionMemory', () => {
  let memory: SessionMemory;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    memory = new SessionMemory();
  });

  afterEach(async () => {
    await memory.destroy();
    vi.useRealTimers();
  });

  // ─── Instantiation ──────────────────────────────────────────────────────

  describe('instantiation', () => {
    it('creates with default config', () => {
      expect(memory.getConfig()).toEqual(DEFAULT_SESSION_MEMORY_CONFIG);
    });

    it('creates with custom config', () => {
      const custom: Partial<SessionMemoryConfig> = { flushIntervalMs: 5000, maxBufferSize: 10 };
      const m = new SessionMemory(custom);
      expect(m.getConfig().flushIntervalMs).toBe(5000);
      expect(m.getConfig().maxBufferSize).toBe(10);
      expect(m.getConfig().captureGenerations).toBe(true); // default preserved
      m.destroy();
    });

    it('assigns a unique session ID', () => {
      const m2 = new SessionMemory();
      expect(memory.getSessionId()).toBeTruthy();
      expect(memory.getSessionId()).not.toBe(m2.getSessionId());
      m2.destroy();
    });
  });

  // ─── Event Capture ──────────────────────────────────────────────────────

  describe('event capture', () => {
    it('captures generation events', () => {
      const event = makeGenerationEvent();
      memory.captureGeneration(event);
      expect(memory.getBufferedEvents()).toHaveLength(1);
      expect(memory.getBufferedEvents()[0]).toEqual(event);
    });

    it('captures creative events', () => {
      const event = makeCreativeEvent();
      memory.captureCreative(event);
      expect(memory.getBufferedEvents()).toHaveLength(1);
    });

    it('captures research events', () => {
      const event = makeResearchEvent();
      memory.captureResearch(event);
      expect(memory.getBufferedEvents()).toHaveLength(1);
    });

    it('respects config flags — skips generation when disabled', () => {
      const m = new SessionMemory({ captureGenerations: false });
      m.captureGeneration(makeGenerationEvent());
      expect(m.getBufferedEvents()).toHaveLength(0);
      m.destroy();
    });

    it('respects config flags — skips creative when disabled', () => {
      const m = new SessionMemory({ captureCreativeActions: false });
      m.captureCreative(makeCreativeEvent());
      expect(m.getBufferedEvents()).toHaveLength(0);
      m.destroy();
    });

    it('respects config flags — skips research when disabled', () => {
      const m = new SessionMemory({ captureResearch: false });
      m.captureResearch(makeResearchEvent());
      expect(m.getBufferedEvents()).toHaveLength(0);
      m.destroy();
    });

    it('accumulates multiple events in order', () => {
      memory.captureGeneration(makeGenerationEvent({ clipId: 'a' }));
      memory.captureCreative(makeCreativeEvent({ description: 'b' }));
      memory.captureGeneration(makeGenerationEvent({ clipId: 'c' }));
      const events = memory.getBufferedEvents();
      expect(events).toHaveLength(3);
      expect((events[0] as GenerationEvent).clipId).toBe('a');
      expect((events[2] as GenerationEvent).clipId).toBe('c');
    });
  });

  // ─── Batch Flush ────────────────────────────────────────────────────────

  describe('batch flush', () => {
    it('flushes on interval', async () => {
      memory.captureGeneration(makeGenerationEvent());
      expect(memory.getBufferedEvents()).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(DEFAULT_SESSION_MEMORY_CONFIG.flushIntervalMs);

      // After flush, buffer is cleared and events persisted
      expect(memory.getBufferedEvents()).toHaveLength(0);
      expect(mockSet).toHaveBeenCalled();
    });

    it('flushes when buffer reaches maxBufferSize', async () => {
      const m = new SessionMemory({ maxBufferSize: 3 });
      m.captureGeneration(makeGenerationEvent({ clipId: '1' }));
      m.captureGeneration(makeGenerationEvent({ clipId: '2' }));
      // Third event triggers flush
      m.captureGeneration(makeGenerationEvent({ clipId: '3' }));

      // Allow async flush to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(m.getBufferedEvents()).toHaveLength(0);
      expect(mockSet).toHaveBeenCalled();
      m.destroy();
    });

    it('does not flush when buffer is empty', async () => {
      const m = new SessionMemory();
      mockSet.mockClear();
      await vi.advanceTimersByTimeAsync(DEFAULT_SESSION_MEMORY_CONFIG.flushIntervalMs);
      expect(mockSet).not.toHaveBeenCalled();
      m.destroy();
    });

    it('manual flush works', async () => {
      memory.captureGeneration(makeGenerationEvent());
      await memory.flush();
      expect(memory.getBufferedEvents()).toHaveLength(0);
      expect(mockSet).toHaveBeenCalled();
    });

    it('persists events under wiki key with session prefix', async () => {
      memory.captureGeneration(makeGenerationEvent());
      await memory.flush();
      const key = mockSet.mock.calls[0][0] as string;
      expect(key).toMatch(/^wiki:session:/);
    });
  });

  // ─── Wiki Update Logic ─────────────────────────────────────────────────

  describe('wiki update logic', () => {
    it('determines wiki pages to update from generation events', () => {
      const event = makeGenerationEvent({ prompt: 'lo-fi hip hop beat' });
      const updates = memory.determineWikiUpdates([event]);
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.some(u => u.wikiType === 'recipe')).toBe(true);
    });

    it('determines wiki pages from creative events', () => {
      const event = makeCreativeEvent({ type: 'track_added', description: 'Added bass track' });
      const updates = memory.determineWikiUpdates([event]);
      expect(updates.some(u => u.wikiType === 'project')).toBe(true);
    });

    it('determines wiki pages from research events', () => {
      const event = makeResearchEvent();
      const updates = memory.determineWikiUpdates([event]);
      expect(updates.some(u => u.wikiType === 'dev')).toBe(true);
    });

    it('returns empty for empty events', () => {
      expect(memory.determineWikiUpdates([])).toEqual([]);
    });
  });

  // ─── Session Summary ───────────────────────────────────────────────────

  describe('session summary', () => {
    it('generates summary on endSession', async () => {
      memory.setProjectId('proj-1');
      memory.captureGeneration(makeGenerationEvent({ result: 'kept', userRating: 4 }));
      memory.captureGeneration(makeGenerationEvent({ type: 'generation_failed', result: 'regenerated', errorMessage: 'timeout' }));
      memory.captureCreative(makeCreativeEvent());

      const summary = await memory.endSession();

      expect(summary.projectId).toBe('proj-1');
      expect(summary.totalGenerations).toBe(2);
      expect(summary.successfulGenerations).toBe(1);
      expect(summary.failedGenerations).toBe(1);
      expect(summary.averageRating).toBe(4);
      expect(summary.creativeActions).toBe(1);
      expect(summary.events).toHaveLength(3);
      expect(summary.startedAt).toBeLessThanOrEqual(summary.endedAt);
    });

    it('persists summary to IndexedDB', async () => {
      memory.captureGeneration(makeGenerationEvent());
      await memory.endSession();

      // Should have flush call + summary call
      const summaryCall = mockSet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('summary')
      );
      expect(summaryCall).toBeTruthy();
    });

    it('returns null averageRating when no ratings exist', async () => {
      memory.captureGeneration(makeGenerationEvent({ userRating: undefined }));
      const summary = await memory.endSession();
      expect(summary.averageRating).toBeNull();
    });

    it('collects top prompts by frequency', async () => {
      memory.captureGeneration(makeGenerationEvent({ prompt: 'jazz piano' }));
      memory.captureGeneration(makeGenerationEvent({ prompt: 'jazz piano' }));
      memory.captureGeneration(makeGenerationEvent({ prompt: 'rock guitar' }));

      const summary = await memory.endSession();
      expect(summary.topPrompts[0]).toBe('jazz piano');
    });

    it('skips summary when config disabled', async () => {
      const m = new SessionMemory({ generateSummary: false });
      m.captureGeneration(makeGenerationEvent());
      mockSet.mockClear();
      const summary = await m.endSession();
      expect(summary.events).toHaveLength(1);
      // Only flush call should exist, no summary call
      const summaryCall = mockSet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('summary')
      );
      expect(summaryCall).toBeUndefined();
      m.destroy();
    });
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('destroy stops timer and flushes', async () => {
      memory.captureGeneration(makeGenerationEvent());
      await memory.destroy();
      expect(memory.getBufferedEvents()).toHaveLength(0);
    });

    it('setProjectId updates context', () => {
      memory.setProjectId('proj-99');
      expect(memory.getProjectId()).toBe('proj-99');
    });
  });

  // ─── Event Subscribers ─────────────────────────────────────────────────

  describe('subscribers', () => {
    it('notifies flush subscribers', async () => {
      const callback = vi.fn();
      memory.onFlush(callback);
      memory.captureGeneration(makeGenerationEvent());
      await memory.flush();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ clipId: 'clip-1' }),
      ]));
    });

    it('unsubscribe works', async () => {
      const callback = vi.fn();
      const unsub = memory.onFlush(callback);
      unsub();
      memory.captureGeneration(makeGenerationEvent());
      await memory.flush();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

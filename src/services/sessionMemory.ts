/**
 * Session Memory Layer — automatic event capture and wiki ingest pipeline.
 * Captures generation, creative, and research events during a DAW session,
 * batches them, persists raw session data to IndexedDB, and derives wiki
 * updates from those events when needed.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1451
 */

import { set } from 'idb-keyval';
import type {
  SessionEvent,
  GenerationEvent,
  CreativeEvent,
  ResearchEvent,
  SessionSummary,
  WikiPageUpdate,
  SessionMemoryConfig,
} from '../types/sessionMemory';
import {
  classifyEvent,
  DEFAULT_SESSION_MEMORY_CONFIG,
} from '../types/sessionMemory';

const WIKI_SESSION_PREFIX = 'wiki:session:';
const WIKI_SUMMARY_PREFIX = 'wiki:summary:';

type FlushCallback = (events: SessionEvent[]) => void;

export class SessionMemory {
  private sessionId: string;
  private startedAt: number;
  private projectId: string | undefined;
  private config: SessionMemoryConfig;
  private buffer: SessionEvent[] = [];
  private allEvents: SessionEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushCallbacks: Set<FlushCallback> = new Set();
  private destroyed = false;

  constructor(configOverrides?: Partial<SessionMemoryConfig>) {
    this.sessionId = generateSessionId();
    this.startedAt = Date.now();
    this.config = { ...DEFAULT_SESSION_MEMORY_CONFIG, ...configOverrides };
    this.startFlushTimer();
  }

  // ─── Public API ──────────────────────────────────────────────────────

  getConfig(): SessionMemoryConfig {
    return { ...this.config };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getProjectId(): string | undefined {
    return this.projectId;
  }

  setProjectId(id: string): void {
    this.projectId = id;
  }

  getBufferedEvents(): SessionEvent[] {
    return [...this.buffer];
  }

  // ─── Event Capture ──────────────────────────────────────────────────

  captureGeneration(event: GenerationEvent): void {
    if (this.destroyed || !this.config.captureGenerations) return;
    this.addEvent(event);
  }

  captureCreative(event: CreativeEvent): void {
    if (this.destroyed || !this.config.captureCreativeActions) return;
    this.addEvent(event);
  }

  captureResearch(event: ResearchEvent): void {
    if (this.destroyed || !this.config.captureResearch) return;
    this.addEvent(event);
  }

  // ─── Flush / Persist ────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const key = `${WIKI_SESSION_PREFIX}${this.sessionId}:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await set(key, events);

      for (const cb of this.flushCallbacks) {
        cb(events);
      }
    } catch {
      // Re-queue events on persistence failure to prevent data loss
      this.buffer = [...events, ...this.buffer];
    }
  }

  // ─── Wiki Update Logic ─────────────────────────────────────────────

  determineWikiUpdates(events: SessionEvent[]): WikiPageUpdate[] {
    if (events.length === 0) return [];

    const updates: WikiPageUpdate[] = [];
    const now = Date.now();

    const generationEvents = events.filter(
      (e): e is GenerationEvent => classifyEvent(e) === 'generation'
    );
    const creativeEvents = events.filter(
      (e): e is CreativeEvent => classifyEvent(e) === 'creative'
    );
    const researchEvents = events.filter(
      (e): e is ResearchEvent => classifyEvent(e) === 'research'
    );

    if (generationEvents.length > 0) {
      const lines = generationEvents.map(e => {
        const rating = e.userRating ? ` (rating: ${e.userRating}/5)` : '';
        const status = e.type === 'generation_failed' ? ' [FAILED]' : '';
        return `- ${e.prompt} → ${e.result}${rating}${status} | ${e.params.taskType}, cfg=${e.params.cfgStrength ?? '?'}`;
      });
      updates.push({
        wikiType: 'recipe',
        pagePath: 'generations/log.md',
        content: lines.join('\n'),
        updatedAt: now,
        mergeStrategy: 'append',
      });
    }

    if (creativeEvents.length > 0) {
      const lines = creativeEvents.map(e =>
        `- [${e.type}] ${e.description}`
      );
      updates.push({
        wikiType: 'project',
        pagePath: 'creative-log.md',
        content: lines.join('\n'),
        updatedAt: now,
        mergeStrategy: 'append',
      });
    }

    if (researchEvents.length > 0) {
      const lines = researchEvents.map(e =>
        `## ${e.source}\n${e.findings.map(f => `- ${f}`).join('\n')}`
      );
      updates.push({
        wikiType: 'dev',
        pagePath: 'research/log.md',
        content: lines.join('\n\n'),
        updatedAt: now,
        mergeStrategy: 'append',
      });
    }

    return updates;
  }

  // ─── Session Summary ───────────────────────────────────────────────

  async endSession(): Promise<SessionSummary> {
    // Stop accepting new events and flush remaining buffer
    this.stopFlushTimer();
    await this.flush();

    const genEvents = this.allEvents.filter(
      (e): e is GenerationEvent => classifyEvent(e) === 'generation'
    );
    const creativeEvents = this.allEvents.filter(
      e => classifyEvent(e) === 'creative'
    );

    // Only count complete/failed — variation_selected tracked separately in events
    const successful = genEvents.filter(e => e.type === 'generation_complete').length;
    const failed = genEvents.filter(e => e.type === 'generation_failed').length;

    const ratings: number[] = [];
    for (const e of genEvents) {
      if (e.userRating !== undefined) ratings.push(e.userRating);
    }
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;

    const promptCounts = new Map<string, number>();
    for (const e of genEvents) {
      promptCounts.set(e.prompt, (promptCounts.get(e.prompt) ?? 0) + 1);
    }
    const topPrompts = [...promptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([prompt]) => prompt);

    const summary: SessionSummary = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      projectId: this.projectId,
      totalGenerations: successful + failed,
      successfulGenerations: successful,
      failedGenerations: failed,
      averageRating,
      topPrompts,
      creativeActions: creativeEvents.length,
      events: [...this.allEvents],
    };

    if (this.config.generateSummary) {
      const key = `${WIKI_SUMMARY_PREFIX}${this.sessionId}`;
      await set(key, summary);
    }

    return summary;
  }

  // ─── Subscribers ────────────────────────────────────────────────────

  onFlush(callback: FlushCallback): () => void {
    this.flushCallbacks.add(callback);
    return () => this.flushCallbacks.delete(callback);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopFlushTimer();
    await this.flush();
  }

  // ─── Private ────────────────────────────────────────────────────────

  private addEvent(event: SessionEvent): void {
    this.buffer.push(event);
    this.allEvents.push(event);

    if (this.buffer.length >= this.config.maxBufferSize) {
      void this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _instance: SessionMemory | null = null;

export function getSessionMemory(config?: Partial<SessionMemoryConfig>): SessionMemory {
  if (!_instance) {
    _instance = new SessionMemory(config);
  }
  return _instance;
}

export function resetSessionMemory(): void {
  if (_instance) {
    void _instance.destroy();
    _instance = null;
  }
}

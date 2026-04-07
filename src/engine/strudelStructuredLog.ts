/**
 * Strudel Structured Event Log
 *
 * Machine-readable event logging for the Strudel engine.
 * Agents can query, filter, and subscribe to Strudel events
 * without parsing console output.
 *
 * Events:
 * - evaluate: pattern code evaluated
 * - error: evaluation or runtime error
 * - play: playback started
 * - stop: playback stopped
 * - bounce: pattern bounced to audio
 * - freeze: pattern frozen to MIDI/drums
 * - generate: AI generation from pattern
 * - version: version snapshot captured
 * - bpm-sync: BPM synchronized from transport
 */

export type StrudelLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StrudelLogEntry {
  timestamp: number;
  event: string;
  level: StrudelLogLevel;
  data: Record<string, unknown>;
}

export interface StrudelLogFilter {
  event?: string;
  level?: StrudelLogLevel;
  since?: number;
  limit?: number;
}

type LogSubscriber = (entry: StrudelLogEntry) => void;

/**
 * Ring-buffer based structured event log for Strudel engine events.
 */
export class StrudelEventLog {
  private entries: StrudelLogEntry[] = [];
  private maxSize: number;
  private subscribers: Set<LogSubscriber> = new Set();

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Record a structured event.
   */
  emit(
    event: string,
    data: Record<string, unknown>,
    level: StrudelLogLevel = 'info',
  ): void {
    const entry: StrudelLogEntry = {
      timestamp: Date.now(),
      event,
      level,
      data,
    };

    this.entries.push(entry);

    // Ring buffer: trim oldest entries
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(-this.maxSize);
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(entry);
      } catch {
        // Don't let subscriber errors break logging
      }
    }
  }

  /**
   * Get log entries with optional filtering.
   */
  getEntries(filter?: StrudelLogFilter): StrudelLogEntry[] {
    let result = this.entries.slice();

    if (filter?.event) {
      result = result.filter((e) => e.event === filter.event);
    }
    if (filter?.level) {
      result = result.filter((e) => e.level === filter.level);
    }
    if (filter?.since !== undefined) {
      result = result.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter?.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  /**
   * Clear all log entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Subscribe to new log events. Returns an unsubscribe function.
   */
  subscribe(callback: LogSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get entry count.
   */
  get size(): number {
    return this.entries.length;
  }
}

// ─── Singleton Instance ─────────────────────────────────────

/**
 * Global Strudel event log instance.
 * Used by strudelEngine and exposed via window.__strudelApi.
 */
export const strudelEventLog = new StrudelEventLog(500);

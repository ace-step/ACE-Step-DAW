/**
 * Session Memory Layer — Event types for wiki ingest pipeline.
 * Captures generation, creative, and research events for automatic wiki updates.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1451
 */

// ─── Generation Events ──────────────────────────────────────────────────────

export type GenerationResult = 'kept' | 'regenerated' | 'adjusted' | 'deleted';

export interface GenerationEvent {
  type: 'generation_complete' | 'generation_failed' | 'variation_selected';
  timestamp: number;
  clipId: string;
  trackId: string;
  prompt: string;
  lyrics?: string;
  params: GenerationEventParams;
  result: GenerationResult;
  inferredMetas?: {
    bpm?: number;
    keyScale?: string;
    genres?: string[];
    seed?: number;
  };
  userRating?: 1 | 2 | 3 | 4 | 5;
  errorMessage?: string;
}

export interface GenerationEventParams {
  taskType: string;
  duration?: number;
  cfgStrength?: number;
  steps?: number;
  shift?: number;
  modelId?: string;
  contextMode?: string;
}

// ─── Creative Events ─────────────────────────────────────────────────────────

export type CreativeEventType =
  | 'track_added'
  | 'track_removed'
  | 'mix_adjusted'
  | 'arrangement_changed'
  | 'clip_moved'
  | 'effect_changed';

export interface CreativeEvent {
  type: CreativeEventType;
  timestamp: number;
  trackId?: string;
  description: string;
  details?: Record<string, unknown>;
}

// ─── Research Events ─────────────────────────────────────────────────────────

export type ResearchEventType =
  | 'competitor_analysis'
  | 'api_discovery'
  | 'user_feedback';

export interface ResearchEvent {
  type: ResearchEventType;
  timestamp: number;
  source: string;
  findings: string[];
}

// ─── Union & Buffer ──────────────────────────────────────────────────────────

export type SessionEvent = GenerationEvent | CreativeEvent | ResearchEvent;

export type SessionEventCategory = 'generation' | 'creative' | 'research';

export function classifyEvent(event: SessionEvent): SessionEventCategory {
  if ('clipId' in event) return 'generation';
  if ('findings' in event) return 'research';
  return 'creative';
}

// ─── Session Summary ─────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  projectId?: string;
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  averageRating: number | null;
  topPrompts: string[];
  creativeActions: number;
  events: SessionEvent[];
}

// ─── Wiki Page Update ────────────────────────────────────────────────────────

export interface WikiPageUpdate {
  wikiType: 'recipe' | 'project' | 'dev';
  pagePath: string;
  content: string;
  updatedAt: number;
  mergeStrategy: 'append' | 'replace' | 'merge';
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SessionMemoryConfig {
  /** Flush interval in milliseconds. Default: 30000 (30s). */
  flushIntervalMs: number;
  /** Maximum events before forced flush. Default: 50. */
  maxBufferSize: number;
  /** Whether to capture generation events. Default: true. */
  captureGenerations: boolean;
  /** Whether to capture creative events. Default: true. */
  captureCreativeActions: boolean;
  /** Whether to capture research events. Default: true. */
  captureResearch: boolean;
  /** Whether to generate session summary on end. Default: true. */
  generateSummary: boolean;
}

export const DEFAULT_SESSION_MEMORY_CONFIG: SessionMemoryConfig = {
  flushIntervalMs: 30_000,
  maxBufferSize: 50,
  captureGenerations: true,
  captureCreativeActions: true,
  captureResearch: true,
  generateSummary: true,
};

/**
 * Project Creative Wiki types — persistent per-project knowledge base.
 * Accumulates creative context across sessions: generation logs, mix decisions,
 * track notes, and creative briefs.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

export interface WikiPage {
  pageName: string;
  content: string;
  updatedAt: number;
  createdAt: number;
}

export interface ProjectWiki {
  projectId: string;
  pages: Map<string, WikiPage>;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectWikiSerialized {
  projectId: string;
  pages: Array<[string, WikiPage]>;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationLogEntry {
  timestamp: number;
  clipId: string;
  trackId: string;
  prompt: string;
  params: Record<string, unknown>;
  result: string;
  rating?: number;
}

export const DEFAULT_WIKI_PAGES = [
  'creative-brief.md',
  'generation-log.md',
  'mix-decisions.md',
] as const;

export type DefaultWikiPage = typeof DEFAULT_WIKI_PAGES[number];

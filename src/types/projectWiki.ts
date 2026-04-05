/**
 * Project Creative Wiki Types — Per-project persistent knowledge base.
 * Compounds creative knowledge across sessions for each project.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

// ─── Wiki Page ──────────────────────────────────────────────────────────────

export interface WikiPage {
  pageName: string;
  content: string;
  updatedAt: number;
  createdAt: number;
}

// ─── Creative Brief ─────────────────────────────────────────────────────────

export interface CreativeBrief {
  genre: string;
  mood: string;
  references: string[];
  audience: string;
  notes: string;
}

// ─── Generation Log Entry ───────────────────────────────────────────────────

export interface GenerationLogEntry {
  timestamp: number;
  trackId: string;
  prompt: string;
  params: Record<string, unknown>;
  outcome: 'kept' | 'regenerated' | 'adjusted' | 'deleted' | 'failed';
  rating?: 1 | 2 | 3 | 4 | 5;
}

// ─── Mix Decision ───────────────────────────────────────────────────────────

export interface MixDecision {
  timestamp: number;
  description: string;
  rationale: string;
  trackId?: string;
}

// ─── Track Note ─────────────────────────────────────────────────────────────

export interface TrackNote {
  trackId: string;
  trackName: string;
  role: string;
  notes: string;
  updatedAt: number;
}

// ─── Project Wiki State ─────────────────────────────────────────────────────

export interface ProjectWikiState {
  projectId: string;
  creativeBrief: CreativeBrief;
  generationLog: GenerationLogEntry[];
  mixDecisions: MixDecision[];
  trackNotes: TrackNote[];
  customPages: WikiPage[];
  createdAt: number;
  updatedAt: number;
}

// ─── Export Format ──────────────────────────────────────────────────────────

export interface ProjectWikiExport {
  version: 1;
  exportedAt: number;
  wiki: ProjectWikiState;
}

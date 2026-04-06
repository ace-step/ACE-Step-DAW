/**
 * Project Creative Wiki Types — Per-project persistent knowledge base.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

export interface CreativeBrief {
  genre: string;
  mood: string;
  references: string[];
  audience: string;
  notes: string;
}

export interface GenerationLogEntry {
  timestamp: number;
  trackId: string;
  prompt: string;
  params: Record<string, unknown>;
  outcome: 'kept' | 'regenerated' | 'adjusted' | 'deleted' | 'failed';
  rating?: 1 | 2 | 3 | 4 | 5;
}

export interface MixDecision {
  timestamp: number;
  description: string;
  rationale: string;
  trackId?: string;
}

export interface TrackNote {
  trackId: string;
  trackName: string;
  role: string;
  notes: string;
  updatedAt: number;
}

export interface WikiPage {
  pageName: string;
  content: string;
  updatedAt: number;
  createdAt: number;
}

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

export interface ProjectWikiExport {
  version: 1;
  exportedAt: number;
  wiki: ProjectWikiState;
}

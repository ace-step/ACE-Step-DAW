/**
 * Project Creative Wiki — Per-project persistent knowledge base.
 * Compounds creative knowledge across sessions for each project.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

import { get, set } from 'idb-keyval';
import type {
  ProjectWikiState,
  CreativeBrief,
  GenerationLogEntry,
  MixDecision,
  TrackNote,
  ProjectWikiExport,
} from '../types/projectWiki';
import type { GenerationEvent } from '../types/sessionMemory';

const WIKI_PROJECT_PREFIX = 'wiki:project:';

function makeEmptyState(projectId: string): ProjectWikiState {
  const now = Date.now();
  return {
    projectId,
    creativeBrief: { genre: '', mood: '', references: [], audience: '', notes: '' },
    generationLog: [],
    mixDecisions: [],
    trackNotes: [],
    customPages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export class ProjectWiki {
  private projectId: string;
  private state: ProjectWikiState;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.state = makeEmptyState(projectId);
  }

  getProjectId(): string {
    return this.projectId;
  }

  async load(): Promise<void> {
    const stored = await get<ProjectWikiState>(`${WIKI_PROJECT_PREFIX}${this.projectId}`);
    this.state = stored ?? makeEmptyState(this.projectId);
  }

  getState(): ProjectWikiState {
    return this.state;
  }

  // ─── Creative Brief ─────────────────────────────────────────────────────

  async updateCreativeBrief(brief: CreativeBrief): Promise<void> {
    this.state.creativeBrief = brief;
    await this.persist();
  }

  // ─── Generation Log ─────────────────────────────────────────────────────

  async logGeneration(event: GenerationEvent): Promise<void> {
    const entry: GenerationLogEntry = {
      timestamp: event.timestamp,
      trackId: event.trackId,
      prompt: event.prompt,
      params: { ...event.params },
      outcome: event.type === 'generation_failed' ? 'failed' : event.result,
      rating: event.userRating,
    };
    this.state.generationLog.push(entry);
    await this.persist();
  }

  // ─── Mix Decisions ──────────────────────────────────────────────────────

  async addMixDecision(decision: MixDecision): Promise<void> {
    this.state.mixDecisions.push(decision);
    await this.persist();
  }

  // ─── Track Notes ────────────────────────────────────────────────────────

  async setTrackNote(note: TrackNote): Promise<void> {
    const idx = this.state.trackNotes.findIndex(n => n.trackId === note.trackId);
    if (idx >= 0) {
      this.state.trackNotes[idx] = note;
    } else {
      this.state.trackNotes.push(note);
    }
    await this.persist();
  }

  // ─── Summary ────────────────────────────────────────────────────────────

  summarize(): string {
    const lines: string[] = [];
    const brief = this.state.creativeBrief;

    if (brief.genre || brief.mood) {
      lines.push('## Creative Brief');
      if (brief.genre) lines.push(`Genre: ${brief.genre}`);
      if (brief.mood) lines.push(`Mood: ${brief.mood}`);
      if (brief.references.length > 0) lines.push(`References: ${brief.references.join(', ')}`);
      if (brief.audience) lines.push(`Audience: ${brief.audience}`);
      lines.push('');
    }

    const genLog = this.state.generationLog;
    if (genLog.length > 0) {
      const kept = genLog.filter(e => e.outcome === 'kept').length;
      const ratings = genLog.filter(e => e.rating !== undefined).map(e => e.rating!);
      const avgRating = ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : 'N/A';
      lines.push('## Generation History');
      lines.push(`${genLog.length} generations, ${kept} kept, avg rating: ${avgRating}`);
      lines.push('');
    }

    if (this.state.mixDecisions.length > 0) {
      lines.push('## Mix Decisions');
      for (const d of this.state.mixDecisions.slice(-5)) {
        lines.push(`- ${d.description}: ${d.rationale}`);
      }
      lines.push('');
    }

    if (this.state.trackNotes.length > 0) {
      lines.push('## Track Notes');
      for (const n of this.state.trackNotes) {
        lines.push(`- **${n.trackName}** (${n.role}): ${n.notes}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Export / Import ────────────────────────────────────────────────────

  exportWiki(): ProjectWikiExport {
    return {
      version: 1,
      exportedAt: Date.now(),
      wiki: JSON.parse(JSON.stringify(this.state)),
    };
  }

  async importWiki(data: ProjectWikiExport): Promise<void> {
    if (data.version !== 1) {
      throw new Error('Unsupported project wiki version');
    }
    this.state = {
      ...data.wiki,
      projectId: this.projectId,
    };
    await this.persist();
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    this.state.updatedAt = Date.now();
    await set(`${WIKI_PROJECT_PREFIX}${this.projectId}`, this.state);
  }
}

// ─── Instance Cache ──────────────────────────────────────────────────────────

const _cache = new Map<string, ProjectWiki>();

export function getProjectWiki(projectId: string): ProjectWiki {
  let wiki = _cache.get(projectId);
  if (!wiki) {
    wiki = new ProjectWiki(projectId);
    _cache.set(projectId, wiki);
  }
  return wiki;
}

export function resetProjectWikiCache(): void {
  _cache.clear();
}

/**
 * Project Creative Wiki — persistent per-project knowledge base.
 * Stores creative briefs, generation logs, mix decisions, and track notes.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

import { get, set, del } from 'idb-keyval';
import type {
  WikiPage,
  ProjectWikiSerialized,
  GenerationLogEntry,
} from '../types/projectWiki';

const WIKI_PREFIX = 'wiki:';

export interface ProjectWikiSummary {
  projectId: string;
  pageCount: number;
  generationCount: number;
  lastUpdated: number;
  pageNames: string[];
}

export class ProjectWikiService {
  private projectId: string;
  private pages = new Map<string, WikiPage>();
  private createdAt: number;
  private updatedAt: number;
  private generationCount = 0;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  private get storageKey(): string {
    return `${WIKI_PREFIX}${this.projectId}`;
  }

  async initialize(): Promise<void> {
    const stored = await get<ProjectWikiSerialized>(this.storageKey);
    if (stored) {
      this.deserialize(stored);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  getPage(pageName: string): WikiPage | undefined {
    return this.pages.get(pageName);
  }

  async setPage(pageName: string, content: string): Promise<void> {
    const now = Date.now();
    const existing = this.pages.get(pageName);
    this.pages.set(pageName, {
      pageName,
      content,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    });
    this.updatedAt = now;
    await this.persist();
  }

  async deletePage(pageName: string): Promise<void> {
    this.pages.delete(pageName);
    this.updatedAt = Date.now();
    await this.persist();
  }

  listPages(): WikiPage[] {
    return [...this.pages.values()];
  }

  // ─── Append ──────────────────────────────────────────────────────────

  async appendToPage(pageName: string, content: string): Promise<void> {
    const existing = this.pages.get(pageName);
    const newContent = existing ? existing.content + content : content;
    await this.setPage(pageName, newContent);
  }

  // ─── Generation Log ─────────────────────────────────────────────────

  async logGeneration(entry: GenerationLogEntry): Promise<void> {
    const rating = entry.rating !== undefined ? ` (${entry.rating}/5)` : '';
    const line = `\n- [${new Date(entry.timestamp).toISOString()}] "${entry.prompt}" → ${entry.result}${rating}`;
    await this.appendToPage('generation-log.md', line);
    this.generationCount++;
  }

  // ─── Summary ────────────────────────────────────────────────────────

  getSummary(): ProjectWikiSummary {
    return {
      projectId: this.projectId,
      pageCount: this.pages.size,
      generationCount: this.generationCount,
      lastUpdated: this.updatedAt,
      pageNames: [...this.pages.keys()],
    };
  }

  // ─── Serialization ─────────────────────────────────────────────────

  serialize(): ProjectWikiSerialized {
    return {
      projectId: this.projectId,
      pages: [...this.pages.entries()],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  deserialize(data: ProjectWikiSerialized): void {
    this.pages = new Map(data.pages);
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;

    // Count existing generation log entries
    const logPage = this.pages.get('generation-log.md');
    if (logPage) {
      this.generationCount = (logPage.content.match(/^- \[/gm) ?? []).length;
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await set(this.storageKey, this.serialize());
  }

  async delete(): Promise<void> {
    await del(this.storageKey);
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────

const _cache = new Map<string, ProjectWikiService>();

export async function getProjectWiki(projectId: string): Promise<ProjectWikiService> {
  let wiki = _cache.get(projectId);
  if (!wiki) {
    wiki = new ProjectWikiService(projectId);
    await wiki.initialize();
    _cache.set(projectId, wiki);
  }
  return wiki;
}

export function resetProjectWikiCache(): void {
  _cache.clear();
}

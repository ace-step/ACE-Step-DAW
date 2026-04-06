/**
 * Project Creative Wiki — persistent per-project knowledge base.
 * Stores wiki pages in IndexedDB under `wiki:<projectId>:<pageName>`.
 * Provides CRUD, generation log integration, export/import, and summarization.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

import { get, set, del, keys } from 'idb-keyval';
import type {
  WikiPage,
  ProjectWiki,
  ProjectWikiExport,
} from '../types/projectWiki';
import {
  DEFAULT_PAGE_INDEX,
  WIKI_PAGE_TEMPLATES,
  PROJECT_WIKI_VERSION,
} from '../types/projectWiki';

const WIKI_PREFIX = 'wiki:';
const META_SUFFIX = '__meta__';

function metaKey(projectId: string): string {
  return `${WIKI_PREFIX}${projectId}:${META_SUFFIX}`;
}

function pageKey(projectId: string, pageName: string): string {
  return `${WIKI_PREFIX}${projectId}:${pageName}`;
}

/** Entry for appendGenerationLog. */
export interface GenerationLogEntry {
  clipId: string;
  trackName: string;
  prompt: string;
  success: boolean;
  timestamp: number;
  params?: Record<string, unknown>;
  errorMessage?: string;
}

export class ProjectWikiService {
  private projectId: string;
  private meta: ProjectWiki | null = null;
  private initialized = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const existing = await get<ProjectWiki>(metaKey(this.projectId));
    if (existing) {
      this.meta = existing;
      this.initialized = true;
      return;
    }

    // Create default wiki
    const now = Date.now();
    this.meta = {
      projectId: this.projectId,
      pageIndex: [...DEFAULT_PAGE_INDEX],
      createdAt: now,
      updatedAt: now,
    };

    await set(metaKey(this.projectId), this.meta);

    // Create default pages
    for (const name of DEFAULT_PAGE_INDEX) {
      const page: WikiPage = {
        name,
        content: WIKI_PAGE_TEMPLATES[name] ?? '',
        createdAt: now,
        updatedAt: now,
      };
      await set(pageKey(this.projectId, name), page);
    }

    this.initialized = true;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────

  async getPage(name: string): Promise<WikiPage | null> {
    const page = await get<WikiPage>(pageKey(this.projectId, name));
    return page ?? null;
  }

  async setPage(name: string, content: string): Promise<void> {
    const now = Date.now();
    const existing = await get<WikiPage>(pageKey(this.projectId, name));

    const page: WikiPage = {
      name,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await set(pageKey(this.projectId, name), page);

    // Update index if this is a new page
    if (this.meta && !this.meta.pageIndex.includes(name)) {
      this.meta.pageIndex.push(name);
      this.meta.updatedAt = now;
      await set(metaKey(this.projectId), this.meta);
    } else if (this.meta) {
      this.meta.updatedAt = now;
      await set(metaKey(this.projectId), this.meta);
    }
  }

  async deletePage(name: string): Promise<void> {
    if (!this.meta || !this.meta.pageIndex.includes(name)) return;

    await del(pageKey(this.projectId, name));
    this.meta.pageIndex = this.meta.pageIndex.filter((p) => p !== name);
    this.meta.updatedAt = Date.now();
    await set(metaKey(this.projectId), this.meta);
  }

  listPages(): string[] {
    return this.meta?.pageIndex ?? [];
  }

  // ─── Generation Log ───────────────────────────────────────────────────

  async appendGenerationLog(entry: GenerationLogEntry): Promise<void> {
    const existing = await get<WikiPage>(pageKey(this.projectId, 'generation-log'));
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const status = entry.success ? 'success' : `failed: ${entry.errorMessage ?? 'unknown'}`;

    const logEntry = [
      `\n## ${entry.clipId} (${entry.trackName}) — ${date}`,
      `- **Prompt**: ${entry.prompt}`,
      `- **Result**: ${status}`,
      entry.params ? `- **Params**: ${JSON.stringify(entry.params)}` : '',
    ].filter(Boolean).join('\n');

    const baseContent = existing?.content
      ?? WIKI_PAGE_TEMPLATES['generation-log']
      ?? '# Generation Log\n';
    const newContent = baseContent + '\n' + logEntry + '\n';

    await this.setPage('generation-log', newContent);
  }

  // ─── Export / Import ──────────────────────────────────────────────────

  async export(): Promise<ProjectWikiExport> {
    const pages: WikiPage[] = [];
    const pageIndex = this.meta?.pageIndex ?? [];

    for (const name of pageIndex) {
      const page = await get<WikiPage>(pageKey(this.projectId, name));
      if (page) pages.push(page);
    }

    return {
      version: PROJECT_WIKI_VERSION,
      projectId: this.projectId,
      pages,
      pageIndex,
      exportedAt: Date.now(),
    };
  }

  async import(data: ProjectWikiExport): Promise<void> {
    const now = Date.now();

    // Write each page
    for (const page of data.pages) {
      await set(pageKey(this.projectId, page.name), page);
    }

    // Update meta
    this.meta = {
      projectId: this.projectId,
      pageIndex: [...data.pageIndex],
      createdAt: this.meta?.createdAt ?? now,
      updatedAt: now,
    };
    await set(metaKey(this.projectId), this.meta);
  }

  // ─── Delete All ───────────────────────────────────────────────────────

  async deleteAll(): Promise<void> {
    const allKeys = await keys();
    const prefix = `${WIKI_PREFIX}${this.projectId}:`;
    const wikiKeys = allKeys.filter(
      (k) => typeof k === 'string' && k.startsWith(prefix),
    ) as string[];

    for (const key of wikiKeys) {
      await del(key);
    }

    this.meta = null;
    this.initialized = false;
  }

  // ─── Summarize ────────────────────────────────────────────────────────

  async summarize(): Promise<string> {
    const pageIndex = this.meta?.pageIndex ?? [];
    const lines: string[] = [];
    lines.push(`Wiki: ${pageIndex.length} pages [${pageIndex.join(', ')}]`);

    for (const name of pageIndex) {
      const page = await get<WikiPage>(pageKey(this.projectId, name));
      if (page) {
        // First non-empty, non-heading line as preview
        const previewLines = page.content
          .split('\n')
          .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('_'))
          .slice(0, 1);
        if (previewLines.length > 0) {
          lines.push(`  ${name}: ${previewLines[0].slice(0, 80)}`);
        }
      }
    }

    return lines.join('\n');
  }
}

// ─── Singleton per project ──────────────────────────────────────────────

const _instances = new Map<string, ProjectWikiService>();

export function getProjectWiki(projectId: string): ProjectWikiService {
  let instance = _instances.get(projectId);
  if (!instance) {
    instance = new ProjectWikiService(projectId);
    _instances.set(projectId, instance);
  }
  return instance;
}

export function resetProjectWiki(): void {
  _instances.clear();
}

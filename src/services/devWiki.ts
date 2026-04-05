/**
 * Development Knowledge Wiki — structured competitive research & architecture decisions.
 * Replaces scattered GitHub Issues with a persistent, queryable knowledge base.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1455
 */

import { get, set } from 'idb-keyval';
import type {
  DevWikiEntry,
  DevWikiQuery,
  DevWikiIndex,
} from '../types/devWiki';
import { DEV_WIKI_VERSION } from '../types/devWiki';

const WIKI_DEV_KEY = 'wiki:dev';

export class DevWikiService {
  private entries: DevWikiEntry[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const stored = await get<DevWikiIndex>(WIKI_DEV_KEY);
    if (stored && stored.version === DEV_WIKI_VERSION) {
      this.entries = stored.entries;
    }
    this.initialized = true;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  async addEntry(
    data: Omit<DevWikiEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const now = Date.now();
    const id = `dev-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: DevWikiEntry = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(entry);
    await this.persist();
    return id;
  }

  getEntry(id: string): DevWikiEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  async updateEntry(id: string, updates: Partial<Pick<DevWikiEntry, 'title' | 'content' | 'tags' | 'source' | 'category'>>): Promise<void> {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return;
    Object.assign(entry, updates, { updatedAt: Date.now() });
    await this.persist();
  }

  async deleteEntry(id: string): Promise<void> {
    this.entries = this.entries.filter(e => e.id !== id);
    await this.persist();
  }

  getAllEntries(): DevWikiEntry[] {
    return [...this.entries];
  }

  // ─── Query ──────────────────────────────────────────────────────────

  query(filter: DevWikiQuery): DevWikiEntry[] {
    return this.entries.filter(entry => {
      if (filter.category && entry.category !== filter.category) return false;
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.some(t => entry.tags.includes(t))) return false;
      }
      if (filter.search) {
        const lower = filter.search.toLowerCase();
        const searchable = `${entry.title} ${entry.content}`.toLowerCase();
        if (!searchable.includes(lower)) return false;
      }
      return true;
    });
  }

  // ─── Log ────────────────────────────────────────────────────────────

  getLog(): DevWikiEntry[] {
    return [...this.entries].sort((a, b) => a.createdAt - b.createdAt);
  }

  // ─── Tags ───────────────────────────────────────────────────────────

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const entry of this.entries) {
      for (const tag of entry.tags) {
        tags.add(tag);
      }
    }
    return [...tags];
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    const index: DevWikiIndex = {
      entries: this.entries,
      lastUpdated: Date.now(),
      version: DEV_WIKI_VERSION,
    };
    await set(WIKI_DEV_KEY, index);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _instance: DevWikiService | null = null;

export async function getDevWiki(): Promise<DevWikiService> {
  if (!_instance) {
    _instance = new DevWikiService();
    await _instance.initialize();
  }
  return _instance;
}

export function resetDevWiki(): void {
  _instance = null;
}

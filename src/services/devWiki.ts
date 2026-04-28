/**
 * Development Knowledge Wiki — Browser-side IndexedDB wiki for competitive
 * research and architecture decisions. The static `.llm/wiki/` directory
 * provides seed content for AI agents; this service manages the dynamic,
 * queryable copy in IndexedDB for the DAW application.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1455
 */

import { get, set, keys } from 'idb-keyval';

const DEV_WIKI_PREFIX = 'wiki:dev:';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DevWikiPage {
  path: string;
  title: string;
  content: string;
  lastUpdated: number;
  sources: string[];
  tags: string[];
}

export interface DevWikiLintResult {
  path: string;
  severity: 'warning' | 'error';
  rule: string;
  message: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export class DevWiki {
  async readPage(path: string): Promise<DevWikiPage | null> {
    return (await get<DevWikiPage>(`${DEV_WIKI_PREFIX}${path}`)) ?? null;
  }

  async writePage(page: DevWikiPage): Promise<void> {
    const stored = { ...page, lastUpdated: Date.now() };
    await set(`${DEV_WIKI_PREFIX}${stored.path}`, stored);
  }

  async appendToPage(path: string, content: string, source?: string): Promise<void> {
    const existing = await this.readPage(path);
    if (existing) {
      existing.content += '\n' + content;
      if (source && !existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      existing.lastUpdated = Date.now();
      await set(`${DEV_WIKI_PREFIX}${path}`, existing);
    } else {
      await this.writePage({
        path,
        title: path.split('/').pop()?.replace('.md', '') ?? path,
        content,
        lastUpdated: Date.now(),
        sources: source ? [source] : [],
        tags: [],
      });
    }
  }

  async listPages(): Promise<DevWikiPage[]> {
    const allKeys = await keys();
    const wikiKeys = allKeys.filter(
      (k): k is string => typeof k === 'string' && k.startsWith(DEV_WIKI_PREFIX)
    );
    return (await Promise.all(
      wikiKeys.map(key => get<DevWikiPage>(key))
    )).filter((p): p is DevWikiPage => p != null);
  }

  async search(query: string): Promise<DevWikiPage[]> {
    const pages = await this.listPages();
    const lower = query.toLowerCase();
    return pages.filter(p =>
      p.title.toLowerCase().includes(lower) ||
      p.content.toLowerCase().includes(lower) ||
      p.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  async lint(): Promise<DevWikiLintResult[]> {
    const pages = await this.listPages();
    const results: DevWikiLintResult[] = [];
    const now = Date.now();
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

    for (const page of pages) {
      if (now - page.lastUpdated > SIX_MONTHS_MS) {
        results.push({
          path: page.path,
          severity: 'warning',
          rule: 'stale-page',
          message: `Page not updated in over 6 months (last: ${new Date(page.lastUpdated).toISOString().slice(0, 10)})`,
        });
      }
      if (page.content.trim().length === 0) {
        results.push({
          path: page.path,
          severity: 'error',
          rule: 'empty-page',
          message: 'Page has no content',
        });
      }
      if (page.sources.length === 0 && page.path.startsWith('competitors/')) {
        results.push({
          path: page.path,
          severity: 'warning',
          rule: 'missing-sources',
          message: 'Competitor page has no source URLs',
        });
      }
    }

    return results;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: DevWiki | null = null;

export function getDevWiki(): DevWiki {
  if (!_instance) _instance = new DevWiki();
  return _instance;
}

export function resetDevWiki(): void {
  _instance = null;
}

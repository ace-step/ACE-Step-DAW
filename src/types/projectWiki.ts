/**
 * Project Creative Wiki types — persistent per-project knowledge base.
 * Each project maintains wiki pages stored in IndexedDB that compound
 * creative knowledge across sessions.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

/** A single wiki page within a project wiki. */
export interface WikiPage {
  /** Page name (e.g., 'creative-brief', 'generation-log', 'mix-decisions'). */
  name: string;
  /** Markdown content. */
  content: string;
  /** Timestamp when the page was created. */
  createdAt: number;
  /** Timestamp of last update. */
  updatedAt: number;
}

/** The full wiki for a project — an index plus individual pages. */
export interface ProjectWiki {
  /** The project this wiki belongs to. */
  projectId: string;
  /** Ordered list of page names (defines sidebar/nav order). */
  pageIndex: string[];
  /** Timestamp when the wiki was created. */
  createdAt: number;
  /** Timestamp of last update to any page. */
  updatedAt: number;
}

/** Snapshot of the wiki for archive export/import. */
export interface ProjectWikiExport {
  version: number;
  projectId: string;
  pages: WikiPage[];
  pageIndex: string[];
  exportedAt: number;
}

/** Well-known wiki page names with their initial templates. */
export const WIKI_PAGE_TEMPLATES: Record<string, string> = {
  'index': '# Project Wiki\n\nThis wiki tracks creative decisions, generation history, and mix notes.\n\n## Pages\n\n- [Creative Brief](creative-brief)\n- [Generation Log](generation-log)\n- [Mix Decisions](mix-decisions)\n',
  'creative-brief': '# Creative Brief\n\n## Genre & Direction\n\n_Not yet defined._\n\n## Reference Tracks\n\n_None added yet._\n\n## Lyric Themes\n\n_Not yet defined._\n',
  'generation-log': '# Generation Log\n\n_Automatically updated when AI generates audio._\n',
  'mix-decisions': '# Mix Decisions\n\n_Record mix reasoning and parameter choices here._\n',
};

/** Default page index for a new project wiki. */
export const DEFAULT_PAGE_INDEX = ['index', 'creative-brief', 'generation-log', 'mix-decisions'];

/** Current wiki export format version. */
export const PROJECT_WIKI_VERSION = 1;

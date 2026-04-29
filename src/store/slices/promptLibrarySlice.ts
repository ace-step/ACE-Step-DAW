import type {
  SavedPrompt,
  SavedPromptMetadata,
  PromptLibraryFilter,
  PromptLibrarySortKey,
  PromptLibraryExport,
} from '../../types/promptLibrary';

export interface SavePromptInput {
  prompt: string;
  title: string;
  tags: string[];
  category: string;
  metadata: SavedPromptMetadata;
}

export interface PromptLibrarySlice {
  getAll(): SavedPrompt[];
  getById(id: string): SavedPrompt | null;
  savePrompt(input: SavePromptInput): SavedPrompt;
  updatePrompt(id: string, updates: Partial<SavePromptInput>): SavedPrompt | null;
  deletePrompt(id: string): boolean;
  toggleFavorite(id: string): SavedPrompt | null;
  recordUse(id: string): SavedPrompt | null;
  search(filter: PromptLibraryFilter): SavedPrompt[];
  getSorted(sortKey: PromptLibrarySortKey): SavedPrompt[];
  getAllTags(): string[];
  getAllCategories(): string[];
  exportLibrary(): PromptLibraryExport;
  importLibrary(data: PromptLibraryExport): number;
  /** Raw state for persistence */
  getState(): SavedPrompt[];
  /** Restore from persisted state */
  setState(prompts: SavedPrompt[]): void;
}

function generateId(): string {
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizePromptKey(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function autoTitle(prompt: string): string {
  const maxLen = 50;
  if (prompt.length <= maxLen) return prompt;
  const truncated = prompt.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

function matchesFilter(prompt: SavedPrompt, filter: PromptLibraryFilter): boolean {
  if (filter.favoritesOnly && !prompt.isFavorite) return false;

  if (filter.category && prompt.category !== filter.category) return false;

  if (filter.tags && filter.tags.length > 0) {
    const hasAllTags = filter.tags.every((t) =>
      prompt.tags.includes(t.toLowerCase()),
    );
    if (!hasAllTags) return false;
  }

  if (filter.search) {
    const terms = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
    const searchable = `${prompt.prompt} ${prompt.title} ${prompt.tags.join(' ')}`.toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) return false;
  }

  return true;
}

function sortPrompts(prompts: SavedPrompt[], key: PromptLibrarySortKey): SavedPrompt[] {
  const sorted = [...prompts];
  switch (key) {
    case 'dateCreated':
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case 'recent':
      return sorted.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    case 'mostUsed':
      return sorted.sort((a, b) => b.useCount - a.useCount);
    case 'alphabetical':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export function createPromptLibrarySlice(): PromptLibrarySlice {
  let library: SavedPrompt[] = [];

  function findIndex(id: string): number {
    return library.findIndex((p) => p.id === id);
  }

  return {
    getAll() {
      return [...library];
    },

    getById(id) {
      return library.find((p) => p.id === id) ?? null;
    },

    savePrompt(input) {
      const now = Date.now();
      const saved: SavedPrompt = {
        id: generateId(),
        prompt: input.prompt.trim(),
        title: input.title.trim() || autoTitle(input.prompt.trim()),
        tags: normalizeTags(input.tags),
        category: input.category.trim(),
        isFavorite: false,
        createdAt: now,
        lastUsedAt: now,
        useCount: 0,
        metadata: { ...input.metadata },
      };
      library = [...library, saved];
      return saved;
    },

    updatePrompt(id, updates) {
      const idx = findIndex(id);
      if (idx === -1) return null;

      const existing = library[idx];
      const updated: SavedPrompt = {
        ...existing,
        prompt: updates.prompt !== undefined ? updates.prompt.trim() : existing.prompt,
        title: updates.title !== undefined ? (updates.title.trim() || autoTitle((updates.prompt ?? existing.prompt).trim())) : existing.title,
        tags: updates.tags ? normalizeTags(updates.tags) : existing.tags,
        category: updates.category !== undefined ? updates.category.trim() : existing.category,
        metadata: updates.metadata ? { ...existing.metadata, ...updates.metadata } : existing.metadata,
      };
      library = library.map((p, i) => (i === idx ? updated : p));
      return updated;
    },

    deletePrompt(id) {
      const idx = findIndex(id);
      if (idx === -1) return false;
      library = library.filter((p) => p.id !== id);
      return true;
    },

    toggleFavorite(id) {
      const idx = findIndex(id);
      if (idx === -1) return null;
      const updated = { ...library[idx], isFavorite: !library[idx].isFavorite };
      library = library.map((p, i) => (i === idx ? updated : p));
      return updated;
    },

    recordUse(id) {
      const idx = findIndex(id);
      if (idx === -1) return null;
      const updated = {
        ...library[idx],
        useCount: library[idx].useCount + 1,
        lastUsedAt: Date.now(),
      };
      library = library.map((p, i) => (i === idx ? updated : p));
      return updated;
    },

    search(filter) {
      return library.filter((p) => matchesFilter(p, filter));
    },

    getSorted(sortKey) {
      return sortPrompts([...library], sortKey);
    },

    getAllTags() {
      const tags = new Set<string>();
      for (const p of library) {
        for (const t of p.tags) tags.add(t);
      }
      return [...tags];
    },

    getAllCategories() {
      const cats = new Set<string>();
      for (const p of library) {
        if (p.category) cats.add(p.category);
      }
      return [...cats];
    },

    exportLibrary() {
      return {
        version: 1 as const,
        exportedAt: Date.now(),
        prompts: [...library],
      };
    },

    importLibrary(data) {
      const existingPrompts = new Set(library.map((p) => normalizePromptKey(p.prompt)));
      const newPrompts: SavedPrompt[] = [];
      for (const prompt of data.prompts) {
        const trimmedPrompt = prompt.prompt.trim();
        const key = normalizePromptKey(trimmedPrompt);
        if (!key || existingPrompts.has(key)) continue;
        const metadata = prompt.metadata ?? {};
        existingPrompts.add(key);
        newPrompts.push({
          ...prompt,
          id: generateId(),
          prompt: trimmedPrompt,
          title: (prompt.title ?? '').trim() || autoTitle(trimmedPrompt),
          tags: normalizeTags(prompt.tags ?? []),
          category: (prompt.category ?? '').trim(),
          metadata: { ...metadata },
        });
      }
      library = [...library, ...newPrompts];
      return newPrompts.length;
    },

    getState() {
      return [...library];
    },

    setState(prompts) {
      library = [...prompts];
    },
  };
}

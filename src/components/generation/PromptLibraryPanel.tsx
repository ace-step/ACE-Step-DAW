import { useCallback, useMemo, useRef, useState } from 'react';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { toastSuccess, toastError } from '../../hooks/useToast';
import { downloadBlob } from '../../services/browserDownload';
import type { PromptLibrarySortKey, PromptLibraryExport, SavedPrompt } from '../../types/promptLibrary';
import { Button } from '../ui/Button';

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PromptCard({
  prompt,
  onApply,
  onToggleFavorite,
  onDelete,
}: {
  prompt: SavedPrompt;
  onApply: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group rounded-lg border border-[#333] bg-[#232323] p-3 transition-colors hover:border-indigo-500/30"
      data-testid={`prompt-card-${prompt.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="truncate text-sm font-medium text-zinc-100">{prompt.title}</h3>
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`flex-shrink-0 transition-colors ${prompt.isFavorite ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400'}`}
              aria-label={prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <StarIcon filled={prompt.isFavorite} />
            </button>
          </div>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
            {prompt.prompt}
          </p>
        </div>
      </div>

      {/* Tags */}
      {prompt.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {prompt.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {tag}
            </span>
          ))}
          {prompt.tags.length > 5 && (
            <span className="text-[10px] text-zinc-500">+{prompt.tags.length - 5}</span>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
        {prompt.metadata.bpm && <span className="font-mono">{prompt.metadata.bpm} BPM</span>}
        {prompt.metadata.keyScale && <span>{prompt.metadata.keyScale}</span>}
        {prompt.category && <span>{prompt.category}</span>}
        {prompt.useCount > 0 && <span className="font-mono">Used {prompt.useCount}x</span>}
      </div>

      {/* Actions — visible on hover and keyboard focus-within */}
      <div className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-indigo-500/20 px-2.5 py-1 text-[11px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md bg-zinc-700/50 px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/20 focus:outline-none focus:ring-1 focus:ring-red-500/50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function PromptLibraryPanel() {
  const promptLibrary = useGenerationStore((s) => s.promptLibrary);
  const searchPromptLibrary = useGenerationStore((s) => s.searchPromptLibrary);
  const applyPromptFromLibrary = useGenerationStore((s) => s.applyPromptFromLibrary);
  const togglePromptLibraryFavorite = useGenerationStore((s) => s.togglePromptLibraryFavorite);
  const deleteFromPromptLibrary = useGenerationStore((s) => s.deleteFromPromptLibrary);
  const getPromptLibraryTags = useGenerationStore((s) => s.getPromptLibraryTags);
  const getPromptLibraryCategories = useGenerationStore((s) => s.getPromptLibraryCategories);
  const exportPromptLibrary = useGenerationStore((s) => s.exportPromptLibrary);
  const importPromptLibrary = useGenerationStore((s) => s.importPromptLibrary);
  const openGenerationPanelView = useUIStore((s) => s.openGenerationPanelView);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<PromptLibrarySortKey>('recent');
  const [filterTag, setFilterTag] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPrompts = useMemo(() => {
    const filtered = searchPromptLibrary({
      search: search || undefined,
      tags: filterTag ? [filterTag] : undefined,
      category: filterCategory || undefined,
      favoritesOnly: favoritesOnly || undefined,
    });

    // Apply sort to filtered results
    const sorted = [...filtered];
    switch (sortKey) {
      case 'recent':
        sorted.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        break;
      case 'mostUsed':
        sorted.sort((a, b) => b.useCount - a.useCount);
        break;
      case 'alphabetical':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'dateCreated':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    return sorted;
  }, [promptLibrary, search, filterTag, filterCategory, favoritesOnly, sortKey, searchPromptLibrary]);

  const allTags = useMemo(() => getPromptLibraryTags(), [promptLibrary]); // eslint-disable-line react-hooks/exhaustive-deps
  const allCategories = useMemo(() => getPromptLibraryCategories(), [promptLibrary]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback((id: string) => {
    const applied = applyPromptFromLibrary(id);
    if (applied) {
      toastSuccess('Prompt applied to generation form');
      openGenerationPanelView('textToMusic');
    }
  }, [applyPromptFromLibrary, openGenerationPanelView]);

  const handleDeleteRequest = useCallback((id: string) => {
    setConfirmDeleteId((prev) => (prev === id ? null : id));
  }, []);

  const handleDeleteConfirm = useCallback((id: string, title: string) => {
    deleteFromPromptLibrary(id);
    setConfirmDeleteId(null);
    toastSuccess(`Deleted "${title}"`);
  }, [deleteFromPromptLibrary]);

  const handleExport = useCallback(() => {
    const data = exportPromptLibrary();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `prompt-library-${new Date().toISOString().slice(0, 10)}.json`);
    toastSuccess(`Exported ${data.prompts.length} prompts`);
  }, [exportPromptLibrary]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as PromptLibraryExport;
      if (data.version !== 1 || !Array.isArray(data.prompts)) {
        toastError('Invalid prompt library file');
        return;
      }
      const count = importPromptLibrary(data);
      toastSuccess(`Imported ${count} new prompts`);
    } catch {
      toastError('Failed to import prompt library');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [importPromptLibrary]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3" data-testid="prompt-library-panel">
      <div className="space-y-3">
        {/* Search + Filters */}
        <div className="rounded-lg border border-[#333] bg-[#232323] p-3 space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
            placeholder="Search saved prompts..."
            aria-label="Search prompt library"
          />

          <div className="grid grid-cols-3 gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as PromptLibrarySortKey)}
              className="rounded-md border border-[#3a3a3a] bg-[#20242c] px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
              aria-label="Sort prompts"
            >
              <option value="recent">Recent</option>
              <option value="mostUsed">Most Used</option>
              <option value="alphabetical">A-Z</option>
              <option value="dateCreated">Newest</option>
            </select>

            {allTags.length > 0 && (
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="rounded-md border border-[#3a3a3a] bg-[#20242c] px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                aria-label="Filter by tag"
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            )}

            {allCategories.length > 0 && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-md border border-[#3a3a3a] bg-[#20242c] px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
                className="accent-indigo-500"
              />
              Favorites only
            </label>

            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={handleImport}
                className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
              >
                Import
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={promptLibrary.length === 0}
                className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
              >
                Export
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Import prompt library file"
            />
          </div>
        </div>

        {/* Results */}
        {filteredPrompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 text-3xl opacity-40">
              {promptLibrary.length === 0 ? '\uD83D\uDCDA' : '\uD83D\uDD0D'}
            </div>
            <p className="text-sm text-zinc-400">
              {promptLibrary.length === 0
                ? 'No saved prompts yet'
                : 'No prompts match your filters'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {promptLibrary.length === 0
                ? 'Save a prompt from the generation form to build your library.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] text-zinc-500">
              {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''}
            </div>
            {filteredPrompts.map((prompt) => (
              <div key={prompt.id}>
                <PromptCard
                  prompt={prompt}
                  onApply={() => handleApply(prompt.id)}
                  onToggleFavorite={() => togglePromptLibraryFavorite(prompt.id)}
                  onDelete={() => handleDeleteRequest(prompt.id)}
                />
                {confirmDeleteId === prompt.id && (
                  <div className="mt-1 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-950/20 px-3 py-1.5">
                    <span className="text-[11px] text-red-300">Delete "{prompt.title}"?</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteConfirm(prompt.id, prompt.title)}
                      className="rounded bg-red-500/30 px-2 py-0.5 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

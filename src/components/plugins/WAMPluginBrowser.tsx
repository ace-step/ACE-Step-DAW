/**
 * WAMPluginBrowser — Browse and load WAM 2.0 plugins.
 *
 * Displays the curated WAM plugin catalog with search, category filtering,
 * and the ability to load plugins from custom URLs.
 */
import { useCallback, useMemo, useState } from 'react';
import { useWAMStore } from '../../store/wamStore';
import type { WAMCatalogEntry } from '../../types/wam';

// ── Inline icons ──────────────────────────────────────────────────────────────
const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
  </svg>
);
const LinkIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

type CategoryFilter = 'all' | 'instrument' | 'effect';

interface WAMPluginBrowserProps {
  /** Called when the user loads a plugin — receives instanceId */
  onLoadPlugin?: (entry: WAMCatalogEntry) => void;
}

export function WAMPluginBrowser({ onLoadPlugin }: WAMPluginBrowserProps) {
  const hostStatus = useWAMStore((s) => s.hostStatus);
  const searchCatalog = useWAMStore((s) => s.searchCatalog);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const filtered = useMemo(() => {
    const cat = category === 'all' ? undefined : category;
    return searchCatalog(search, cat);
  }, [search, category, searchCatalog]);

  const handleLoad = useCallback(
    (entry: WAMCatalogEntry) => onLoadPlugin?.(entry),
    [onLoadPlugin],
  );

  const handleLoadCustomUrl = useCallback(() => {
    if (!customUrl.trim()) return;
    const entry: WAMCatalogEntry = {
      id: `custom-${Date.now()}`,
      name: 'Custom WAM Plugin',
      vendor: 'Custom',
      description: 'Plugin loaded from URL',
      category: 'effect',
      subcategory: 'custom',
      url: customUrl.trim(),
      tags: [],
    };
    onLoadPlugin?.(entry);
    setCustomUrl('');
    setShowUrlInput(false);
  }, [customUrl, onLoadPlugin]);

  // ── Not ready state ─────────────────────────────────────
  if (hostStatus !== 'ready') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 p-4 text-center"
        data-testid="wam-browser-not-ready"
      >
        <span className="text-[11px] text-zinc-400">
          {hostStatus === 'initializing'
            ? 'Initializing WAM host...'
            : hostStatus === 'error'
              ? 'WAM host initialization failed'
              : 'WAM host not initialized'}
        </span>
        {hostStatus === 'idle' && (
          <span className="text-[10px] text-zinc-500">
            Start playback to initialize the audio engine
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2" data-testid="wam-plugin-browser">
      {/* Search + URL load */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search WAM plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search WAM plugins"
            data-testid="wam-search"
            className="h-7 w-full rounded-md border border-white/10 bg-white/5 pl-7 pr-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
        </div>
        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          title="Load from URL"
          aria-label="Load plugin from URL"
          data-testid="wam-url-toggle"
          className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] transition-colors ${
            showUrlInput
              ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
              : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
          }`}
        >
          <LinkIcon className="h-3 w-3" />
          URL
        </button>
      </div>

      {/* Custom URL input */}
      {showUrlInput && (
        <div className="flex gap-1" data-testid="wam-url-input-section">
          <input
            type="url"
            placeholder="https://example.com/plugin/index.js"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadCustomUrl()}
            aria-label="WAM plugin URL"
            data-testid="wam-url-input"
            className="flex-1 h-7 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
          <button
            onClick={handleLoadCustomUrl}
            disabled={!customUrl.trim()}
            data-testid="wam-url-load-btn"
            className="rounded-md bg-violet-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
          >
            Load
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1" role="tablist" aria-label="WAM plugin category filter">
        {(['all', 'instrument', 'effect'] as const).map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={category === cat}
            onClick={() => setCategory(cat)}
            data-testid={`wam-category-tab-${cat}`}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
              category === cat
                ? 'bg-violet-600 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            {cat === 'all' ? 'All' : cat === 'instrument' ? 'Instruments' : 'Effects'}
          </button>
        ))}
      </div>

      {/* Plugin list */}
      {filtered.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-zinc-500" data-testid="wam-browser-empty">
          No WAM plugins found.
        </div>
      ) : (
        <div className="flex flex-col overflow-y-auto max-h-[300px]" data-testid="wam-plugin-list">
          {filtered.map((entry) => (
            <WAMPluginRow key={entry.id} entry={entry} onLoad={handleLoad} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single plugin row ──────────────────────────────────────────────────────────

function WAMPluginRow({
  entry,
  onLoad,
}: {
  entry: WAMCatalogEntry;
  onLoad: (entry: WAMCatalogEntry) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
      data-testid="wam-plugin-row"
      data-plugin-id={entry.id}
      title={`${entry.name} by ${entry.vendor} — ${entry.description}`}
    >
      {/* Category indicator */}
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          entry.category === 'instrument' ? 'bg-emerald-400' : 'bg-blue-400'
        }`}
      />
      <span className="flex-1 truncate">{entry.name}</span>
      <span className="shrink-0 text-[10px] text-zinc-500 max-w-[70px] truncate">
        {entry.subcategory}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLoad(entry);
        }}
        className="shrink-0 rounded bg-violet-600/60 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-violet-500"
        data-testid="wam-load-btn"
        title={`Load ${entry.name}`}
        aria-label={`Load ${entry.name}`}
      >
        Load
      </button>
    </div>
  );
}

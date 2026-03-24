import { useCallback, useMemo, useState } from 'react';
import { useVST3Store } from '../../store/vst3Store';
import type { VST3PluginInfo } from '../../types/vst3';

// ── Inline icons (no lucide-react dependency) ────────────────────────────────
const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
  </svg>
);
const RefreshIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 4v6h-6M1 20v-6h6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

type CategoryFilter = 'all' | 'instrument' | 'effect';
type SortKey = 'name' | 'vendor';

interface VST3PluginBrowserProps {
  /** Called when the user selects a plugin to load onto a track */
  onLoadPlugin?: (pluginId: string) => void;
}

export function VST3PluginBrowser({ onLoadPlugin }: VST3PluginBrowserProps) {
  const connectionStatus = useVST3Store((s) => s.connectionStatus);
  const plugins = useVST3Store((s) => s.plugins);
  const scanning = useVST3Store((s) => s.scanning);
  const scanProgress = useVST3Store((s) => s.scanProgress);
  const scanPlugins = useVST3Store((s) => s.scanPlugins);
  const connect = useVST3Store((s) => s.connect);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [groupByVendor, setGroupByVendor] = useState(false);

  // ── Filter + sort ───────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const list = plugins.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (
        term &&
        !p.name.toLowerCase().includes(term) &&
        !p.vendor.toLowerCase().includes(term) &&
        !p.subcategory.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'vendor') return a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [plugins, search, category, sortBy]);

  // ── Group by vendor ─────────────────────────────────────
  const grouped = useMemo(() => {
    if (!groupByVendor) return null;
    const map = new Map<string, VST3PluginInfo[]>();
    for (const p of filtered) {
      const list = map.get(p.vendor) ?? [];
      list.push(p);
      map.set(p.vendor, list);
    }
    return map;
  }, [filtered, groupByVendor]);

  const handleLoad = useCallback(
    (pluginId: string) => onLoadPlugin?.(pluginId),
    [onLoadPlugin],
  );

  // ── Disconnected state ──────────────────────────────────
  if (connectionStatus !== 'connected') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-6 text-center"
        data-testid="plugin-browser-disconnected"
      >
        <span className="text-sm text-zinc-400">Companion not connected</span>
        <button
          onClick={connect}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
          data-testid="plugin-browser-connect"
        >
          Connect
        </button>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────
  const isEmpty = plugins.length === 0 && !scanning;

  return (
    <div className="flex flex-col gap-2 p-2" data-testid="plugin-browser">
      {/* Search + Scan */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search plugins"
            data-testid="plugin-search"
            className="h-7 w-full rounded-md border border-white/10 bg-white/5 pl-7 pr-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
        </div>
        <button
          onClick={scanPlugins}
          disabled={scanning}
          title="Scan for plugins"
          aria-label="Scan plugins"
          data-testid="plugin-scan-btn"
          className="flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-zinc-300 hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshIcon className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
          Scan
        </button>
      </div>

      {/* Scan progress */}
      {scanning && scanProgress && (
        <div className="text-[10px] text-zinc-400" data-testid="scan-progress">
          Scanning {scanProgress.currentPlugin}... ({scanProgress.scanned}/{scanProgress.total})
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1" role="tablist" aria-label="Plugin category filter">
        {(['all', 'instrument', 'effect'] as const).map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={category === cat}
            onClick={() => setCategory(cat)}
            data-testid={`category-tab-${cat}`}
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

      {/* Sort + group controls */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
        <label className="flex items-center gap-1">
          Sort:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Sort plugins by"
            data-testid="plugin-sort"
            className="rounded border border-white/10 bg-transparent px-1 py-0.5 text-[10px] text-zinc-300 outline-none"
          >
            <option value="name">Name</option>
            <option value="vendor">Vendor</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={groupByVendor}
            onChange={(e) => setGroupByVendor(e.target.checked)}
            data-testid="group-by-vendor"
          />
          Group by vendor
        </label>
      </div>

      {/* Plugin list */}
      {isEmpty ? (
        <div className="py-6 text-center text-xs text-zinc-500" data-testid="plugin-browser-empty">
          No plugins found. Click Scan to discover VST3 plugins.
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-2 overflow-y-auto" data-testid="plugin-list-grouped">
          {Array.from(grouped.entries()).map(([vendor, vendorPlugins]) => (
            <div key={vendor}>
              <div className="sticky top-0 bg-[#0e0e24] px-1 py-0.5 text-[10px] font-semibold text-zinc-400">
                {vendor}
              </div>
              {vendorPlugins.map((p) => (
                <PluginRow key={p.id} plugin={p} onLoad={handleLoad} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col overflow-y-auto" data-testid="plugin-list">
          {filtered.map((p) => (
            <PluginRow key={p.id} plugin={p} onLoad={handleLoad} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single row ───────────────────────────────────────────────────────────────

function PluginRow({
  plugin,
  onLoad,
}: {
  plugin: VST3PluginInfo;
  onLoad: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 cursor-pointer"
      onDoubleClick={() => onLoad(plugin.id)}
      data-testid="plugin-row"
      data-plugin-id={plugin.id}
      title={`${plugin.name} by ${plugin.vendor}`}
    >
      <span className="flex-1 truncate">{plugin.name}</span>
      <span className="shrink-0 text-[10px] text-zinc-500 max-w-[80px] truncate">{plugin.vendor}</span>
      <span className="shrink-0 text-[10px] text-zinc-600">{plugin.subcategory}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLoad(plugin.id);
        }}
        className="shrink-0 rounded bg-violet-600/60 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-violet-500"
        data-testid="plugin-load-btn"
        title={`Load ${plugin.name}`}
        aria-label={`Load ${plugin.name}`}
      >
        Load
      </button>
    </div>
  );
}

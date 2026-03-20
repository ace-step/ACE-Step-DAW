import { useMemo, useState } from 'react';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';

function formatHistoryTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatHistoryDuration(duration: number) {
  return `${Math.max(0, Math.round(duration))}s`;
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'border-zinc-600/60 bg-zinc-700/30 text-zinc-200',
  generating: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-100',
  processing: 'border-amber-500/40 bg-amber-500/15 text-amber-100',
  done: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
  error: 'border-red-500/40 bg-red-500/15 text-red-100',
  cancelled: 'border-zinc-600/60 bg-zinc-700/20 text-zinc-300',
};

export function GenerationHistoryPanel() {
  const show = useUIStore((state) => state.showGenerationHistoryPanel);
  const setShow = useUIStore((state) => state.setShowGenerationHistoryPanel);
  const generationHistory = useGenerationStore((state) => state.generationHistory);
  const getGenerationHistoryRecords = useGenerationStore((state) => state.getGenerationHistoryRecords);
  const previewGenerationHistory = useGenerationStore((state) => state.previewGenerationHistory);
  const stopGenerationHistoryPreview = useGenerationStore((state) => state.stopGenerationHistoryPreview);
  const previewingHistoryId = useGenerationStore((state) => state.previewingHistoryId);

  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<'all' | '24h' | '7d' | '30d'>('all');

  const modelOptions = useMemo(
    () => [...new Set(generationHistory.map((entry) => entry.model).filter(Boolean))].sort(),
    [generationHistory],
  );
  const visibleEntries = useMemo(
    () => getGenerationHistoryRecords({
      model: modelFilter === 'all' ? undefined : modelFilter,
      search,
      timeRange,
    }),
    [getGenerationHistoryRecords, modelFilter, search, timeRange],
  );

  if (!show) return null;

  return (
    <aside
      className="fixed right-4 top-14 bottom-8 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#14161d]/95 shadow-2xl backdrop-blur"
      style={{ zIndex: Z.commandPalette }}
      aria-label="Generation history panel"
    >
      <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">Generation History</h2>
          <p className="text-[11px] text-zinc-400">Browse, audition, and drag past AI results back into the arrangement.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopGenerationHistoryPreview();
            setShow(false);
          }}
          className="ml-auto text-lg leading-none text-zinc-400 transition-colors hover:text-zinc-200"
          aria-label="Close generation history panel"
        >
          &times;
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-white/10 px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500"
          placeholder="Search prompt, model, track, status"
          aria-label="Search generation history"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
            className="rounded-md border border-[#3a3a3a] bg-[#20242c] px-2 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
            aria-label="Filter history by model"
          >
            <option value="all">All models</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <select
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as 'all' | '24h' | '7d' | '30d')}
            className="rounded-md border border-[#3a3a3a] bg-[#20242c] px-2 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
            aria-label="Filter history by time range"
          >
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {visibleEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-[11px] text-zinc-400">
            No generation history matches the current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEntries.map((entry) => {
              const isPlayable = entry.status === 'done' && Boolean(entry.audioKey);
              const isPreviewing = previewingHistoryId === entry.id;
              return (
                <div
                  key={entry.id}
                  draggable={isPlayable}
                  onDragStart={(event) => {
                    if (!isPlayable) return;
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('application/x-generation-history-id', entry.id);
                  }}
                  className={`rounded-lg border px-3 py-3 transition-colors ${
                    isPlayable ? 'cursor-grab border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]' : 'border-white/6 bg-white/[0.02]'
                  }`}
                  data-testid={`generation-history-entry-${entry.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-100">{entry.prompt}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${STATUS_STYLES[entry.status] ?? STATUS_STYLES.queued}`}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                        <span>{formatHistoryTimestamp(entry.updatedAt)}</span>
                        <span>Model {entry.model || 'unknown'}</span>
                        <span>{formatHistoryDuration(entry.duration)}</span>
                        <span>{entry.trackName}</span>
                      </div>
                      {entry.error && (
                        <div className="mt-2 text-[11px] text-red-300">{entry.error}</div>
                      )}
                    </div>

                    {isPlayable && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isPreviewing) {
                            stopGenerationHistoryPreview();
                            return;
                          }
                          void previewGenerationHistory(entry.id);
                        }}
                        className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          isPreviewing
                            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                            : 'border-[#4b4b4b] bg-[#20242c] text-zinc-200 hover:border-emerald-500/40 hover:text-white'
                        }`}
                        aria-label={`${isPreviewing ? 'Stop previewing generation' : 'Preview generation'} ${entry.prompt}`}
                      >
                        {isPreviewing ? 'Stop' : 'Preview'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

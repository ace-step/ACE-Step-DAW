import { useState, useMemo } from 'react';
import { useGenerationStore } from '../../store/generationStore';

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface PromptHistoryPanelProps {
  onSelectPrompt?: (prompt: string) => void;
}

export function PromptHistoryPanel({ onSelectPrompt }: PromptHistoryPanelProps) {
  const promptHistory = useGenerationStore((s) => s.promptHistory);
  const clearPromptHistory = useGenerationStore((s) => s.clearPromptHistory);
  const [search, setSearch] = useState('');

  const sorted = useMemo(
    () => [...promptHistory].sort((a, b) => b.timestamp - a.timestamp),
    [promptHistory],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((e) => e.prompt.toLowerCase().includes(q));
  }, [sorted, search]);

  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="prompt-history-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
          Prompt History
        </span>
        {promptHistory.length > 0 && (
          <button
            type="button"
            onClick={clearPromptHistory}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Clear prompt history"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search */}
      {promptHistory.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompts…"
          className="w-full rounded-md border border-[#3a3a3a] bg-[#161618] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/50"
        />
      )}

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-zinc-600">
          {promptHistory.length === 0 ? 'No prompts yet' : 'No matches'}
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid={`prompt-history-item-${entry.id}`}
              onClick={() => onSelectPrompt?.(entry.prompt)}
              className="flex flex-col gap-0.5 rounded-md border border-transparent bg-[#1e1e22] px-2.5 py-2 text-left transition-colors hover:border-zinc-600 hover:bg-[#252528] cursor-pointer"
            >
              <span className="text-[11px] text-zinc-200 line-clamp-2">{entry.prompt}</span>
              <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                <span>{formatRelativeTime(entry.timestamp)}</span>
                {entry.trackName && (
                  <span className="text-zinc-400">{entry.trackName}</span>
                )}
                {entry.bpm && <span>{entry.bpm} BPM</span>}
                {entry.keyScale && <span>{entry.keyScale}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

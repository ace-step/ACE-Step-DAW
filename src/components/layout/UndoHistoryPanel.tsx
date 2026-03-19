import { useEffect, useMemo, useState } from 'react';
import { useProjectStore, type HistoryScope } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

const HISTORY_SCOPE_LABELS: Record<HistoryScope, string> = {
  arrangement: 'Arrangement',
  track: 'Track',
  pianoRoll: 'Piano Roll',
  mixer: 'Mixer',
};

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function UndoHistoryPanel() {
  const project = useProjectStore((s) => s.project);
  const getUndoHistory = useProjectStore((s) => s.getUndoHistory);
  const jumpToHistoryEntry = useProjectStore((s) => s.jumpToHistoryEntry);
  const showUndoHistoryPanel = useUIStore((s) => s.showUndoHistoryPanel);
  const setShowUndoHistoryPanel = useUIStore((s) => s.setShowUndoHistoryPanel);
  const historyFocusScope = useUIStore((s) => s.historyFocusScope);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const [selectedScope, setSelectedScope] = useState<HistoryScope>(historyFocusScope);

  useEffect(() => {
    if (showUndoHistoryPanel) {
      setSelectedScope(historyFocusScope);
    }
  }, [historyFocusScope, showUndoHistoryPanel]);

  const entries = useMemo(
    () => getUndoHistory(selectedScope).slice().reverse(),
    [getUndoHistory, project, selectedScope],
  );

  if (!showUndoHistoryPanel) return null;

  return (
    <div className="fixed right-4 top-14 z-[160] w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#141426]/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">History</div>
          <div className="text-[10px] text-zinc-500">Cmd/Ctrl+Z follows the active scope.</div>
        </div>
        <button
          aria-label="Close undo history panel"
          className="ml-auto text-sm text-zinc-500 transition-colors hover:text-zinc-200"
          onClick={() => setShowUndoHistoryPanel(false)}
        >
          ×
        </button>
      </div>

      <div className="flex gap-1 border-b border-white/10 px-2 py-2">
        {Object.entries(HISTORY_SCOPE_LABELS).map(([scope, label]) => {
          const isActive = selectedScope === scope;
          return (
            <button
              key={scope}
              aria-label={`Show ${label} history`}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                isActive ? 'bg-daw-accent text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
              onClick={() => {
                setSelectedScope(scope as HistoryScope);
                setHistoryFocusScope(scope as HistoryScope);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[420px] overflow-y-auto px-2 py-2">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-500">
            No undo checkpoints in {HISTORY_SCOPE_LABELS[selectedScope].toLowerCase()} scope yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {entries.map((entry, index) => (
              <button
                key={entry.id}
                aria-label={`Jump to ${entry.label}`}
                className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                onClick={() => {
                  jumpToHistoryEntry(entry.id, selectedScope);
                  setHistoryFocusScope(selectedScope);
                }}
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] text-zinc-500">
                  {entries.length - index}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-zinc-200">{entry.label}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    {formatTimestamp(entry.timestamp)}
                    {entry.trackId ? ' • Track' : ''}
                    {entry.clipId ? ' • Clip' : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

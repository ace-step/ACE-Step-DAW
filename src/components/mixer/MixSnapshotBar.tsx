import React, { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { MixSnapshot } from '../../types/project';

const EMPTY_SNAPSHOTS: MixSnapshot[] = [];

/** Compact mix-snapshot toolbar embedded in the mixer status bar. */
export const MixSnapshotBar = React.memo(function MixSnapshotBar() {
  const snapshots = useProjectStore((s) => s.project?.mixSnapshots ?? EMPTY_SNAPSHOTS);
  useProjectStore((s) => s.abCompareRevision);
  const saveMixSnapshot = useProjectStore((s) => s.saveMixSnapshot);
  const loadMixSnapshot = useProjectStore((s) => s.loadMixSnapshot);
  const deleteMixSnapshot = useProjectStore((s) => s.deleteMixSnapshot);
  const renameMixSnapshot = useProjectStore((s) => s.renameMixSnapshot);
  const toggleAbCompare = useProjectStore((s) => s.toggleAbCompare);

  // Read A/B state via getState() — these use module-level vars, not store state.
  // Re-renders are triggered by project state changes that happen during A/B toggle.
  const store = useProjectStore.getState();
  const abActive = store.isAbComparing();
  const abSnapshotId = store.getAbActiveSnapshotId();

  const [expanded, setExpanded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const name = `Snapshot ${snapshots.length + 1}`;
    try {
      saveMixSnapshot(name);
    } catch {
      // Viewer mode and empty project states reject write actions.
    }
  }, [snapshots.length, saveMixSnapshot]);

  const handleStartRename = useCallback((snapshot: MixSnapshot) => {
    setRenamingId(snapshot.id);
    setRenameValue(snapshot.name);
    requestAnimationFrame(() => renameInputRef.current?.select());
  }, []);

  const handleFinishRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameMixSnapshot(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameMixSnapshot]);

  return (
    <div className="flex items-center gap-1" data-testid="mix-snapshot-bar">
      {/* Save button */}
      <button
        onClick={handleSave}
        title="Save current mix as snapshot"
        aria-label="Save mix snapshot"
        data-testid="save-mix-snapshot-btn"
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:bg-[#383838] hover:text-zinc-200 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 9H2a1 1 0 01-1-1V2a1 1 0 011-1h4.5L9 3.5V8a1 1 0 01-1 1z" />
          <path d="M7 9V6H3v3" />
          <path d="M3 1v2h3" />
        </svg>
        <span>Save</span>
      </button>

      {/* Snapshot count / expand toggle */}
      {snapshots.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse snapshot list' : `Show ${snapshots.length} snapshot(s)`}
          aria-label={expanded ? 'Collapse snapshots' : 'Expand snapshots'}
          aria-expanded={expanded}
          data-testid="toggle-snapshot-list-btn"
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:bg-[#383838] hover:text-zinc-200 transition-colors"
        >
          <span>{snapshots.length}</span>
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="2,3 4,5 6,3" />
          </svg>
        </button>
      )}

      {/* A/B indicator */}
      {abActive && (
        <span
          className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-600/30 text-amber-300 border border-amber-600/40"
          data-testid="ab-indicator"
        >
          A/B
        </span>
      )}

      {/* Expanded snapshot list */}
      {expanded && snapshots.length > 0 && (
        <div
          className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-[#2a2a2a] border border-[#444] rounded shadow-lg z-50"
          data-testid="snapshot-list-panel"
        >
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className={`flex items-center gap-1 px-2 py-1.5 text-[11px] border-b border-[#333] last:border-b-0 group ${
                abSnapshotId === snapshot.id ? 'bg-amber-700/20' : 'hover:bg-[#333]'
              }`}
              data-testid={`snapshot-item-${snapshot.id}`}
            >
              {renamingId === snapshot.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishRename();
                    if (e.key === 'Escape') {
                      setRenamingId(null);
                      setRenameValue('');
                    }
                  }}
                  className="flex-1 min-w-0 bg-[#1a1a1a] border border-[#555] rounded px-1 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                  data-testid="snapshot-rename-input"
                />
              ) : (
                <span
                  className="flex-1 min-w-0 truncate text-zinc-300 cursor-pointer"
                  onDoubleClick={() => handleStartRename(snapshot)}
                  title={`${snapshot.name} — double-click to rename`}
                >
                  {snapshot.name}
                </span>
              )}

              {/* Load button */}
              <button
                onClick={() => loadMixSnapshot(snapshot.id)}
                title={`Load "${snapshot.name}"`}
                aria-label={`Load snapshot ${snapshot.name}`}
                data-testid={`load-snapshot-${snapshot.id}`}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-[#444] hover:text-zinc-200 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <polyline points="2,6 5,9 8,6" />
                  <line x1="5" y1="1" x2="5" y2="9" />
                </svg>
              </button>

              {/* A/B toggle button */}
              <button
                onClick={() => toggleAbCompare(snapshot.id)}
                title={abSnapshotId === snapshot.id ? 'Exit A/B comparison' : `A/B compare with "${snapshot.name}"`}
                aria-label={`Toggle A/B compare ${snapshot.name}`}
                data-testid={`ab-snapshot-${snapshot.id}`}
                className={`flex h-5 items-center justify-center rounded px-1 text-[9px] font-bold transition-colors opacity-0 group-hover:opacity-100 ${
                  abSnapshotId === snapshot.id
                    ? 'bg-amber-600/40 text-amber-200 opacity-100'
                    : 'text-zinc-500 hover:bg-[#444] hover:text-zinc-200'
                }`}
              >
                A/B
              </button>

              {/* Delete button */}
              <button
                onClick={() => deleteMixSnapshot(snapshot.id)}
                title={`Delete "${snapshot.name}"`}
                aria-label={`Delete snapshot ${snapshot.name}`}
                data-testid={`delete-snapshot-${snapshot.id}`}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-red-900/40 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="1" y1="1" x2="7" y2="7" />
                  <line x1="7" y1="1" x2="1" y2="7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

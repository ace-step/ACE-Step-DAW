/**
 * Groove Templates Panel — browse, rename, delete, and configure
 * groove templates stored in the project's groovePool.
 *
 * The panel displays each groove template with its name, grid size,
 * and length. Users can rename (double-click), delete, and adjust
 * the application strength.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { GrooveTemplate } from '../../types/project';

// ─── Helpers ──────────────────────────────────────────────────────────────

function gridBeatsToNotation(gridBeats: number): string {
  if (gridBeats >= 1) return '1/4';
  if (gridBeats >= 0.5) return '1/8';
  if (gridBeats >= 0.25) return '1/16';
  if (gridBeats >= 0.125) return '1/32';
  return `${gridBeats}`;
}

// ─── Groove Row ───────────────────────────────────────────────────────────

function GrooveRow({
  groove,
  onDelete,
  onRename,
  onApply,
}: {
  groove: GrooveTemplate;
  onDelete: () => void;
  onRename: (name: string) => void;
  onApply: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(groove.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const handleDoubleClick = useCallback(() => {
    setEditValue(groove.name);
    setEditing(true);
  }, [groove.name]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== groove.name) {
      onRename(trimmed);
    }
    setEditing(false);
  }, [editValue, groove.name, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(groove.name);
    }
  }, [commitRename, groove.name]);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800/40 rounded transition-colors group">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
            className="w-full px-1 py-0.5 text-[10px] bg-zinc-800 border border-zinc-600 rounded text-zinc-200 focus:outline-none focus:border-zinc-400"
          />
        ) : (
          <div
            className="text-[10px] text-zinc-200 truncate cursor-default"
            onDoubleClick={handleDoubleClick}
          >
            {groove.name}
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-zinc-500">
            {gridBeatsToNotation(groove.gridBeats)} grid
          </span>
          <span className="text-[9px] text-zinc-500">
            {groove.lengthBeats} beats
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onApply}
        className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-700/30 text-emerald-300 hover:bg-emerald-600/40 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Apply groove template"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px]"
        aria-label="Delete groove template"
      >
        ×
      </button>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────

export function GrooveTemplatesPanel() {
  const groovePool = useProjectStore((s) => s.project?.groovePool ?? []);
  const deleteGrooveTemplate = useProjectStore((s) => s.deleteGrooveTemplate);
  const renameGrooveTemplate = useProjectStore((s) => s.renameGrooveTemplate);
  const applyGrooveToClip = useProjectStore((s) => s.applyGrooveToClip);
  const strength = useUIStore((s) => s.grooveStrength);
  const setStrength = useUIStore((s) => s.setGrooveStrength);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const selectedNoteIds = useUIStore((s) => s.selectedPianoRollNoteIds);

  const handleApplyGroove = useCallback((grooveId: string) => {
    if (!openClipId) return;
    const noteIds = selectedNoteIds.length > 0
      ? selectedNoteIds
      : (() => {
          // If no notes selected, apply to all notes in the clip
          const project = useProjectStore.getState().project;
          if (!project) return [];
          for (const track of project.tracks) {
            const clip = track.clips.find((c) => c.id === openClipId);
            if (clip?.midiData) return clip.midiData.notes.map((n) => n.id);
          }
          return [];
        })();
    if (noteIds.length === 0) return;
    applyGrooveToClip(openClipId, noteIds, grooveId, { strength });
  }, [openClipId, selectedNoteIds, strength, applyGrooveToClip]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-zinc-700/50">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          Groove Pool
        </div>
      </div>

      {/* Strength slider */}
      <div className="px-2 py-1.5 border-b border-zinc-700/30 flex items-center gap-2">
        <label className="text-[9px] text-zinc-500" htmlFor="groove-strength">
          Strength
        </label>
        <input
          id="groove-strength"
          type="range"
          min={0}
          max={100}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="flex-1 h-1 accent-zinc-400"
          aria-label="Groove strength"
        />
        <span className="text-[9px] text-zinc-400 w-7 text-right font-mono">
          {strength}%
        </span>
      </div>

      {/* Groove list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {groovePool.length === 0 ? (
          <div className="text-[10px] text-zinc-500 text-center py-4">
            No groove templates yet.
            <br />
            <span className="text-[9px]">
              Extract from a MIDI clip via right-click menu.
            </span>
          </div>
        ) : (
          groovePool.map((groove) => (
            <GrooveRow
              key={groove.id}
              groove={groove}
              onDelete={() => deleteGrooveTemplate(groove.id)}
              onRename={(name) => renameGrooveTemplate(groove.id, name)}
              onApply={() => handleApplyGroove(groove.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

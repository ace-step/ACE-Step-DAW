import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore, comboEquals, exportShortcutBindings } from '../../store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES, SHORTCUT_ACTION_MAP } from '../../constants/shortcutDefaults';
import { SHORTCUT_PRESETS } from '../../constants/shortcutPresets';
import type { KeyCombo, ShortcutCategory } from '../../types/shortcuts';
import { comboToDisplay, keyEventToCombo, parseShortcutBindings } from '../../utils/shortcutUtils';

// ── Shortcut Row ─────────────────────────────────────────────────

interface RowProps {
  actionId: string;
  label: string;
  combo: KeyCombo;
  defaultCombo: KeyCombo;
  isRecording: boolean;
  conflictLabel: string | null;
  unsafeReason: string | null;
  contextsLabel: string;
  onStartRecord: () => void;
  onReset: () => void;
}

function ShortcutRow({
  actionId,
  label,
  combo,
  defaultCombo,
  isRecording,
  conflictLabel,
  unsafeReason,
  contextsLabel,
  onStartRecord,
  onReset,
}: RowProps) {
  const isCustom = !comboEquals(combo, defaultCombo);

  return (
    <div
      className={`flex items-center gap-3 px-2 py-1.5 rounded ${
        isRecording ? 'bg-daw-accent/20 ring-1 ring-daw-accent' : 'hover:bg-white/5'
      }`}
      data-action-id={actionId}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-300 truncate">{label}</div>
        <div className="text-[10px] text-zinc-400 truncate">{contextsLabel}</div>
        {conflictLabel && (
          <div className="text-[10px] text-amber-400 truncate">
            Conflicts with {conflictLabel}
          </div>
        )}
        {unsafeReason && (
          <div className="text-[10px] text-red-400 truncate">
            {unsafeReason}
          </div>
        )}
      </div>

      <button
        onClick={onStartRecord}
        className={`flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded border text-xs transition-colors ${
          isRecording
            ? 'border-daw-accent text-daw-accent animate-pulse'
            : unsafeReason
              ? 'border-red-500/60 text-red-200 hover:border-red-400'
              : 'border-zinc-600 text-zinc-300 hover:border-zinc-400'
        }`}
        title="Click to rebind, then press a key combo"
      >
        {isRecording ? (
          <span>Press a key…</span>
        ) : (
          <span>{comboToDisplay(combo)}</span>
        )}
      </button>

      {isCustom && (
        <button
          onClick={onReset}
          className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
          title={`Reset to default: ${comboToDisplay(defaultCombo)}`}
        >
          ↺
        </button>
      )}
    </div>
  );
}

// ── Main Dialog ──────────────────────────────────────────────────

export function ShortcutEditorDialog() {
  const show = useUIStore((s) => s.showShortcutEditorDialog);
  const setShow = useUIStore((s) => s.setShowShortcutEditorDialog);

  const overrides = useShortcutsStore((s) => s.overrides);
  const activePresetId = useShortcutsStore((s) => s.activePresetId);
  const getCombo = useShortcutsStore((s) => s.getCombo);
  const setBinding = useShortcutsStore((s) => s.setBinding);
  const clearBinding = useShortcutsStore((s) => s.clearBinding);
  const applyPreset = useShortcutsStore((s) => s.applyPreset);
  const resetAll = useShortcutsStore((s) => s.resetAll);
  const findConflict = useShortcutsStore((s) => s.findConflict);
  const getUnsafeReason = useShortcutsStore((s) => s.getUnsafeReason);
  const importBindings = useShortcutsStore((s) => s.importBindings);

  const [activeCategory, setActiveCategory] = useState<ShortcutCategory>('transport');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Key capture while recording ────────────────────────────────
  useEffect(() => {
    if (!recordingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setRecordingId(null);
        return;
      }

      const combo = keyEventToCombo(e);
      if (!combo) return;

      try {
        setBinding(recordingId, combo);
        setErrorMessage(null);
        setRecordingId(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to assign that shortcut.');
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId, setBinding]);

  // Close dialog on Escape when not recording
  useEffect(() => {
    if (!show || recordingId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setShow(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, recordingId, setShow]);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      setErrorMessage(null);
      if (presetId === 'ace-step') {
        resetAll();
      } else {
        applyPreset(presetId);
      }
    },
    [applyPreset, resetAll],
  );

  const handleExport = useCallback(async () => {
    const contents = exportShortcutBindings();
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ace-step-shortcuts.json';
    link.click();
    URL.revokeObjectURL(url);

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(contents);
      } catch {
        // Ignore clipboard failures; the download already succeeded.
      }
    }
  }, []);

  const handleImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      importBindings(parseShortcutBindings(raw));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to import shortcut preset.');
    }
  }, [importBindings]);

  if (!show) return null;

  const lowerQuery = searchQuery.toLowerCase();
  const filteredActions = searchQuery
    ? SHORTCUT_ACTIONS.filter((a) => a.label.toLowerCase().includes(lowerQuery))
    : SHORTCUT_ACTIONS.filter((a) => a.category === activeCategory);

  const customCount = Object.keys(overrides).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setRecordingId(null);
          setShow(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shortcut Editor"
        className="w-[620px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-daw-border">
          <h2 className="text-sm font-semibold text-zinc-100">Shortcut Editor</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Preset selector + search ────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-daw-border">
          <label className="text-[10px] uppercase tracking-widest text-zinc-400">Preset</label>
          <select
            value={activePresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="flex-1 bg-daw-bg border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-daw-accent"
          >
            {SHORTCUT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {activePresetId === 'custom' && (
              <option value="custom">Custom</option>
            )}
          </select>

          <input
            type="text"
            placeholder="Search shortcuts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[160px] bg-daw-bg border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-daw-accent"
          />
        </div>

        <div className="flex items-center gap-2 px-5 py-2 border-b border-daw-border">
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-3 py-1 text-[10px] rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400"
          >
            Import JSON
          </button>
          <button
            onClick={() => void handleExport()}
            className="px-3 py-1 text-[10px] rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400"
          >
            Export JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const [file] = Array.from(e.target.files ?? []);
              void handleImportFile(file ?? null);
              e.currentTarget.value = '';
            }}
          />
          <div className="ml-auto text-[10px] text-zinc-400">
            Presets for ACE-Step, Ableton, Logic, FL Studio, and Pro Tools
          </div>
        </div>

        {errorMessage && (
          <div className="px-5 py-2 border-b border-red-500/20 bg-red-950/20 text-[11px] text-red-300">
            {errorMessage}
          </div>
        )}

        {/* ── Category tabs (hidden when searching) ───────────────── */}
        {!searchQuery && (
          <div className="flex gap-1 px-5 pt-2 overflow-x-auto">
            {SHORTCUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-daw-accent text-white'
                    : 'text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Shortcut list ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-0.5">
          {filteredActions.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-8">No shortcuts match your search.</p>
          )}
          {filteredActions.map((action) => {
            const combo = getCombo(action.id);
            const conflictId = findConflict(combo, action.id);
            const conflictLabel = conflictId ? SHORTCUT_ACTION_MAP[conflictId]?.label ?? null : null;
            const unsafeReason = getUnsafeReason(combo);
            const contextsLabel = action.contexts?.length
              ? `Contexts: ${action.contexts.join(', ')}`
              : 'Contexts: global';

            return (
              <ShortcutRow
                key={action.id}
                actionId={action.id}
                label={action.label}
                combo={combo}
                defaultCombo={action.defaultCombo}
                isRecording={recordingId === action.id}
                conflictLabel={conflictLabel}
                unsafeReason={unsafeReason}
                contextsLabel={contextsLabel}
                onStartRecord={() => setRecordingId(action.id)}
                onReset={() => {
                  clearBinding(action.id);
                  setErrorMessage(null);
                }}
              />
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-daw-border">
          <p className="text-[10px] text-zinc-600">
            {customCount > 0
              ? `${customCount} custom binding${customCount > 1 ? 's' : ''}`
              : 'All shortcuts at defaults'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetAll();
                setErrorMessage(null);
              }}
              className="px-3 py-1 text-[10px] rounded border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-400 transition-colors"
            >
              Reset All
            </button>
            <button
              onClick={() => setShow(false)}
              className="px-3 py-1 text-[10px] rounded bg-daw-accent text-white hover:brightness-110 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

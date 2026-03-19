import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore, comboEquals } from '../../store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES, SHORTCUT_ACTION_MAP } from '../../constants/shortcutDefaults';
import { SHORTCUT_PRESETS } from '../../constants/shortcutPresets';
import type { KeyCombo, ShortcutCategory } from '../../types/shortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// ── Helpers ──────────────────────────────────────────────────────

function comboToDisplay(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (combo.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (combo.alt) parts.push(isMac ? '⌥' : 'Alt');
  parts.push(codeToLabel(combo.code));
  return parts.join(' + ');
}

function codeToLabel(code: string): string {
  const map: Record<string, string> = {
    Space: 'Space', Enter: '↵', Backspace: '⌫', Delete: 'Del',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Home: 'Home', End: 'End', Escape: 'Esc',
    Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
    Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
    Numpad0: 'Num0', NumpadAdd: 'Num+', NumpadSubtract: 'Num-',
    NumpadEnter: 'Num↵',
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  return code;
}

function keyEventToCombo(e: KeyboardEvent): KeyCombo | null {
  // Ignore bare modifier keys
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return null;
  return {
    code: e.code,
    mod: e.metaKey || e.ctrlKey || undefined,
    shift: e.shiftKey || undefined,
    alt: e.altKey || undefined,
  };
}

// ── Key Badge ────────────────────────────────────────────────────

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#444] border border-zinc-600 text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

// ── Shortcut Row ─────────────────────────────────────────────────

interface RowProps {
  actionId: string;
  label: string;
  combo: KeyCombo;
  defaultCombo: KeyCombo;
  isRecording: boolean;
  conflictLabel: string | null;
  onStartRecord: () => void;
  onReset: () => void;
}

function ShortcutRow({ actionId, label, combo, defaultCombo, isRecording, conflictLabel, onStartRecord, onReset }: RowProps) {
  const isCustom = !comboEquals(combo, defaultCombo);

  return (
    <div
      className={`flex items-center gap-3 px-2 py-1.5 rounded ${
        isRecording ? 'bg-daw-accent/20 ring-1 ring-daw-accent' : 'hover:bg-white/5'
      }`}
      data-action-id={actionId}
    >
      <span className="text-xs text-zinc-400 flex-1 truncate">{label}</span>

      {conflictLabel && (
        <span className="text-[10px] text-amber-400 truncate max-w-[120px]">
          conflicts with {conflictLabel}
        </span>
      )}

      <button
        onClick={onStartRecord}
        className={`flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded border text-xs transition-colors ${
          isRecording
            ? 'border-daw-accent text-daw-accent animate-pulse'
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
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
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

  const [activeCategory, setActiveCategory] = useState<ShortcutCategory>('transport');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

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

      setBinding(recordingId, combo);
      setRecordingId(null);
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
      if (presetId === 'ace-step') {
        resetAll();
      } else {
        applyPreset(presetId);
      }
    },
    [applyPreset, resetAll],
  );

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
        className="w-[620px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-daw-border">
          <h2 className="text-sm font-semibold text-zinc-100">Shortcut Editor</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Preset selector + search ────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-daw-border">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">Preset</label>
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
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
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
            <p className="text-xs text-zinc-500 text-center py-8">No shortcuts match your search.</p>
          )}
          {filteredActions.map((action) => {
            const combo = getCombo(action.id);
            const conflictId = findConflict(combo, action.id);
            const conflictLabel = conflictId ? SHORTCUT_ACTION_MAP[conflictId]?.label ?? null : null;

            return (
              <ShortcutRow
                key={action.id}
                actionId={action.id}
                label={action.label}
                combo={combo}
                defaultCombo={action.defaultCombo}
                isRecording={recordingId === action.id}
                conflictLabel={conflictLabel}
                onStartRecord={() => setRecordingId(action.id)}
                onReset={() => clearBinding(action.id)}
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
              onClick={resetAll}
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

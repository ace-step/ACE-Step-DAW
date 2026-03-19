import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore, comboEquals } from '../../store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES, SHORTCUT_ACTION_MAP } from '../../constants/shortcutDefaults';
import { SHORTCUT_PRESETS } from '../../constants/shortcutPresets';
import type { BrowserShortcutRule, KeyCombo, ShortcutCategory } from '../../types/shortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function codeToLabel(code: string): string {
  const map: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Home: 'Home',
    End: 'End',
    Escape: 'Esc',
    Equal: '=',
    Minus: '-',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Digit0: '0',
    Digit1: '1',
    Digit2: '2',
    Digit3: '3',
    Digit4: '4',
    Digit5: '5',
    Digit6: '6',
    Digit7: '7',
    Digit8: '8',
    Digit9: '9',
    Numpad0: 'Num0',
    NumpadAdd: 'Num+',
    NumpadSubtract: 'Num-',
    NumpadEnter: 'NumEnter',
    F1: 'F1',
    F2: 'F2',
    F3: 'F3',
    F4: 'F4',
    F5: 'F5',
    F6: 'F6',
    F7: 'F7',
    F8: 'F8',
    F9: 'F9',
    F10: 'F10',
    F11: 'F11',
    F12: 'F12',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  return code;
}

function comboToDisplay(combo: KeyCombo | undefined): string {
  if (!combo?.code) return 'Unassigned';
  const parts: string[] = [];
  if (combo.mod) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push(isMac ? 'Option' : 'Alt');
  parts.push(codeToLabel(combo.code));
  return parts.join(' + ');
}

function keyEventToCombo(e: KeyboardEvent): KeyCombo | null {
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return null;
  return {
    code: e.code,
    mod: e.metaKey || e.ctrlKey || undefined,
    shift: e.shiftKey || undefined,
    alt: e.altKey || undefined,
  };
}

function StatusPill({
  tone,
  text,
}: {
  tone: 'warning' | 'error' | 'custom';
  text: string;
}) {
  const className =
    tone === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-300'
      : tone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-daw-accent/40 bg-daw-accent/10 text-daw-accent';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {text}
    </span>
  );
}

interface RowProps {
  actionId: string;
  label: string;
  combo: KeyCombo;
  defaultCombo: KeyCombo;
  isRecording: boolean;
  browserConflict: BrowserShortcutRule | null;
  conflictLabel: string | null;
  onStartRecord: () => void;
  onReset: () => void;
}

function ShortcutRow({
  actionId,
  label,
  combo,
  defaultCombo,
  isRecording,
  browserConflict,
  conflictLabel,
  onStartRecord,
  onReset,
}: RowProps) {
  const isCustom = !comboEquals(combo, defaultCombo);
  const conflictTone = browserConflict?.severity === 'error' ? 'error' : 'warning';

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        isRecording
          ? 'border-daw-accent bg-daw-accent/10'
          : browserConflict?.severity === 'error'
            ? 'border-red-500/30 bg-red-500/5'
            : conflictLabel || browserConflict
              ? 'border-amber-500/20 bg-amber-500/5'
              : 'border-white/5 hover:border-white/10 hover:bg-white/5'
      }`}
      data-action-id={actionId}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs text-zinc-100">{label}</span>
            {isCustom && <StatusPill tone="custom" text="Custom" />}
            {conflictLabel && <StatusPill tone="warning" text="Conflict" />}
            {browserConflict && <StatusPill tone={conflictTone} text={browserConflict.severity} />}
          </div>
          <div className="mt-1 space-y-1">
            {conflictLabel && (
              <p className="text-[11px] text-amber-300">
                Shares {comboToDisplay(combo)} with {conflictLabel}.
              </p>
            )}
            {browserConflict && (
              <p className={`text-[11px] ${browserConflict.severity === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                {browserConflict.reason}
                {browserConflict.suggestion ? ` Try ${comboToDisplay(browserConflict.suggestion)} instead.` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onStartRecord}
            aria-label={`Rebind ${label}`}
            className={`min-w-[8rem] rounded border px-2 py-1 text-xs transition-colors ${
              isRecording
                ? 'border-daw-accent text-daw-accent'
                : 'border-zinc-600 text-zinc-200 hover:border-zinc-400'
            }`}
            title="Click to rebind, then press a key combo"
          >
            {isRecording ? 'Press a key…' : comboToDisplay(combo)}
          </button>

          {isCustom && (
            <button
              onClick={onReset}
              aria-label={`Reset ${label}`}
              className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
              title={`Reset to ${comboToDisplay(defaultCombo)}`}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const findBrowserConflict = useShortcutsStore((s) => s.findBrowserConflict);
  const exportBindings = useShortcutsStore((s) => s.exportBindings);
  const importBindings = useShortcutsStore((s) => s.importBindings);

  const [activeCategory, setActiveCategory] = useState<ShortcutCategory>('transport');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusTone, setStatusTone] = useState<'neutral' | 'warning' | 'error'>('neutral');
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!show) {
      setRecordingId(null);
      setSearchQuery('');
      setStatusMessage('');
      setStatusTone('neutral');
    }
  }, [show]);

  useEffect(() => {
    if (!recordingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setRecordingId(null);
        setStatusMessage('Shortcut capture cancelled.');
        setStatusTone('neutral');
        return;
      }

      const combo = keyEventToCombo(e);
      if (!combo) return;

      const browserConflict = findBrowserConflict(combo);
      if (browserConflict?.severity === 'error') {
        setStatusMessage(`${comboToDisplay(combo)} is reserved by the browser. ${browserConflict.reason}`);
        setStatusTone('error');
        return;
      }

      setBinding(recordingId, combo);
      const suggestion = browserConflict?.suggestion
        ? ` ${comboToDisplay(browserConflict.suggestion)} is usually safer in the browser.`
        : '';
      setStatusMessage(
        browserConflict
          ? `${comboToDisplay(combo)} saved with a browser warning.${suggestion}`
          : `${SHORTCUT_ACTION_MAP[recordingId]?.label ?? 'Shortcut'} mapped to ${comboToDisplay(combo)}.`,
      );
      setStatusTone(browserConflict ? 'warning' : 'neutral');
      setRecordingId(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [findBrowserConflict, recordingId, setBinding]);

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
      setStatusMessage(`Applied ${SHORTCUT_PRESETS.find((preset) => preset.id === presetId)?.name ?? 'ACE-Step (Default)'}.`);
      setStatusTone('neutral');
    },
    [applyPreset, resetAll],
  );

  const handleExport = useCallback(() => {
    const payload = exportBindings();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ace-step-shortcuts-${payload.presetId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Shortcut preset exported as JSON.');
    setStatusTone('neutral');
  }, [exportBindings]);

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const result = importBindings(parsed);
      const blockedCount = result.blockedActionIds.length;
      const skippedCount = result.skippedActionIds.length;
      const suffix = [
        blockedCount > 0 ? `${blockedCount} browser-blocked` : '',
        skippedCount > 0 ? `${skippedCount} skipped` : '',
      ]
        .filter(Boolean)
        .join(', ');
      setStatusMessage(
        suffix
          ? `Imported ${result.importedCount} shortcut overrides (${suffix}).`
          : `Imported ${result.importedCount} shortcut overrides.`,
      );
      setStatusTone(blockedCount > 0 ? 'warning' : 'neutral');
    } catch {
      setStatusMessage('Shortcut import failed. Expected a valid ACE-Step shortcut JSON file.');
      setStatusTone('error');
    }
  }, [importBindings]);

  if (!show) return null;

  const lowerQuery = searchQuery.toLowerCase();
  const filteredActions = searchQuery
    ? SHORTCUT_ACTIONS.filter((action) => action.label.toLowerCase().includes(lowerQuery))
    : SHORTCUT_ACTIONS.filter((action) => action.category === activeCategory);

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
        className="flex max-h-[88vh] w-[760px] flex-col rounded-lg border border-daw-border bg-daw-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-daw-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Shortcut Editor</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Search, migrate from another DAW, and keep browser-reserved combos out of your live session.
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            aria-label="Close shortcut editor"
            className="text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-200"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-daw-border px-5 py-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500">Migration preset</label>
          <select
            value={activePresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            aria-label="Shortcut migration preset"
            className="min-w-[220px] flex-1 rounded border border-zinc-600 bg-daw-bg px-2 py-1 text-xs text-zinc-200 focus:border-daw-accent focus:outline-none"
          >
            {SHORTCUT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
            {activePresetId === 'custom' && <option value="custom">Custom</option>}
          </select>

          <input
            type="text"
            placeholder="Search shortcuts…"
            aria-label="Search shortcuts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[220px] rounded border border-zinc-600 bg-daw-bg px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent focus:outline-none"
          />

          <button
            onClick={handleExport}
            className="rounded border border-zinc-600 px-3 py-1 text-[11px] text-zinc-200 transition-colors hover:border-zinc-400"
          >
            Export JSON
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded border border-zinc-600 px-3 py-1 text-[11px] text-zinc-200 transition-colors hover:border-zinc-400"
          >
            Import JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>

        {statusMessage && (
          <div
            className={`border-b px-5 py-2 text-[11px] ${
              statusTone === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : statusTone === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-daw-border bg-daw-surface-2 text-zinc-300'
            }`}
          >
            {statusMessage}
          </div>
        )}

        {!searchQuery && (
          <div className="flex gap-1 overflow-x-auto px-5 pt-3">
            {SHORTCUT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  activeCategory === category.id
                    ? 'bg-daw-accent text-white'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {filteredActions.length === 0 && (
            <p className="py-8 text-center text-xs text-zinc-500">No shortcuts match your search.</p>
          )}
          {filteredActions.map((action) => {
            const combo = getCombo(action.id);
            const conflictId = findConflict(combo, action.id);
            const browserConflict = findBrowserConflict(combo);
            return (
              <ShortcutRow
                key={action.id}
                actionId={action.id}
                label={action.label}
                combo={combo}
                defaultCombo={action.defaultCombo}
                isRecording={recordingId === action.id}
                browserConflict={browserConflict}
                conflictLabel={conflictId ? SHORTCUT_ACTION_MAP[conflictId]?.label ?? null : null}
                onStartRecord={() => {
                  setRecordingId(action.id);
                  setStatusMessage(`Press a new key combo for ${action.label}. Esc cancels.`);
                  setStatusTone('neutral');
                }}
                onReset={() => {
                  clearBinding(action.id);
                  setStatusMessage(`${action.label} reset to ${comboToDisplay(action.defaultCombo)}.`);
                  setStatusTone('neutral');
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-daw-border px-5 py-3">
          <div className="space-y-1 text-[10px] text-zinc-500">
            <p>
              {customCount > 0
                ? `${customCount} custom binding${customCount > 1 ? 's' : ''} active`
                : 'All shortcuts at ACE-Step defaults'}
            </p>
            <p>Conflicts are highlighted inline. Browser-reserved shortcuts are blocked or warned before import/remap.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetAll();
                setStatusMessage('Restored the ACE-Step default shortcut map.');
                setStatusTone('neutral');
              }}
              className="rounded border border-zinc-600 px-3 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
            >
              Reset All
            </button>
            <button
              onClick={() => setShow(false)}
              className="rounded bg-daw-accent px-3 py-1 text-[11px] text-white transition-colors hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

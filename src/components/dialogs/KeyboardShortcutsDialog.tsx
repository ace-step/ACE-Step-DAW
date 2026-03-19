import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore } from '../../store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES } from '../../constants/shortcutDefaults';
import type { KeyCombo } from '../../types/shortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function comboToLabels(combo: KeyCombo): string[] {
  const labels: string[] = [];
  if (combo.mod) labels.push(isMac ? '⌘' : 'Ctrl');
  if (combo.shift) labels.push('⇧');
  if (combo.alt) labels.push(isMac ? '⌥' : 'Alt');

  const codeMap: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Home: 'Home',
    End: 'End',
    Escape: 'Esc',
    Equal: '=',
    Minus: '−',
    Comma: ',',
    Period: '.',
    Slash: '/',
  };

  labels.push(codeMap[combo.code] ?? (combo.code.startsWith('Key') ? combo.code.slice(3) : combo.code));
  return labels;
}

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-zinc-600 bg-[#444] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const show = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const setShow = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const getCombo = useShortcutsStore((s) => s.getCombo);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setShow(false)}
    >
      <div
        className="flex max-h-[85vh] w-[640px] flex-col rounded-lg border border-daw-border bg-daw-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-daw-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              This overlay reflects your current active shortcut preset and custom overrides.
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            aria-label="Close keyboard shortcuts"
            className="text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-200"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.id}>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {category.label}
                </h3>
                <div className="space-y-1.5">
                  {SHORTCUT_ACTIONS.filter((action) => action.category === category.id).map((action) => (
                    <div key={action.id} className="flex items-center justify-between gap-3">
                      <span className="flex-1 text-xs text-zinc-400">{action.label}</span>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {comboToLabels(getCombo(action.id)).map((label, index) => (
                          <Key key={`${action.id}-${label}-${index}`} label={label} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Timeline Selection
              </h3>
              <div className="space-y-1.5">
                {[
                  { labels: [isMac ? '⌘' : 'Ctrl', 'Drag'], text: 'Set generation target window' },
                  { labels: [isMac ? '⌥' : 'Alt', 'Drag'], text: 'Set context audio window' },
                  { labels: [isMac ? '⌘' : 'Ctrl', 'Click'], text: 'Toggle clip multi-select' },
                  { labels: ['⇧', 'Drag'], text: 'Duplicate dragged clip selection' },
                ].map((row) => (
                  <div key={row.text} className="flex items-center justify-between gap-3">
                    <span className="flex-1 text-xs text-zinc-400">{row.text}</span>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {row.labels.map((label) => (
                        <Key key={`${row.text}-${label}`} label={label} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-daw-border px-5 py-2.5">
          <p className="text-[10px] text-zinc-600">
            Shortcuts are paused while typing in text fields. Press <Key label="Esc" /> to close this overlay.
          </p>
          <button
            onClick={() => {
              setShow(false);
              useUIStore.getState().setShowShortcutEditorDialog(true);
            }}
            className="ml-3 flex-shrink-0 whitespace-nowrap rounded bg-daw-accent px-3 py-1 text-[10px] text-white transition-colors hover:brightness-110"
          >
            Customize…
          </button>
        </div>
      </div>
    </div>
  );
}

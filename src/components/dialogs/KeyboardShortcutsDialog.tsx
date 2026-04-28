import { useMemo, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore } from '../../store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_CATEGORIES } from '../../constants/shortcutDefaults';
import { comboToDisplay } from '../../utils/shortcutUtils';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#444] border border-zinc-600 text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const show = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const setShow = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const getCombo = useShortcutsStore((s) => s.getCombo);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, show);

  const sections = useMemo(() => (
    SHORTCUT_CATEGORIES.map((category) => ({
      ...category,
      actions: SHORTCUT_ACTIONS.filter((action) => action.category === category.id),
    })).filter((section) => section.actions.length > 0)
  ), []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && setShow(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setShow(false); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="w-[680px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-daw-border">
          <div>
            <h2 id="keyboard-shortcuts-title" className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
            <p className="text-[11px] text-zinc-400 mt-1">
              Core single-key shortcuts ignore focused text fields and contenteditable editors. R arms the focused track first, then toggles recording.
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            aria-label="Close keyboard shortcuts"
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            {sections.map((section) => (
              <div key={section.id}>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                  {section.label}
                </h3>
                <div className="space-y-1.5">
                  {section.actions.map((action) => (
                    <div key={action.id} className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-300">{action.label}</div>
                        {action.contexts && (
                          <div className="text-[10px] text-zinc-400">
                            {action.contexts.join(', ')}
                          </div>
                        )}
                      </div>
                      <Key label={comboToDisplay(getCombo(action.id))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-t border-daw-border">
          <p className="text-[10px] text-zinc-600">
            Press <Key label="Esc" /> or <Key label="?" /> to close. Use the editor for presets, conflicts, and JSON import/export.
          </p>
          <button
            onClick={() => {
              setShow(false);
              useUIStore.getState().setShowShortcutEditorDialog(true);
            }}
            className="ml-3 px-3 py-1 text-[10px] rounded bg-daw-accent text-white hover:brightness-110 transition-colors whitespace-nowrap flex-shrink-0"
          >
            Customize…
          </button>
        </div>
      </div>
    </div>
  );
}

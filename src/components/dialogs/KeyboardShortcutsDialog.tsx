import { useUIStore } from '../../store/uiStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface Section {
  title: string;
  rows: ShortcutRow[];
}

const SECTIONS: Section[] = [
  {
    title: 'Transport',
    rows: [
      { keys: ['Space'],          description: 'Play / Pause' },
      { keys: ['Enter'],          description: 'Stop + return to 0' },
      { keys: ['L'],              description: 'Toggle Loop' },
      { keys: ['←', '→'],        description: 'Nudge playhead ±5 s' },
    ],
  },
  {
    title: 'Clips',
    rows: [
      { keys: ['Delete', 'Backspace'],  description: 'Delete selected clips' },
      { keys: [`${mod}`, 'D'],          description: 'Duplicate selected clip' },
      { keys: [`${mod}`, 'A'],          description: 'Select all clips' },
      { keys: ['E'],                    description: 'Edit selected clip' },
      { keys: [`${mod}`, 'Enter'],      description: 'Generate selected clip' },
      { keys: ['Esc'],                  description: 'Close modal / deselect all' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: [`${mod}`, '='],  description: 'Zoom in' },
      { keys: [`${mod}`, '−'],  description: 'Zoom out' },
      { keys: [`${mod}`, '0'],  description: 'Reset zoom' },
    ],
  },
  {
    title: 'Generation',
    rows: [
      { keys: [`${mod}`, 'G'],         description: 'Generate from Silence' },
      { keys: [`${mod}`, '⇧', 'G'],    description: 'Generate from Context' },
    ],
  },
  {
    title: 'Project',
    rows: [
      { keys: [`${mod}`, 'N'],         description: 'New project' },
      { keys: [`${mod}`, 'O'],         description: 'Open project list' },
      { keys: [`${mod}`, ','],         description: 'Settings' },
      { keys: [`${mod}`, '⇧', 'E'],    description: 'Export' },
      { keys: [`${mod}`, '⇧', 'I'],    description: 'Add Track' },
      { keys: ['M'],                    description: 'Toggle Mixer panel' },
      { keys: ['?'],                    description: 'This help overlay' },
    ],
  },
];

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-700 border border-zinc-600 text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const show = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const setShow = useUIStore((s) => s.setShowKeyboardShortcutsDialog);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setShow(false)}
    >
      <div
        className="w-[540px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-daw-border">
          <h2 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-5 min-h-0">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-400 flex-1">{row.description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {row.keys.map((k, ki) => (
                        <Key key={ki} label={k} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-daw-border text-center">
          <p className="text-[10px] text-zinc-600">
            Shortcuts are disabled when typing in text fields. Press <Key label="Esc" /> or <Key label="?" /> to toggle this overlay.
          </p>
        </div>
      </div>
    </div>
  );
}

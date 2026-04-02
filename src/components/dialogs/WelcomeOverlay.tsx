import { useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';

const WELCOME_DISMISSED_KEY = 'ace-daw-welcome-dismissed';

/** 5 essential shortcuts new users should know. */
const ESSENTIAL_SHORTCUTS = [
  { keys: ['Space'], label: 'Play / Pause' },
  { keys: ['Cmd/Ctrl', 'Enter'], label: 'Generate AI music for selected clip' },
  { keys: ['Cmd/Ctrl', 'Z'], label: 'Undo' },
  { keys: ['Cmd/Ctrl', 'S'], label: 'Save project' },
  { keys: ['?'], label: 'View all keyboard shortcuts' },
] as const;

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#333] border border-zinc-600 text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

/** Returns true if the user has already dismissed the welcome overlay. */
export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function WelcomeOverlay() {
  const show = useUIStore((s) => s.showWelcomeOverlay);
  const setShow = useUIStore((s) => s.setShowWelcomeOverlay);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
    } catch { /* quota exceeded — ignore */ }
    setShow(false);
  }, [setShow]);

  const handleNewProject = useCallback(() => {
    dismiss();
    setShowNewProjectDialog(true);
  }, [dismiss, setShowNewProjectDialog]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-daw-border">
          <h1 className="text-lg font-bold text-zinc-100">Welcome to ACE-Step DAW</h1>
          <p className="text-xs text-zinc-400 mt-1">
            AI-native music production — generate, arrange, and mix with AI
          </p>
        </div>

        {/* Quick actions */}
        <div className="px-6 py-4 space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Quick Start
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleNewProject}
              className="flex flex-col items-center gap-1.5 p-3 rounded-md bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 transition-colors text-left"
            >
              <span className="text-sm font-medium text-violet-300">New Project</span>
              <span className="text-[10px] text-zinc-400">Start from a template</span>
            </button>
            <button
              onClick={dismiss}
              className="flex flex-col items-center gap-1.5 p-3 rounded-md bg-zinc-700/30 border border-zinc-600/30 hover:bg-zinc-700/50 transition-colors text-left"
            >
              <span className="text-sm font-medium text-zinc-200">Explore</span>
              <span className="text-[10px] text-zinc-400">Look around the interface</span>
            </button>
          </div>
        </div>

        {/* Essential shortcuts */}
        <div className="px-6 py-4 border-t border-daw-border">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Essential Shortcuts
          </h3>
          <div className="space-y-2">
            {ESSENTIAL_SHORTCUTS.map(({ keys, label }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-zinc-300">{label}</span>
                <div className="flex items-center gap-1">
                  {keys.map((k) => (
                    <Key key={k} label={k} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-daw-border flex justify-end">
          <button
            onClick={dismiss}
            className="px-4 py-1.5 text-xs font-medium rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

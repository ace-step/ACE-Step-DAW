import { useState, useEffect, useCallback, useRef } from 'react';
import { Z } from '../../utils/zIndex';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const STORAGE_KEY = 'ace-step-welcome-seen';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { keys: ['Space'], label: 'Play / Pause' },
  { keys: [mod, 'Z'], label: 'Undo' },
  { keys: [mod, 'C'], label: 'Copy clips' },
  { keys: [mod, 'V'], label: 'Paste at playhead' },
  { keys: [mod, 'K'], label: 'Command Palette' },
] as const;

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-700 border border-zinc-600 text-zinc-200 shadow-sm">
      {label}
    </kbd>
  );
}

export function WelcomeOverlay() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, visible);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Auto-focus the CTA button on mount
  useEffect(() => {
    if (visible) buttonRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      data-testid="welcome-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ zIndex: Z.onboarding }}
      onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        ref={dialogRef}
        className="w-[420px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <h2 id="welcome-title" className="text-base font-semibold text-zinc-100">
            Welcome to ACE-Step DAW
          </h2>
          <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
            AI-powered music creation. Here are a few shortcuts to get you started.
          </p>
        </div>

        {/* Shortcuts grid */}
        <div className="px-6 pb-4">
          <div className="space-y-2">
            {SHORTCUTS.map(({ keys, label }) => (
              <div
                key={label}
                className="flex items-center justify-between py-1.5 px-3 rounded bg-white/[0.03]"
              >
                <span className="text-[11px] text-zinc-300">{label}</span>
                <span className="flex items-center gap-1">
                  {keys.map((k, i) => (
                    <Key key={i} label={k} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="px-6 pb-4">
          <div className="text-[10px] text-zinc-500 space-y-1">
            <p>Press <Key label="?" /> to see all keyboard shortcuts</p>
            <p>Use the <strong className="text-zinc-400">+ Track</strong> button or drag audio files to add tracks</p>
          </div>
        </div>

        {/* Action */}
        <div className="px-6 pb-6 flex justify-center">
          <button
            ref={buttonRef}
            onClick={dismiss}
            className="px-6 py-2 rounded-md bg-daw-accent hover:bg-daw-accent/90 text-white text-xs font-medium transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

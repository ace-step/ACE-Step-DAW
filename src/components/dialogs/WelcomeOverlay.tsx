import { useState, useEffect, useCallback, useRef } from 'react';
import { Z } from '../../utils/zIndex';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import {
  ONBOARDING_STARTERS,
  getStarterTemplate,
  instantiateDemoProject,
} from '../../data/onboardingCatalog';
import { toastSuccess } from '../../hooks/useToast';

const STORAGE_KEY = 'ace-step-welcome-seen';

type View = 'main' | 'templates';

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

/* ── Path card for the main menu ── */
function PathCard({
  icon,
  title,
  description,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all group ${
        accent
          ? 'border-daw-accent/50 bg-daw-accent/[0.06] hover:bg-daw-accent/[0.12] hover:border-daw-accent/70'
          : 'border-daw-border/50 bg-white/[0.02] hover:bg-white/[0.05] hover:border-daw-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-sm ${
            accent ? 'bg-daw-accent/20 text-daw-accent' : 'bg-white/[0.06] text-zinc-400'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-medium ${accent ? 'text-daw-accent' : 'text-zinc-200'}`}>
            {title}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}

/* ── Template card ── */
function StarterCard({
  starter,
  onClick,
}: {
  starter: (typeof ONBOARDING_STARTERS)[number];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-starter-id={starter.id}
      className="text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2.5"
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
          {starter.kind === 'template' ? 'Template' : 'Demo'}
        </p>
        <p className="text-[10px] text-zinc-500">{starter.bpm} BPM</p>
      </div>
      <p className="text-xs text-zinc-200 font-medium">{starter.title}</p>
      <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{starter.description}</p>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {starter.tracks.slice(0, 3).map((t) => (
          <span
            key={t}
            className="text-[9px] rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-zinc-400"
          >
            {t}
          </span>
        ))}
        {starter.tracks.length > 3 && (
          <span className="text-[9px] text-zinc-500">+{starter.tracks.length - 3}</span>
        )}
      </div>
    </button>
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
  const [view, setView] = useState<View>('main');

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, visible);

  const createProject = useProjectStore((s) => s.createProject);
  const setProject = useProjectStore((s) => s.setProject);
  const createProjectFromTemplate = useProjectStore((s) => s.createProjectFromTemplate);
  const setShowGenerationPanel = useUIStore((s) => s.setShowGenerationPanel);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  const handleGenerateSong = () => {
    createProject({ name: 'AI Song' });
    setShowGenerationPanel(true);
    toastSuccess('Ready to generate — describe your song!');
    dismiss();
  };

  const handleBlankProject = () => {
    createProject();
    dismiss();
  };

  const handleSelectStarter = (starter: (typeof ONBOARDING_STARTERS)[number]) => {
    if (starter.kind === 'template') {
      const tmpl = getStarterTemplate(starter.id);
      if (tmpl) createProjectFromTemplate(tmpl);
    } else {
      setProject(instantiateDemoProject(starter.id));
    }
    toastSuccess(`Opened "${starter.title}"`);
    dismiss();
  };

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
        className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'main' ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 text-center">
              <h2 id="welcome-title" className="text-base font-semibold text-zinc-100">
                Welcome to ACE-Step DAW
              </h2>
              <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Describe your music in words, generate with AI, and edit in a full DAW.
              </p>
            </div>

            {/* Three paths */}
            <div className="px-6 pb-4 space-y-2">
              <PathCard
                icon="✦"
                title="Generate a Song"
                description="Describe your music and AI creates it in seconds"
                accent
                onClick={handleGenerateSong}
              />
              <PathCard
                icon="☷"
                title="Start from Template"
                description="Pre-configured genre starters with tracks and presets"
                onClick={() => setView('templates')}
              />
              <PathCard
                icon="◻"
                title="Blank Project"
                description="Empty canvas with default settings"
                onClick={handleBlankProject}
              />
            </div>

            {/* Shortcuts */}
            <div className="px-6 pb-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">
                Keyboard Shortcuts
              </p>
              <div className="space-y-1.5">
                {SHORTCUTS.map(({ keys, label }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-1 px-2.5 rounded bg-white/[0.03]"
                  >
                    <span className="text-[10px] text-zinc-400">{label}</span>
                    <span className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <Key key={i} label={k} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tip */}
            <div className="px-6 pb-5">
              <p className="text-[10px] text-zinc-600">
                Press <Key label="?" /> for all shortcuts · <Key label={mod} />{' '}
                <Key label="K" /> for command palette
              </p>
            </div>
          </>
        ) : (
          /* Template view */
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-daw-border">
              <button
                onClick={() => setView('main')}
                aria-label="back"
                className="text-zinc-400 hover:text-zinc-200 text-sm p-1 rounded hover:bg-white/[0.06] transition-colors"
              >
                ←
              </button>
              <h2 className="text-sm font-medium text-zinc-200">Choose a Starter</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                {ONBOARDING_STARTERS.map((starter) => (
                  <StarterCard
                    key={starter.id}
                    starter={starter}
                    onClick={() => handleSelectStarter(starter)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

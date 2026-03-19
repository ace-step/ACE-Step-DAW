import { useMemo, useState } from 'react';
import { ONBOARDING_STARTERS, getStarterTemplate, instantiateDemoProject } from '../../data/onboardingCatalog';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

const COMPLEXITY_TIERS = [
  {
    id: 'simple' as const,
    title: 'Simple',
    description: 'Prioritize the core writing surface with fewer open panels and Smart Controls on by default.',
    details: 'Best for first-time users who want to create quickly and keep the workspace light.',
  },
  {
    id: 'standard' as const,
    title: 'Standard',
    description: 'Balanced defaults for arranging, generating, and editing without exposing every panel at once.',
    details: 'Good default for regular music-making sessions.',
  },
  {
    id: 'advanced' as const,
    title: 'Advanced',
    description: 'Open more of the DAW immediately, including library, loop browser, mixer, and tempo lane.',
    details: 'Best for experienced users who want denser control from the first minute.',
  },
];

export function FirstRunOnboarding() {
  const showOnboarding = useUIStore((s) => s.showOnboarding);
  const workspaceComplexity = useUIStore((s) => s.workspaceComplexity);
  const applyWorkspaceComplexity = useUIStore((s) => s.applyWorkspaceComplexity);
  const completeOnboarding = useUIStore((s) => s.completeOnboarding);
  const skipOnboarding = useUIStore((s) => s.skipOnboarding);
  const startTutorial = useUIStore((s) => s.startTutorial);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const createProjectFromTemplate = useProjectStore((s) => s.createProjectFromTemplate);
  const setProject = useProjectStore((s) => s.setProject);

  const [starterId, setStarterId] = useState(ONBOARDING_STARTERS[0].id);
  const selectedStarter = useMemo(
    () => ONBOARDING_STARTERS.find((starter) => starter.id === starterId) ?? ONBOARDING_STARTERS[0],
    [starterId],
  );

  if (!showOnboarding) return null;

  const handleStart = () => {
    applyWorkspaceComplexity(workspaceComplexity);

    if (selectedStarter.kind === 'template') {
      const template = getStarterTemplate(selectedStarter.id);
      if (template) createProjectFromTemplate(template);
    } else {
      setProject(instantiateDemoProject(selectedStarter.id));
    }

    completeOnboarding();
    setShowNewProjectDialog(false);
    startTutorial();
  };

  const handleSkip = () => {
    skipOnboarding();
    setShowNewProjectDialog(true);
  };

  return (
    <div className="fixed inset-0 z-[240] bg-[#090b10]/92 backdrop-blur-sm text-zinc-100" aria-label="First-run onboarding">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">First Run</p>
              <h1 className="text-3xl font-semibold text-white">Start in a session that already knows where you are going.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Choose a genre starter or open a demo project, then set the workspace density that matches your experience.
                The guided tutorial is optional and you can dismiss tips permanently.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Skip For Now
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
            <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,36,49,0.92),rgba(13,16,23,0.96))] p-5 shadow-2xl shadow-black/30">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">1. Pick a starter</h2>
                  <p className="mt-1 text-sm text-zinc-400">Templates create a fresh scaffold. Demo projects open with content ready for editing.</p>
                </div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Template + Demo</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {ONBOARDING_STARTERS.map((starter) => {
                  const active = starter.id === starterId;
                  return (
                    <button
                      key={starter.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStarterId(starter.id)}
                      className={`rounded-3xl border p-4 text-left transition-all ${
                        active
                          ? 'border-cyan-400/60 bg-cyan-400/10 shadow-lg shadow-cyan-950/50'
                          : 'border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/7'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">{starter.genre}</p>
                          <h3 className="mt-1 text-lg font-semibold text-white">{starter.title}</h3>
                        </div>
                        <div className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                          {starter.bpm} BPM
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-zinc-300">{starter.description}</p>
                      <p className="mt-3 text-xs leading-5 text-zinc-400">{starter.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {starter.tracks.map((track) => (
                          <span key={track} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300">
                            {track}
                          </span>
                        ))}
                      </div>
                      <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        {starter.keyScale}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,27,35,0.94),rgba(10,12,16,0.98))] p-5 shadow-2xl shadow-black/30">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-white">2. Choose workspace density</h2>
                <p className="mt-1 text-sm text-zinc-400">This changes the visible defaults before you land in the main workspace.</p>
              </div>

              <div className="space-y-3">
                {COMPLEXITY_TIERS.map((tier) => {
                  const active = tier.id === workspaceComplexity;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => applyWorkspaceComplexity(tier.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? 'border-emerald-400/60 bg-emerald-400/10'
                          : 'border-white/10 bg-white/4 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white">{tier.title}</h3>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {active ? 'Selected' : 'Available'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">{tier.description}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">{tier.details}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">What happens next</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  <li>First launch opens into the selected starter, not an empty DAW.</li>
                  <li>A skippable 5-step tutorial points out timeline, transport, genr, mixer, and help.</li>
                  <li>Contextual tips stay dismissible and do not return once removed.</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleStart}
                className="mt-6 w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
              >
                Open {selectedStarter.title}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

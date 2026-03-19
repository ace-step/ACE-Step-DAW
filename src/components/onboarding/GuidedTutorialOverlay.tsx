import { useEffect, useMemo, useState } from 'react';
import { ONBOARDING_TUTORIAL_STEPS } from '../../data/onboardingCatalog';
import { useUIStore } from '../../store/uiStore';

type Rect = { top: number; left: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function GuidedTutorialOverlay() {
  const activeTutorialStep = useUIStore((s) => s.activeTutorialStep);
  const nextTutorialStep = useUIStore((s) => s.nextTutorialStep);
  const finishTutorial = useUIStore((s) => s.finishTutorial);
  const skipTutorial = useUIStore((s) => s.skipTutorial);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const step = useMemo(
    () => (activeTutorialStep === null ? null : ONBOARDING_TUTORIAL_STEPS[activeTutorialStep] ?? null),
    [activeTutorialStep],
  );

  useEffect(() => {
    if (!step) return;

    const update = () => {
      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (!element) {
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  if (!step || activeTutorialStep === null) return null;

  const cardWidth = 340;
  const top = targetRect
    ? clamp(targetRect.top + targetRect.height + 18, 24, window.innerHeight - 240)
    : window.innerHeight / 2 - 120;
  const left = targetRect
    ? clamp(targetRect.left, 24, window.innerWidth - cardWidth - 24)
    : window.innerWidth / 2 - cardWidth / 2;

  const isLastStep = activeTutorialStep === ONBOARDING_TUTORIAL_STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[250]">
      <div className="absolute inset-0 bg-black/45" />
      {targetRect && (
        <div
          className="absolute rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-all"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      <div
        className="pointer-events-auto absolute rounded-3xl border border-white/10 bg-[#0f141d] p-5 text-zinc-100 shadow-2xl shadow-black/60"
        style={{ top, left, width: cardWidth }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Tutorial {activeTutorialStep + 1}/{ONBOARDING_TUTORIAL_STEPS.length}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Skip onboarding tutorial"
            onClick={skipTutorial}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={isLastStep ? finishTutorial : nextTutorialStep}
            className="rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

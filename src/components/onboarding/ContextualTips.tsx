import { useEffect, useMemo, useState } from 'react';
import { ONBOARDING_TIPS } from '../../data/onboardingCatalog';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

type Rect = { top: number; left: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ContextualTips() {
  const project = useProjectStore((s) => s.project);
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted);
  const activeTutorialStep = useUIStore((s) => s.activeTutorialStep);
  const dismissedOnboardingTipIds = useUIStore((s) => s.dismissedOnboardingTipIds);
  const dismissOnboardingTip = useUIStore((s) => s.dismissOnboardingTip);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const tip = useMemo(() => {
    if (!project || !onboardingCompleted || activeTutorialStep !== null) return null;
    return ONBOARDING_TIPS.find((candidate) => !dismissedOnboardingTipIds.includes(candidate.id)) ?? null;
  }, [activeTutorialStep, dismissedOnboardingTipIds, onboardingCompleted, project]);

  useEffect(() => {
    if (!tip) return;

    const update = () => {
      const element = document.querySelector(tip.selector) as HTMLElement | null;
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
  }, [tip]);

  if (!tip || !targetRect) return null;

  const width = 280;
  const top = clamp(targetRect.top + targetRect.height + 14, 18, window.innerHeight - 180);
  const left = clamp(targetRect.left, 18, window.innerWidth - width - 18);

  return (
    <div
      className="fixed z-[210] rounded-2xl border border-cyan-400/30 bg-[#111723]/95 p-4 text-zinc-100 shadow-xl shadow-black/50"
      style={{ top, left, width }}
      aria-label={`Tip: ${tip.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Tip</p>
          <h3 className="mt-1 text-sm font-semibold text-white">{tip.title}</h3>
        </div>
        <button
          type="button"
          aria-label={`Dismiss tip ${tip.title}`}
          onClick={() => dismissOnboardingTip(tip.id)}
          className="text-sm text-zinc-500 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{tip.body}</p>
    </div>
  );
}

import { useState } from 'react';
import { useOnboardingProgress } from '../../hooks/useOnboardingProgress';

export function OnboardingProgress() {
  const { completedCount, total, milestones, completed, isDismissed, dismiss } =
    useOnboardingProgress();
  const [expanded, setExpanded] = useState(false);

  if (isDismissed || completedCount >= total) return null;

  return (
    <div data-testid="onboarding-progress" className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
        aria-label="Onboarding progress"
      >
        <span className="font-medium">
          {completedCount}/{total}
        </span>
        <span className="text-zinc-500">features explored</span>
        {/* Mini progress bar */}
        <div className="w-12 h-1 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-daw-accent transition-all duration-300"
            style={{ width: `${(completedCount / total) * 100}%` }}
          />
        </div>
      </button>

      {expanded && (
        <div className="absolute bottom-full mb-1 right-0 w-56 bg-daw-surface-2 rounded-lg border border-daw-border shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-daw-border">
            <span className="text-[10px] font-medium text-zinc-300">Feature Progress</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss();
              }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
              aria-label="Dismiss progress tracker"
            >
              dismiss
            </button>
          </div>
          <div className="px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 text-[10px]"
              >
                <span
                  className={
                    completed.has(m.id) ? 'text-green-400' : 'text-zinc-600'
                  }
                >
                  {completed.has(m.id) ? '✓' : '○'}
                </span>
                <span
                  className={
                    completed.has(m.id) ? 'text-zinc-300' : 'text-zinc-500'
                  }
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

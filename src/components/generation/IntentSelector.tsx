import type { GenerationIntent } from '../../types/api';
import { useModelStore } from '../../store/modelStore';

const INTENT_OPTIONS: { value: GenerationIntent; label: string; description: string }[] = [
  { value: 'full-song', label: 'Full Song', description: 'Generate a complete mixed song from text' },
  { value: 'single-track', label: 'Single Track', description: 'Generate one instrument track with context' },
];

interface IntentSelectorProps {
  value: GenerationIntent;
  onChange: (intent: GenerationIntent) => void;
  disabled?: boolean;
}

export function IntentSelector({ value, onChange, disabled }: IntentSelectorProps) {
  const activeCategory = useModelStore((s) => s.getActiveModelCategory());
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const isLoading = modelLoadingState === 'loading';

  return (
    <div className="space-y-2" data-testid="intent-selector">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#3a3a3a] bg-[#181818] p-1">
        {INTENT_OPTIONS.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled || isLoading}
              className={`rounded-md px-2 py-2 text-center transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
              } disabled:cursor-not-allowed disabled:opacity-50`}
              data-testid={`intent-${option.value}`}
              aria-pressed={isActive}
            >
              <span className="block text-[11px] font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* Model status indicator */}
      <div className="flex items-center gap-1.5 px-0.5">
        {isLoading ? (
          <>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            <span className="text-[10px] text-amber-400">Switching model...</span>
          </>
        ) : (
          <>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${activeCategory ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="text-[10px] text-zinc-500">
              {activeCategory === 'text2music' ? 'Text2Music model ready' :
               activeCategory === 'lego' ? 'Lego model ready' :
               'No model loaded'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

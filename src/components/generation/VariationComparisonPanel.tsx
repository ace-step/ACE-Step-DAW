import { useGenerationStore } from '../../store/generationStore';
import type { Variation } from '../../store/generationStore';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-zinc-800 text-zinc-400',
  generating: 'bg-indigo-900/50 text-indigo-300',
  processing: 'bg-amber-900/50 text-amber-300',
  done: 'bg-emerald-900/50 text-emerald-300',
  error: 'bg-red-900/50 text-red-300',
  cancelled: 'bg-zinc-800 text-zinc-500',
};

function VariationCard({
  variation,
  isActive,
  onSelect,
}: {
  variation: Variation;
  isActive: boolean;
  onSelect: () => void;
}) {
  const keyHint = variation.index + 1;
  const isGenerating = variation.status === 'generating' || variation.status === 'processing';
  const progressPercent = Math.round(variation.progressPercent ?? 0);

  return (
    <button
      type="button"
      data-testid={`variation-card-${variation.index}`}
      aria-pressed={isActive}
      onClick={onSelect}
      className={`relative flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all text-xs cursor-pointer ${
        isActive
          ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40'
          : 'border-[#3a3a3a] bg-[#1e1e22] hover:border-zinc-500'
      }`}
    >
      {/* Top row: key hint + status */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
            isActive ? 'bg-indigo-600 text-white' : 'bg-zinc-700 text-zinc-300'
          }`}
        >
          {keyHint}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[variation.status] ?? STATUS_STYLES.pending}`}>
          {variation.status}
        </span>
      </div>

      {/* Model name */}
      {variation.modelName && (
        <span className="text-[10px] text-zinc-400 truncate">{variation.modelName}</span>
      )}

      {/* Progress bar for generating */}
      {isGenerating && (
        <div className="flex flex-col gap-0.5">
          {variation.stage && (
            <span className="text-[9px] text-zinc-500 uppercase">{variation.stage}</span>
          )}
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-black/30"
            role="progressbar"
            aria-label={`Variation ${keyHint} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {variation.status === 'error' && variation.error && (
        <span className="text-[10px] text-red-400 line-clamp-2">{variation.error}</span>
      )}
    </button>
  );
}

export function VariationComparisonPanel() {
  const session = useGenerationStore((s) => s.variationSession);
  const setActiveVariation = useGenerationStore((s) => s.setActiveVariation);
  const cancelVariationSession = useGenerationStore((s) => s.cancelVariationSession);
  const clearVariationSession = useGenerationStore((s) => s.clearVariationSession);

  if (!session) return null;

  const isGenerating = session.status === 'generating';

  return (
    <div className="border-t border-[#1a1a1a] bg-[#252528] px-3 py-2" data-testid="variation-comparison-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider shrink-0">
            Variations
          </span>
          <span className="text-[10px] text-zinc-500 truncate" title={session.prompt}>
            {session.prompt}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isGenerating && (
            <button
              type="button"
              onClick={cancelVariationSession}
              className="rounded px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-900/30 transition-colors"
              aria-label="Cancel generation"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={clearVariationSession}
            className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 transition-colors"
            aria-label="Dismiss variations"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Variation cards grid */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(session.variations.length, 4)}, 1fr)` }}>
        {session.variations.map((v) => (
          <VariationCard
            key={v.index}
            variation={v}
            isActive={v.index === session.activeVariationIndex}
            onSelect={() => setActiveVariation(v.index)}
          />
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="mt-1.5 text-center text-[9px] text-zinc-600">
        Press <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">1</kbd>–
        <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{Math.min(session.variations.length, 4)}</kbd> to switch
      </div>
    </div>
  );
}

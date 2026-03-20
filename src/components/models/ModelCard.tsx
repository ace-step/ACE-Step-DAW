import { Button } from '../ui/Button';
import type { LibraryModel } from '../../store/modelStore';

interface ModelCardProps {
  model: LibraryModel;
  pinned: boolean;
  loading: boolean;
  onPinToggle: () => void;
  onLoad: () => void;
}

export function ModelCard({ model, pinned, loading, onPinToggle, onLoad }: ModelCardProps) {
  return (
    <article
      className="rounded-xl border border-[#343434] bg-[#202020] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
      data-testid={`model-card-${model.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${model.isLoaded ? 'bg-emerald-400' : 'bg-zinc-600'}`}
              aria-label={model.isLoaded ? `${model.name} loaded` : `${model.name} not loaded`}
            />
            <h3 className="truncate text-sm font-semibold text-zinc-100">{model.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-200">
              {model.kind}
            </span>
            {model.isDefault && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200">
                Default
              </span>
            )}
            {model.supportedTaskTypes.map((taskType) => (
              <span
                key={`${model.id}-${taskType}`}
                className="rounded-full bg-[#2b2b2b] px-2 py-0.5 text-[10px] text-zinc-300"
              >
                {taskType}
              </span>
            ))}
            {model.kind === 'lm' && model.supportedTaskTypes.length === 0 && (
              <span className="rounded-full bg-[#2b2b2b] px-2 py-0.5 text-[10px] text-zinc-300">
                language model
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onPinToggle}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            pinned ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30' : 'bg-[#2a2a2a] text-zinc-400 hover:text-zinc-200'
          }`}
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${model.name}`}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">
          {model.isLoaded ? 'Loaded and ready' : 'Available on backend'}
        </span>
        <Button
          variant={model.isLoaded ? 'ghost' : 'primary'}
          size="sm"
          onClick={onLoad}
          disabled={loading}
          aria-label={`Load ${model.name}`}
        >
          {loading ? 'Loading...' : model.isLoaded ? 'Reload' : 'Load'}
        </Button>
      </div>
    </article>
  );
}

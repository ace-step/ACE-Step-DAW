import type { ModelEntry } from '../../types/api';

interface ModelCardProps {
  model: ModelEntry;
  isPinned: boolean;
  isLoading: boolean;
  onLoad: (name: string) => void;
  onTogglePin: (name: string) => void;
}

export function ModelCard({ model, isPinned, isLoading, onLoad, onTogglePin }: ModelCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-3 py-2.5 hover:bg-zinc-800" data-testid="model-card">
      <div className="mt-1.5 flex-shrink-0">
        <div data-testid="model-status-dot" className={`h-2.5 w-2.5 rounded-full ${model.is_loaded ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-zinc-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{model.name}</span>
          {model.is_default && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-medium">default</span>)}
        </div>
        {model.supported_task_types && model.supported_task_types.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {model.supported_task_types.map((type) => (<span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400">{type}</span>))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button data-testid="model-pin-button" onClick={() => onTogglePin(model.name)} className={`p-1 rounded text-sm hover:bg-zinc-700 transition-colors ${isPinned ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`} title={isPinned ? 'Unpin model' : 'Pin model'}>{isPinned ? '\u2605' : '\u2606'}</button>
        {isLoading ? (
          <div data-testid="model-loading-spinner" className="w-[60px] flex items-center justify-center"><div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <button onClick={() => onLoad(model.name)} disabled={model.is_loaded} className={`px-3 py-1 text-xs rounded font-medium transition-colors ${model.is_loaded ? 'bg-emerald-900/40 text-emerald-400 cursor-default' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>{model.is_loaded ? 'Loaded' : 'Load'}</button>
        )}
      </div>
    </div>
  );
}

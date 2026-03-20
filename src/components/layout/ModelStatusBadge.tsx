import { useModelStore } from '../../store/modelStore';

type ToolbarModelBadgeStatus = 'loaded' | 'loading' | 'none';

function resolveModelBadgeStatus(
  modelName: string,
  connected: boolean,
  activeModelId: string | null,
  modelLoadingState: 'idle' | 'loading' | 'error',
  availableModels: Array<{ name: string; is_loaded: boolean }>,
): ToolbarModelBadgeStatus {
  if (modelLoadingState === 'loading') return 'loading';
  if (!modelName || !connected) return 'none';
  const isLoaded = availableModels.some((m) => m.name === modelName && m.is_loaded);
  if (isLoaded && activeModelId === modelName) return 'loaded';
  return 'none';
}

export function ModelStatusBadge({ modelName, onClick }: { modelName: string; onClick: () => void }) {
  const connected = useModelStore((s) => s.connected);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const availableModels = useModelStore((s) => s.availableModels);

  const displayName = modelName || 'No model';
  const status = resolveModelBadgeStatus(modelName, connected, activeModelId, modelLoadingState, availableModels);
  const dotClassName =
    status === 'loaded'
      ? 'bg-emerald-500'
      : status === 'loading'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-zinc-500';
  const statusLabel =
    status === 'loaded'
      ? `${displayName} loaded`
      : status === 'loading'
        ? `${displayName} loading`
        : 'No model loaded';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-[#4b4b4b] bg-[#242424] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-daw-surface-2 hover:text-white"
      title="Model Library (Y)"
      aria-label={`Model status: ${displayName}`}
    >
      <span data-testid="toolbar-model-status-dot" className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
      <span className="max-w-[11rem] truncate">{displayName}</span>
      <span className="sr-only">{statusLabel}</span>
    </button>
  );
}

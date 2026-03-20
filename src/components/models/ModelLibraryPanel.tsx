import { useEffect, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useModelStore } from '../../store/modelStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';
import { ModelCard } from './ModelCard';

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function ModelLibraryPanel() {
  const project = useProjectStore((state) => state.project);
  const show = useUIStore((state) => state.showModelLibrary);
  const setShow = useUIStore((state) => state.setShowModelLibrary);

  const models = useModelStore((state) => state.models);
  const pinnedModelIds = useModelStore((state) => state.pinnedModelIds);
  const activeTab = useModelStore((state) => state.activeTab);
  const isRefreshing = useModelStore((state) => state.isRefreshing);
  const isLoadingModel = useModelStore((state) => state.isLoadingModel);
  const loadingModelId = useModelStore((state) => state.loadingModelId);
  const isRefreshingStats = useModelStore((state) => state.isRefreshingStats);
  const statusMessage = useModelStore((state) => state.statusMessage);
  const errorMessage = useModelStore((state) => state.errorMessage);
  const stats = useModelStore((state) => state.stats);
  const llmInitialized = useModelStore((state) => state.llmInitialized);
  const setActiveTab = useModelStore((state) => state.setActiveTab);
  const togglePinnedModel = useModelStore((state) => state.togglePinnedModel);
  const refreshModels = useModelStore((state) => state.refreshModels);
  const refreshStats = useModelStore((state) => state.refreshStats);
  const loadModel = useModelStore((state) => state.loadModel);

  const activeDitModel = useMemo(
    () => models.find((model) => model.kind === 'dit' && model.isLoaded) ?? null,
    [models],
  );
  const activeLmModel = useMemo(
    () => models.find((model) => model.kind === 'lm' && model.isLoaded) ?? null,
    [models],
  );
  const pinnedModels = useMemo(
    () => models.filter((model) => pinnedModelIds.includes(model.id)),
    [models, pinnedModelIds],
  );

  const visibleModels = activeTab === 'pinned' ? pinnedModels : models;

  useEffect(() => {
    if (!show || !project) return;
    void refreshModels();
    void refreshStats();
  }, [project, refreshModels, refreshStats, show]);

  if (!show || !project) return null;

  return (
    <aside
      className="fixed right-0 top-11 bottom-6 flex w-[24rem] flex-col border-l border-[#343434] bg-[#171717]/95 shadow-2xl backdrop-blur-sm"
      style={{ zIndex: Z.panel }}
      aria-label="Model Library"
      data-testid="model-library-panel"
    >
      <div className="border-b border-[#303030] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Model Library</h2>
            <p className="mt-1 text-[11px] text-zinc-400">
              Browse backend DiT and LM models, pin favorites, and switch without opening Settings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-200"
            aria-label="Close model library"
          >
            &times;
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-[#202020] p-1">
          {([
            ['all', 'All Models'],
            ['pinned', 'Pinned'],
            ['active', 'Active'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-daw-accent text-white'
                  : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{models.length} models discovered</span>
          <button
            type="button"
            onClick={() => {
              void refreshModels();
              void refreshStats();
            }}
            className="rounded-md bg-[#242424] px-2 py-1 text-zinc-300 transition-colors hover:bg-[#2d2d2d]"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {errorMessage && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
            {errorMessage}
          </div>
        )}
        {statusMessage && !errorMessage && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
            {statusMessage}
          </div>
        )}

        {activeTab === 'active' ? (
          <div className="space-y-3">
            <section className="rounded-xl border border-[#343434] bg-[#202020] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Current Models</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[11px] text-zinc-500">Active DiT</div>
                  <div className="mt-1 text-sm text-zinc-100">{activeDitModel?.name ?? 'No DiT model loaded'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">Active LM</div>
                  <div className="mt-1 text-sm text-zinc-100">{activeLmModel?.name ?? 'No LM model loaded'}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {llmInitialized ? 'Language model runtime initialized' : 'Language model runtime not initialized'}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#343434] bg-[#202020] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Backend Stats</h3>
                <button
                  type="button"
                  onClick={() => void refreshStats()}
                  className="rounded-md bg-[#2a2a2a] px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-[#323232]"
                >
                  {isRefreshingStats ? 'Refreshing...' : 'Refresh Stats'}
                </button>
              </div>

              {stats ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-[#171717] p-2">
                    <div className="text-zinc-500">Queue Size</div>
                    <div className="mt-1 text-base font-semibold text-zinc-100">{stats.queue_size}</div>
                  </div>
                  <div className="rounded-lg bg-[#171717] p-2">
                    <div className="text-zinc-500">Average Job Time</div>
                    <div className="mt-1 text-base font-semibold text-zinc-100">{formatSeconds(stats.avg_job_seconds)}</div>
                  </div>
                  <div className="rounded-lg bg-[#171717] p-2">
                    <div className="text-zinc-500">Running Jobs</div>
                    <div className="mt-1 text-base font-semibold text-zinc-100">{stats.jobs.running}</div>
                  </div>
                  <div className="rounded-lg bg-[#171717] p-2">
                    <div className="text-zinc-500">Succeeded Jobs</div>
                    <div className="mt-1 text-base font-semibold text-zinc-100">{stats.jobs.succeeded}</div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">No backend stats available yet.</p>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleModels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#3a3a3a] px-4 py-6 text-center text-sm text-zinc-500">
                {activeTab === 'pinned' ? 'No pinned models yet.' : 'No models returned by the backend.'}
              </div>
            ) : (
              visibleModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  pinned={pinnedModelIds.includes(model.id)}
                  loading={isLoadingModel && loadingModelId === model.id}
                  onPinToggle={() => togglePinnedModel(model.id)}
                  onLoad={() => void loadModel(model.id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

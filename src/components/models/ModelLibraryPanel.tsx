import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useModelStore } from '../../store/modelStore';
import { useCustomModelStore } from '../../store/customModelStore';
import { Z } from '../../utils/zIndex';
import { ModelCard } from './ModelCard';

type Tab = 'all' | 'pinned' | 'active';

export function ModelLibraryPanel() {
  const show = useUIStore((s) => s.showModelLibrary);
  const setShow = useUIStore((s) => s.setShowModelLibrary);
  const availableModels = useModelStore((s) => s.availableModels);
  const availableLmModels = useModelStore((s) => s.availableLmModels);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeLmModelId = useModelStore((s) => s.activeLmModelId);
  const pinnedModelIds = useModelStore((s) => s.pinnedModelIds);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const connected = useModelStore((s) => s.connected);
  const stats = useModelStore((s) => s.stats);
  const switchModel = useModelStore((s) => s.switchModel);
  const pinModel = useModelStore((s) => s.pinModel);
  const unpinModel = useModelStore((s) => s.unpinModel);
  const startPolling = useModelStore((s) => s.startPolling);
  const fetchStats = useModelStore((s) => s.fetchStats);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingModelName, setLoadingModelName] = useState<string | null>(null);
  useEffect(() => { if (!show) return; const cleanup = startPolling(); return cleanup; }, [show, startPolling]);
  useEffect(() => { if (show && activeTab === 'active') { void fetchStats(); } }, [show, activeTab, fetchStats]);
  useEffect(() => { if (modelLoadingState !== 'loading') { setLoadingModelName(null); } }, [modelLoadingState]);
  const handleLoad = useCallback(async (name: string) => { setLoadingModelName(name); await switchModel(name); }, [switchModel]);
  const handleTogglePin = useCallback((name: string) => { if (pinnedModelIds.includes(name)) { unpinModel(name); } else { pinModel(name); } }, [pinnedModelIds, pinModel, unpinModel]);
  const filteredModels = useMemo(() => {
    let models = availableModels;
    if (activeTab === 'pinned') { models = models.filter((m) => pinnedModelIds.includes(m.name)); }
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); models = models.filter((m) => m.name.toLowerCase().includes(q)); }
    return models;
  }, [availableModels, activeTab, pinnedModelIds, searchQuery]);
  const activeModel = useMemo(() => availableModels.find((m) => m.name === activeModelId), [availableModels, activeModelId]);
  if (!show) return null;
  const tabs: { id: Tab; label: string }[] = [{ id: 'all', label: 'All Models' }, { id: 'pinned', label: 'Pinned' }, { id: 'active', label: 'Active' }];
  return (
    <div data-testid="model-library-panel" className="fixed top-10 right-0 bottom-6 w-80 bg-zinc-900/95 backdrop-blur-md border-l border-zinc-700/50 flex flex-col shadow-2xl" style={{ zIndex: Z.panel }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-sm font-semibold text-zinc-200">Model Library</h2>
        <div className="flex items-center gap-2">
          {!connected && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300">Disconnected</span>)}
          <button data-testid="model-library-close" onClick={() => setShow(false)} className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors" title="Close (Shift+M)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      <div className="flex border-b border-zinc-700/50" role="tablist">
        {tabs.map((tab) => (<button key={tab.id} role="tab" aria-selected={activeTab === tab.id} aria-label={tab.label} onClick={() => setActiveTab(tab.id)} className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === tab.id ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}>{tab.label}</button>))}
      </div>
      {activeTab === 'active' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">DIT Model</h3>
            {activeModel ? (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/60 p-3">
                <div className="flex items-center gap-2 mb-2"><div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" /><span className="text-sm font-medium text-zinc-200">{activeModel.name}</span></div>
                {activeModel.supported_task_types && activeModel.supported_task_types.length > 0 && (<div className="flex flex-wrap gap-1 mb-2">{activeModel.supported_task_types.map((type) => (<span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400">{type}</span>))}</div>)}
              </div>
            ) : (<p className="text-xs text-zinc-500">No model loaded</p>)}
          </div>
          <div>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">LM Model</h3>
            {activeLmModelId ? (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/60 p-3"><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" /><span className="text-sm font-medium text-zinc-200">{activeLmModelId}</span></div></div>
            ) : (<p className="text-xs text-zinc-500">No LM model loaded</p>)}
          </div>
          {stats && (
            <div>
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Server Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-zinc-800/60 p-2"><div className="text-[10px] text-zinc-500">Total Jobs</div><div className="text-sm font-medium text-zinc-200 tabular-nums">{stats.jobs.total}</div></div>
                <div className="rounded-lg bg-zinc-800/60 p-2"><div className="text-[10px] text-zinc-500">Queue</div><div className="text-sm font-medium text-zinc-200 tabular-nums">{stats.queue_size}/{stats.queue_maxsize}</div></div>
                <div className="rounded-lg bg-zinc-800/60 p-2"><div className="text-[10px] text-zinc-500">Running</div><div className="text-sm font-medium text-zinc-200 tabular-nums">{stats.jobs.running}</div></div>
                <div className="rounded-lg bg-zinc-800/60 p-2"><div className="text-[10px] text-zinc-500">Avg Time</div><div className="text-sm font-medium text-zinc-200 tabular-nums">{stats.avg_job_seconds.toFixed(1)}s</div></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 py-2"><input type="text" placeholder="Search models..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700/50 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors" /></div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
            {filteredModels.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">{activeTab === 'pinned' ? 'No pinned models yet' : searchQuery ? 'No models match your search' : 'No models available'}</div>
            ) : (filteredModels.map((model) => (<ModelCard key={model.name} model={model} isPinned={pinnedModelIds.includes(model.name)} isLoading={loadingModelName === model.name && modelLoadingState === 'loading'} onLoad={handleLoad} onTogglePin={handleTogglePin} />)))}
          </div>
        </>
      )}
      <CustomModelsLink />
    </div>
  );
}

function CustomModelsLink() {
  const setShowCustomModels = useUIStore((s) => s.setShowCustomModels);
  const customModelCount = useCustomModelStore((s) => s.customModels.length);

  return (
    <div className="border-t border-zinc-700/50 px-4 py-2.5">
      <button
        onClick={() => setShowCustomModels(true)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-xs"
        data-testid="open-custom-models"
        aria-label="Open custom models panel"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-zinc-400">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-zinc-300">Custom Models</span>
        </div>
        {customModelCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-medium">
            {customModelCount}
          </span>
        )}
      </button>
    </div>
  );
}

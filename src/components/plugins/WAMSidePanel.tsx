/**
 * WAMSidePanel — Side panel for browsing, loading, and managing WAM plugins.
 *
 * Mirrors the VST3SidePanel structure: browser at top, active plugins below.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWAMStore } from '../../store/wamStore';
import { useProjectStore } from '../../store/projectStore';
import { WAMPluginBrowser } from './WAMPluginBrowser';
import { WAMPluginPanel } from './WAMPluginPanel';
import { Z } from '../../utils/zIndex';
import type { WAMCatalogEntry, WAMActiveInstance } from '../../types/wam';

export function WAMSidePanel() {
  const show = useUIStore((s) => s.showWAMPanel);
  const setShow = useUIStore((s) => s.setShowWAMPanel);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const firstTrackId = useProjectStore((s) => s.project?.tracks[0]?.id ?? '');
  const loadPlugin = useWAMStore((s) => s.loadPlugin);
  const instances = useWAMStore((s) => s.instances);
  const pluginOrder = useWAMStore((s) => s.pluginOrder);
  const tracks = useProjectStore((s) => s.project?.tracks) ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Delay unmount for exit animation
  const [renderPanel, setRenderPanel] = useState(show);
  useEffect(() => {
    if (show) setRenderPanel(true);
    else {
      const t = setTimeout(() => setRenderPanel(false), 300);
      return () => clearTimeout(t);
    }
  }, [show]);

  const handleLoadPlugin = useCallback(
    (entry: WAMCatalogEntry) => {
      const [firstSelected] = selectedTrackIds;
      const trackId = firstSelected ?? firstTrackId;
      if (!trackId) return;
      loadPlugin(entry, trackId);
    },
    [selectedTrackIds, firstTrackId, loadPlugin],
  );

  const instanceList = useMemo(
    () => Object.values(instances),
    [instances],
  );

  const trackNameMap = useMemo(
    () => new Map(tracks.map((t) => [t.id, t.displayName])),
    [tracks],
  );

  // Group instances by track
  const trackGroups = useMemo(() => {
    const groups = new Map<string, WAMActiveInstance[]>();
    for (const inst of instanceList) {
      const list = groups.get(inst.trackId) ?? [];
      list.push(inst);
      groups.set(inst.trackId, list);
    }
    // Sort by pluginOrder
    for (const [trackId, list] of groups) {
      const order = pluginOrder[trackId];
      if (order) {
        const orderMap = new Map(order.map((id, idx) => [id, idx]));
        list.sort(
          (a, b) =>
            (orderMap.get(a.instanceId) ?? Infinity) -
            (orderMap.get(b.instanceId) ?? Infinity),
        );
      }
    }
    return groups;
  }, [instanceList, pluginOrder]);

  if (!renderPanel && !show) return null;

  return (
    <aside
      className={`fixed right-0 top-10 bottom-6 flex w-80 flex-col border-l border-[#333] bg-[#1e1e1e] shadow-2xl transition-all duration-300 ease-out ${
        show
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-[calc(100%+28px)] opacity-0'
      }`}
      style={{ zIndex: Z.panel }}
      data-testid="wam-side-panel"
      aria-label="WAM Plugin Browser"
      aria-hidden={!show}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200">WAM Plugins</span>
          <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">
            Web Audio
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#404040] bg-[#262626] text-zinc-400 transition-colors hover:border-[#555] hover:text-zinc-200"
          aria-label="Close WAM panel"
          data-testid="wam-panel-close"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Plugin Browser */}
        <WAMPluginBrowser onLoadPlugin={handleLoadPlugin} />

        {/* Active Plugins Section */}
        <div className="flex flex-col" data-testid="wam-active-plugins">
          <div className="flex items-center justify-between px-3 py-2 border-t border-[#333]">
            <span className="text-xs font-semibold text-zinc-200">Active WAM Plugins</span>
            <span className="text-[10px] text-zinc-500">{instanceList.length}</span>
          </div>

          {instanceList.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
              No WAM plugins loaded. Browse and load a plugin above.
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              {Array.from(trackGroups.entries()).map(([trackId, group]) => (
                <div key={trackId}>
                  <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                      {trackNameMap.get(trackId) ?? trackId}
                    </span>
                    <span className="text-[9px] text-zinc-600">({group.length})</span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {group.map((inst) => (
                      <div key={inst.instanceId}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === inst.instanceId ? null : inst.instanceId,
                            )
                          }
                          className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                            expandedId === inst.instanceId
                              ? 'bg-blue-500/10 border border-blue-500/20'
                              : 'hover:bg-white/5 border border-transparent'
                          } ${!inst.enabled ? 'opacity-50' : ''}`}
                          data-testid={`wam-active-instance-${inst.instanceId}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              inst.enabled ? 'bg-green-400' : 'bg-zinc-600'
                            }`}
                          />
                          <span className="flex-1 truncate text-[11px] font-medium text-zinc-200">
                            {inst.pluginName}
                          </span>
                          <svg
                            className={`h-3 w-3 text-zinc-500 transition-transform ${
                              expandedId === inst.instanceId ? 'rotate-90' : ''
                            }`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {expandedId === inst.instanceId && (
                          <div className="mt-1">
                            <WAMPluginPanel instanceId={inst.instanceId} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

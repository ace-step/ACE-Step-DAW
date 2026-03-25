import { useMemo, useState } from 'react';
import { useVST3Store } from '../../store/vst3Store';
import { useProjectStore } from '../../store/projectStore';
import { VST3PluginPanel } from './VST3PluginPanel';

const EMPTY_TRACKS: never[] = [];

export function ActivePlugins() {
  const instances = useVST3Store((s) => s.instances);
  const tracks = useProjectStore((s) => s.project?.tracks) ?? EMPTY_TRACKS;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const instanceList = useMemo(() => Object.values(instances), [instances]);

  const trackNameMap = useMemo(
    () => new Map(tracks.map((t) => [t.id, t.displayName])),
    [tracks],
  );

  return (
    <div className="flex flex-col" data-testid="active-plugins-section">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <span className="text-xs font-semibold text-zinc-200">Active Plugins</span>
        <span className="text-[10px] text-zinc-500">{instanceList.length}</span>
      </div>

      {instanceList.length === 0 ? (
        <div
          className="px-3 py-4 text-center text-[11px] text-zinc-500"
          data-testid="active-plugins-empty"
        >
          No plugins loaded. Browse and load a plugin above.
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {instanceList.map((inst) => (
            <div key={inst.instanceId}>
              <button
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === inst.instanceId ? null : inst.instanceId)
                }
                className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  expandedId === inst.instanceId
                    ? 'bg-violet-500/10 border border-violet-500/20'
                    : 'hover:bg-white/5 border border-transparent'
                } ${!inst.enabled ? 'opacity-50' : ''}`}
                data-testid={`active-instance-${inst.instanceId}`}
              >
                {/* Enable indicator dot */}
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    inst.enabled ? 'bg-green-400' : 'bg-zinc-600'
                  }`}
                />
                <span className="flex-1 truncate text-[11px] font-medium text-zinc-200">
                  {inst.pluginName}
                </span>
                <span className="truncate text-[10px] text-zinc-500 max-w-[80px]">
                  {trackNameMap.get(inst.trackId) ?? inst.trackId}
                </span>
                {/* Chevron */}
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

              {/* Expanded panel */}
              {expandedId === inst.instanceId && (
                <div className="mt-1">
                  <VST3PluginPanel instanceId={inst.instanceId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

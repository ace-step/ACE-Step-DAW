import { useMemo, useState, useCallback, useRef } from 'react';
import { useVST3Store } from '../../store/vst3Store';
import { useProjectStore } from '../../store/projectStore';
import { VST3PluginPanel } from './VST3PluginPanel';
import type { VST3ActiveInstance } from '../../types/vst3';

const EMPTY_TRACKS: never[] = [];

export function ActivePlugins() {
  const instances = useVST3Store((s) => s.instances);
  const pluginOrder = useVST3Store((s) => s.pluginOrder);
  const reorderPlugins = useVST3Store((s) => s.reorderPlugins);
  const tracks = useProjectStore((s) => s.project?.tracks) ?? EMPTY_TRACKS;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceRef = useRef<{ instanceId: string; trackId: string } | null>(null);

  const instanceList = useMemo(() => Object.values(instances), [instances]);

  const trackNameMap = useMemo(
    () => new Map(tracks.map((t) => [t.id, t.displayName])),
    [tracks],
  );

  // Group instances by trackId, respecting pluginOrder
  const trackGroups = useMemo(() => {
    const groups = new Map<string, VST3ActiveInstance[]>();
    for (const inst of instanceList) {
      const list = groups.get(inst.trackId) ?? [];
      list.push(inst);
      groups.set(inst.trackId, list);
    }
    // Sort each group by pluginOrder if available
    for (const [trackId, list] of groups) {
      const order = pluginOrder[trackId];
      if (order) {
        const orderMap = new Map(order.map((id, idx) => [id, idx]));
        list.sort((a, b) => {
          const ai = orderMap.get(a.instanceId) ?? Infinity;
          const bi = orderMap.get(b.instanceId) ?? Infinity;
          return ai - bi;
        });
      }
    }
    return groups;
  }, [instanceList, pluginOrder]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, instanceId: string, trackId: string) => {
      dragSourceRef.current = { instanceId, trackId };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', instanceId);
      // Set opacity on the dragged element
      const target = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => {
        target.style.opacity = '0.4';
      });
    },
    [],
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    dragSourceRef.current = null;
    setDragOverTrackId(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, trackId: string, index: number) => {
      e.preventDefault();
      if (!dragSourceRef.current) return;
      // Only allow reorder within the same track
      if (dragSourceRef.current.trackId !== trackId) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'move';
      // Guard: only update state when values actually change
      setDragOverTrackId((prev) => (prev === trackId ? prev : trackId));
      setDragOverIndex((prev) => (prev === index ? prev : index));
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, trackId: string, dropIndex: number) => {
      e.preventDefault();
      setDragOverTrackId(null);
      setDragOverIndex(null);

      if (!dragSourceRef.current) return;
      if (dragSourceRef.current.trackId !== trackId) return;

      const group = trackGroups.get(trackId);
      if (!group) return;

      const currentOrder = group.map((inst) => inst.instanceId);
      const sourceIdx = currentOrder.indexOf(dragSourceRef.current.instanceId);
      if (sourceIdx < 0) return;

      // Remove source from current position and insert at drop position
      const newOrder = [...currentOrder];
      const [moved] = newOrder.splice(sourceIdx, 1);
      const insertAt = dropIndex > sourceIdx ? dropIndex - 1 : dropIndex;
      newOrder.splice(insertAt, 0, moved);

      reorderPlugins(trackId, newOrder);
      dragSourceRef.current = null;
    },
    [trackGroups, reorderPlugins],
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
        <div className="flex flex-col gap-2 p-2" data-testid="active-plugins-list">
          {Array.from(trackGroups.entries()).map(([trackId, group]) => (
            <div key={trackId} data-testid={`track-group-${trackId}`}>
              {/* Track header */}
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                  {trackNameMap.get(trackId) ?? trackId}
                </span>
                <span className="text-[9px] text-zinc-600">({group.length})</span>
              </div>

              {/* Draggable plugin rows */}
              <div className="flex flex-col gap-0.5">
                {group.map((inst, index) => (
                  <div
                    key={inst.instanceId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, inst.instanceId, trackId)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, trackId, index)}
                    onDrop={(e) => handleDrop(e, trackId, index)}
                    data-testid={`plugin-row-${inst.instanceId}`}
                    data-track-id={trackId}
                    data-instance-id={inst.instanceId}
                  >
                    {/* Drop indicator line */}
                    {dragOverTrackId === trackId && dragOverIndex === index && (
                      <div
                        className="h-0.5 bg-violet-500 rounded-full mx-1 mb-0.5"
                        data-testid="drop-indicator"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expandedId === inst.instanceId ? null : inst.instanceId)
                      }
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors cursor-grab active:cursor-grabbing ${
                        expandedId === inst.instanceId
                          ? 'bg-violet-500/10 border border-violet-500/20'
                          : 'hover:bg-white/5 border border-transparent'
                      } ${!inst.enabled ? 'opacity-50' : ''}`}
                      data-testid={`active-instance-${inst.instanceId}`}
                    >
                      {/* Drag handle */}
                      <svg
                        className="h-3 w-3 text-zinc-600 shrink-0"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <circle cx="9" cy="6" r="1.5" />
                        <circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" />
                        <circle cx="15" cy="18" r="1.5" />
                      </svg>
                      {/* Enable indicator dot */}
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          inst.enabled ? 'bg-green-400' : 'bg-zinc-600'
                        }`}
                      />
                      <span className="flex-1 truncate text-[11px] font-medium text-zinc-200">
                        {inst.pluginName}
                      </span>
                      {/* Chain position indicator */}
                      <span className="text-[9px] text-zinc-600 tabular-nums">
                        {index + 1}/{group.length}
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
                {/* Drop zone at end of list */}
                <div
                  onDragOver={(e) => handleDragOver(e, trackId, group.length)}
                  onDrop={(e) => handleDrop(e, trackId, group.length)}
                  className="h-1"
                  data-testid={`drop-zone-end-${trackId}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

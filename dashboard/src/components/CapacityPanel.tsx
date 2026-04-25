import type { DashboardSnapshot } from '../types';

interface Props { snapshot: DashboardSnapshot; }

function CapacityBar({ label, running, max, color }: { label: string; running: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((running / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{running}/{max}</span>
      </div>
      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CapacityPanel({ snapshot }: Props) {
  const { claude, codex } = snapshot.capacity;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-4">Agent Capacity</h2>
      <div className="space-y-4">
        <CapacityBar label="Claude Code" running={claude.running} max={claude.max} color="bg-amber-500" />
        <CapacityBar label="Codex" running={codex.running} max={codex.max} color="bg-blue-500" />
      </div>

      {snapshot.agents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Running Agents</div>
          {snapshot.agents.filter(a => a.alive).map(agent => (
            <div key={agent.id} className="flex items-center justify-between text-xs py-1">
              <span className="text-zinc-300">#{agent.issue}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                agent.tool === 'claude' ? 'bg-amber-950 text-amber-400' : 'bg-blue-950 text-blue-400'
              }`}>{agent.tool}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metrics tiles */}
      <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-2">
        <MetricTile label="Closed today" value={snapshot.metrics.closedToday} />
        <MetricTile label="Merged today" value={snapshot.metrics.mergedToday} />
        <MetricTile label="Open PRs" value={snapshot.metrics.openPRs} />
        <MetricTile label="Avg merge (h)" value={snapshot.metrics.avgMergeHours ?? '—'} />
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-zinc-800/50 rounded p-2 text-center">
      <div className="text-lg font-semibold text-zinc-200">{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

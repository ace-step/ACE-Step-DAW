import { useEffect } from 'react';
import { useDashboardStore } from './store';
import { CapacityPanel } from './components/CapacityPanel';
import { PipelineKanban } from './components/PipelineKanban';
import { ActivityFeed } from './components/ActivityFeed';
import { PRStatusCards } from './components/PRStatusCards';

export function App() {
  const { connected, snapshot, connect, disconnect } = useDashboardStore();

  useEffect(() => { connect(); return () => disconnect(); }, [connect, disconnect]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-100">Agent Dashboard</h1>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
            connected ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </div>
        {snapshot && (
          <span className="text-xs text-zinc-500">
            Updated {new Date(snapshot.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {!snapshot ? (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          {connected ? 'Waiting for data...' : 'Connecting to dashboard server...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top row: Capacity + Metrics */}
          <CapacityPanel snapshot={snapshot} />
          <PRStatusCards snapshot={snapshot} />

          {/* Middle: Pipeline (full width) */}
          <div className="lg:col-span-3">
            <PipelineKanban snapshot={snapshot} />
          </div>

          {/* Bottom: Activity Feed (full width) */}
          <div className="lg:col-span-3">
            <ActivityFeed snapshot={snapshot} />
          </div>
        </div>
      )}
    </div>
  );
}

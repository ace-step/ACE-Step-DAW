import type { DashboardSnapshot, PipelineItem } from '../types';

interface Props { snapshot: DashboardSnapshot; }

const STAGES: { key: PipelineItem['stage']; label: string; color: string }[] = [
  { key: 'open', label: 'Open', color: 'border-zinc-600' },
  { key: 'in_progress', label: 'In Progress', color: 'border-amber-600' },
  { key: 'pr_open', label: 'PR Open', color: 'border-blue-600' },
  { key: 'ci_running', label: 'CI Running', color: 'border-yellow-600' },
  { key: 'ci_failed', label: 'CI Failed', color: 'border-red-600' },
  { key: 'ci_passed', label: 'CI Passed', color: 'border-emerald-600' },
  { key: 'review', label: 'Review', color: 'border-purple-600' },
];

function IssueCard({ item }: { item: PipelineItem }) {
  return (
    <div className="bg-zinc-800/80 rounded p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-zinc-300">#{item.number}</span>
        {item.tool && (
          <span className={`px-1 py-0.5 rounded text-[9px] ${
            item.tool === 'claude' ? 'bg-amber-950 text-amber-400' : 'bg-blue-950 text-blue-400'
          }`}>{item.tool}</span>
        )}
      </div>
      <div className="text-zinc-400 truncate" title={item.title}>{item.title}</div>
      {item.prNumber && (
        <div className="text-zinc-500 mt-1">PR #{item.prNumber}</div>
      )}
    </div>
  );
}

export function PipelineKanban({ snapshot }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-4">Pipeline</h2>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {STAGES.map(stage => {
          const items = snapshot.pipeline.filter(i => i.stage === stage.key);
          return (
            <div key={stage.key} className={`flex-shrink-0 w-44 border-t-2 ${stage.color} bg-zinc-800/30 rounded p-2`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">{stage.label}</span>
                <span className="text-xs text-zinc-500 bg-zinc-800 rounded-full px-1.5">{items.length}</span>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {items.map(item => <IssueCard key={item.number} item={item} />)}
                {items.length === 0 && (
                  <div className="text-[10px] text-zinc-600 text-center py-4">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

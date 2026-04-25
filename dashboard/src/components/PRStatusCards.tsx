import type { DashboardSnapshot, PRStatus } from '../types';

interface Props { snapshot: DashboardSnapshot; }

const CI_ICONS: Record<PRStatus['ciStatus'], { icon: string; color: string }> = {
  passing: { icon: '✓', color: 'text-emerald-400' },
  failing: { icon: '✗', color: 'text-red-400' },
  pending: { icon: '◌', color: 'text-yellow-400' },
  unknown: { icon: '?', color: 'text-zinc-500' },
};

const REVIEW_LABELS: Record<PRStatus['reviewStatus'], { label: string; color: string }> = {
  approved: { label: 'Approved', color: 'text-emerald-400' },
  changes_requested: { label: 'Changes', color: 'text-red-400' },
  pending: { label: 'Pending', color: 'text-yellow-400' },
  none: { label: '—', color: 'text-zinc-600' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function PRCard({ pr }: { pr: PRStatus }) {
  const ci = CI_ICONS[pr.ciStatus];
  const review = REVIEW_LABELS[pr.reviewStatus];
  return (
    <div className="bg-zinc-800/60 rounded p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-zinc-300">#{pr.number}</span>
        <span className="text-[10px] text-zinc-500">{timeAgo(pr.createdAt)}</span>
      </div>
      <div className="text-xs text-zinc-400 truncate mb-2" title={pr.title}>{pr.title}</div>
      <div className="flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1 ${ci.color}`}>
          <span>{ci.icon}</span> CI
        </span>
        <span className={`${review.color}`}>{review.label}</span>
        <span className="text-zinc-600 font-mono text-[10px] truncate ml-auto">{pr.branch}</span>
      </div>
    </div>
  );
}

export function PRStatusCards({ snapshot }: Props) {
  return (
    <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Open PRs</h2>
      {snapshot.prs.length === 0 ? (
        <div className="text-zinc-600 text-xs text-center py-8">No open PRs</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
          {snapshot.prs.map(pr => <PRCard key={pr.number} pr={pr} />)}
        </div>
      )}
    </div>
  );
}

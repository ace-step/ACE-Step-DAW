import { useRef, useEffect, useState } from 'react';
import { useDashboardStore } from '../store';
import type { DashboardSnapshot } from '../types';

interface Props { snapshot: DashboardSnapshot; }

export function ActivityFeed({ snapshot }: Props) {
  const { activityFilter, setActivityFilter } = useDashboardStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = snapshot.activity.filter(e =>
    !activityFilter || e.raw.toLowerCase().includes(activityFilter.toLowerCase())
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-400">Activity Log</h2>
        <input
          type="text"
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
          placeholder="Filter..."
          className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 w-40 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="font-mono text-[11px] leading-5 h-48 overflow-y-auto space-y-0.5"
      >
        {filtered.length === 0 ? (
          <div className="text-zinc-600 text-center py-8">
            {snapshot.activity.length === 0 ? 'No activity — pm-auto.sh has not run yet' : 'No matching entries'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="flex gap-2 hover:bg-zinc-800/50 px-1 rounded">
              <span className="text-zinc-600 flex-shrink-0 w-20 truncate">{entry.timestamp}</span>
              <span className="text-zinc-500 flex-shrink-0 w-24 truncate">{entry.source}</span>
              <span className="text-zinc-300 truncate">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

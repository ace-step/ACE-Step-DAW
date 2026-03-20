import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';

const HEALTH_POLL_INTERVAL_MS = 10_000;

let lastKnownBackendConnection = false;

export function StatusBar() {
  const [connected, setConnected] = useState(lastKnownBackendConnection);
  const jobs = useGenerationStore((s) => s.jobs);
  const activeJobs = [...jobs]
    .filter((j) => j.status === 'generating' || j.status === 'queued' || j.status === 'processing')
    .sort((a, b) => (a.lastUpdatedAt ?? 0) - (b.lastUpdatedAt ?? 0));
  const primaryJob = activeJobs[activeJobs.length - 1] ?? null;
  const model = useProjectStore((s) => s.project?.generationDefaults.model);

  useEffect(() => {
    let active = true;
    let interval: number | null = null;
    const check = async () => {
      const ok = await healthCheck();
      lastKnownBackendConnection = ok;
      if (active) setConnected(ok);
    };

    const timeout = window.setTimeout(() => {
      void check();
      interval = window.setInterval(check, HEALTH_POLL_INTERVAL_MS);
    }, HEALTH_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, []);

  return (
    <div className="flex items-center h-5 px-3 gap-4 bg-gradient-to-b from-[#2a2a2a] to-[#232323] border-t border-[#1a1a1a] text-[10px] text-zinc-400">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span>{connected ? 'Connected' : 'Offline'}</span>
      </div>
      {model && <span className="text-zinc-400">{model}</span>}
      {activeJobs.length > 0 && (
        <span className="text-daw-accent">
          Generating: {activeJobs.length}
          {primaryJob ? ` • ${primaryJob.trackName} • ${primaryJob.stage ?? primaryJob.progress}${primaryJob.progressPercent != null ? ` ${Math.round(primaryJob.progressPercent)}%` : ''}` : ''}
        </span>
      )}
      {primaryJob && (
        <span className="truncate text-zinc-500">
          {primaryJob.trackName}: {primaryJob.stage ?? primaryJob.status} {Math.round(primaryJob.progressPercent ?? 0)}%
        </span>
      )}
      <span className="flex-1" />
      <a
        href="http://acestudio.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-zinc-400 hover:text-daw-accent transition-colors"
      >
        <img src="/logo.png" alt="" width={12} height={12} className="rounded-sm opacity-50" />
        ACE Studio
      </a>
    </div>
  );
}

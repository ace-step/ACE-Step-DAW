import { useState, useEffect } from 'react';
import { healthCheck } from '../../services/aceStepApi';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';

export function StatusBar() {
  const [connected, setConnected] = useState(false);
  const jobs = useGenerationStore((s) => s.jobs);
  const activeJobs = jobs.filter((j) => j.status === 'generating' || j.status === 'queued');
  const model = useProjectStore((s) => s.project?.generationDefaults.model);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await healthCheck();
      if (active) setConnected(ok);
    };
    check();
    const interval = setInterval(check, 10000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return (
    <div className="flex items-center h-6 px-3 gap-4 bg-daw-surface border-t border-daw-border text-[11px] text-zinc-500">
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <span>{model || 'Server Default'}</span>
      {activeJobs.length > 0 && (
        <span>Queue: {activeJobs.length}</span>
      )}
      <span className="flex-1" />
      <a
        href="http://acestudio.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-zinc-500 hover:text-violet-400 transition-colors"
      >
        <img src="/logo.png" alt="" width={14} height={14} className="rounded-sm opacity-60" />
        ACE Studio ↗
      </a>
    </div>
  );
}

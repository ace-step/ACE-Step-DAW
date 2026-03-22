import { useGenerationStore } from '../../store/generationStore';
import { formatEtaDisplay } from '../../utils/generationProgress';

export function GenerationPanel() {
  const jobs = useGenerationStore((s) => s.jobs);
  const clearCompletedJobs = useGenerationStore((s) => s.clearCompletedJobs);

  const visibleJobs = [...jobs]
    .filter((job) => job.status === 'queued' || job.status === 'generating' || job.status === 'processing' || job.status === 'error')
    .sort((a, b) => (b.lastUpdatedAt ?? 0) - (a.lastUpdatedAt ?? 0));
  const hasCompletedJobs = jobs.some((j) => j.status === 'done' || j.status === 'error');

  return (
    <div className="border-t border-[#1a1a1a] bg-[#2a2a2a]">
      <div className="flex items-center h-9 px-3 gap-3">
        {(visibleJobs.length > 0 || hasCompletedJobs) && (
          <>
            <div className="flex-1 flex items-center gap-2 overflow-x-auto text-xs">
              {visibleJobs.map((job) => {
                const eta = formatEtaDisplay(job.etaSeconds ?? null);
                const progressPercent = Math.round(job.progressPercent ?? 0);
                const isActive = job.status === 'queued' || job.status === 'generating' || job.status === 'processing';
                return (
                  <div
                    key={job.id}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                      job.status === 'done'
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : job.status === 'error'
                          ? 'bg-red-900/50 text-red-300'
                          : job.status === 'processing'
                            ? 'bg-amber-900/50 text-amber-300'
                            : job.status === 'generating'
                              ? 'bg-indigo-900/50 text-indigo-300'
                              : 'bg-[#333] text-zinc-400'
                    }`}
                    title={job.status === 'error' ? (job.actionableMessage ?? job.error) : undefined}
                  >
                    {(job.status === 'generating' || job.status === 'processing') && (
                      <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {job.status === 'error' && (
                      <span className="text-red-400">✕</span>
                    )}
                    <span className="uppercase">{job.trackName}</span>
                    <span className="text-[10px] opacity-70">
                      {job.status === 'error'
                        ? (job.actionableMessage ?? job.error ?? 'Failed')
                        : (job.stage ?? job.progress)}
                    </span>
                    {isActive && (
                      <div
                        className="h-1.5 w-14 overflow-hidden rounded-full bg-black/30"
                        role="progressbar"
                        aria-label={`${job.trackName} generation progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPercent}
                        aria-valuetext={`${job.stage ?? job.status}: ${progressPercent}%`}
                      >
                        <div
                          className="h-full rounded-full bg-current transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    {eta !== '' && <span className="text-[10px] opacity-60">ETA {eta}</span>}
                  </div>
                );
              })}
            </div>

            {hasCompletedJobs && (
              <button
                onClick={clearCompletedJobs}
                className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useGenerationStore } from '../../store/generationStore';
import { retryGenerationJob } from '../../services/generationPipeline';
import { formatEtaDisplay } from '../../utils/generationProgress';

export function GenerationPanel() {
  const jobs = useGenerationStore((s) => s.jobs);
  const clearCompletedJobs = useGenerationStore((s) => s.clearCompletedJobs);
  const cancelJob = useGenerationStore((s) => s.cancelJob);
  const cancelAllJobs = useGenerationStore((s) => s.cancelAllJobs);

  const visibleJobs = [...jobs]
    .filter((job) => job.status === 'queued' || job.status === 'generating' || job.status === 'processing' || job.status === 'error' || job.status === 'cancelled')
    .sort((a, b) => (b.lastUpdatedAt ?? 0) - (a.lastUpdatedAt ?? 0));
  const hasCompletedJobs = jobs.some((j) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled');
  const activeJobCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'generating' || j.status === 'processing',
  ).length;

  // Precompute queue positions from stable insertion order (jobs array order by startedAt)
  const queuePositionMap = new Map<string, number>();
  let queuePos = 1;
  for (const job of [...jobs].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))) {
    if (job.status === 'queued' || job.status === 'generating' || job.status === 'processing') {
      queuePositionMap.set(job.id, queuePos++);
    }
  }

  return (
    <div className="border-t border-[#1a1a1a] bg-[#2a2a2a]">
      <div className="flex items-center h-9 px-3 gap-3">
        {(visibleJobs.length > 0 || hasCompletedJobs) && (
          <>
            <div className="flex-1 flex items-center gap-2 overflow-x-auto text-xs">
              {visibleJobs.map((job) => {
                const isActive = job.status === 'queued' || job.status === 'generating' || job.status === 'processing';
                const eta = isActive ? formatEtaDisplay(job.etaSeconds ?? null) : '';
                const progressPercent = Math.round(job.progressPercent ?? 0);
                const isRetryable = (job.status === 'error' || job.status === 'cancelled') && !!job.retryParams;

                // Queue position from stable precomputed map
                const queuePosition = job.status === 'queued' ? (queuePositionMap.get(job.id) ?? null) : null;

                return (
                  <div
                    key={job.id}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                      job.status === 'done'
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : job.status === 'error'
                          ? 'bg-red-900/50 text-red-300'
                          : job.status === 'cancelled'
                            ? 'bg-zinc-800/60 text-zinc-400'
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
                    {job.status === 'cancelled' && (
                      <span className="text-zinc-500">⊘</span>
                    )}
                    <span className="uppercase">{job.trackName}</span>
                    {queuePosition !== null && (
                      <span className="text-[9px] opacity-50">#{queuePosition}</span>
                    )}
                    {job.status === 'error' && job.errorCategory && (
                      <span className="px-1 py-px rounded text-[9px] bg-red-800/60 text-red-200 uppercase">
                        {job.errorCategory}
                      </span>
                    )}
                    <span className="text-[10px] opacity-70">
                      {job.status === 'error'
                        ? (job.actionableMessage ?? job.error ?? 'Failed')
                        : job.status === 'cancelled'
                          ? 'Cancelled'
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

                    {/* Cancel button for active jobs */}
                    {isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
                        className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/10 text-current opacity-50 hover:opacity-100 transition-opacity"
                        aria-label={`Cancel ${job.trackName} generation`}
                        title="Cancel generation"
                      >
                        ✕
                      </button>
                    )}

                    {/* Retry button for failed/cancelled jobs */}
                    {isRetryable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void retryGenerationJob(job.id); }}
                        className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/10 text-current opacity-50 hover:opacity-100 transition-opacity"
                        aria-label={`Retry ${job.trackName} generation`}
                        title="Retry generation"
                      >
                        ↻
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {activeJobCount >= 2 && (
                <button
                  onClick={cancelAllJobs}
                  className="text-[10px] text-red-400/70 hover:text-red-300 transition-colors"
                  aria-label="Cancel all active generations"
                >
                  Cancel All
                </button>
              )}
              {hasCompletedJobs && (
                <button
                  onClick={clearCompletedJobs}
                  className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

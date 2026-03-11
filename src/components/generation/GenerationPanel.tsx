import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { BatchGenerateModal } from './BatchGenerateModal';

export function GenerationPanel() {
  const jobs = useGenerationStore((s) => s.jobs);
  const clearCompletedJobs = useGenerationStore((s) => s.clearCompletedJobs);

  const modalMode = useUIStore((s) => s.batchGenerateMode);
  const setModalMode = useUIStore((s) => s.setBatchGenerateMode);

  return (
    <>
      {/* Modal (portal-style — rendered above everything) */}
      {modalMode && (
        <BatchGenerateModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
        />
      )}

      <div className="border-t border-daw-border bg-daw-surface">
        <div className="flex items-center h-9 px-3 gap-3">
          {jobs.length > 0 && (
            <>
              <div className="flex-1 flex items-center gap-2 overflow-x-auto text-xs">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                      job.status === 'done'
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : job.status === 'error'
                          ? 'bg-red-900/50 text-red-300'
                          : job.status === 'generating'
                            ? 'bg-indigo-900/50 text-indigo-300'
                            : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {job.status === 'generating' && (
                      <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    <span className="uppercase">{job.trackName}</span>
                    <span className="text-[9px] opacity-70">{job.progress}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={clearCompletedJobs}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

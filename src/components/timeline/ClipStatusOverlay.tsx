import type { Clip } from '../../types/project';
import type { GenerationJob } from '../../store/generationStore';

interface ClipStatusOverlayProps {
  clip: Clip;
  generatingProgress: string | number | null;
  generationJob: GenerationJob | null;
  isMidiClip: boolean;
}

export function ClipStatusOverlay({ clip, generatingProgress, generationJob, isMidiClip }: ClipStatusOverlayProps) {
  const isGenerating = generationJob?.status === 'generating' || generationJob?.status === 'processing';
  const isQueued = generationJob?.status === 'queued';
  const progressPct = generationJob?.progressPercent ?? null;

  return (
    <>
      {/* Generating: animated border + progress bar */}
      {isGenerating && (
        <div className="absolute inset-0 pointer-events-none rounded-md" data-testid="clip-generating-overlay">
          {/* Animated border glow */}
          <div className="absolute inset-0 rounded-md animate-pulse" style={{
            boxShadow: '0 0 0 1.5px rgba(99, 102, 241, 0.6), 0 0 8px rgba(99, 102, 241, 0.3)',
          }} />

          {/* Semi-transparent overlay */}
          <div className="absolute inset-0 bg-black/25 rounded-md flex flex-col items-center justify-center gap-0.5">
            <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
            <span className="text-[8px] text-white/90 font-medium text-center px-1 leading-tight max-w-full truncate">
              {generatingProgress}
            </span>
          </div>

          {/* Bottom progress bar */}
          {progressPct != null && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30 rounded-b-md overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Queued: pulsing border + label */}
      {isQueued && (
        <div className="absolute inset-0 pointer-events-none rounded-md" data-testid="clip-queued-overlay">
          <div className="absolute inset-0 rounded-md animate-pulse" style={{
            boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.4)',
          }} />
          <div className="absolute inset-0 bg-black/20 rounded-md flex items-center justify-center">
            <span className="text-[9px] text-amber-300/90 font-medium tracking-wide">
              Queued
            </span>
          </div>
        </div>
      )}

      {/* Error: red border + message */}
      {clip.generationStatus === 'error' && !generationJob && (
        <div className="absolute inset-0 pointer-events-none rounded-md" data-testid="clip-error-overlay" style={{
          boxShadow: '0 0 0 1.5px rgba(239, 68, 68, 0.5)',
        }}>
          <div
            className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-red-300 truncate"
            title={clip.errorMessage}
          >
            {clip.errorMessage ?? 'Error'}
          </div>
        </div>
      )}

      {/* Ready: inferred metadata */}
      {clip.generationStatus === 'ready' && clip.inferredMetas && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-400 truncate pointer-events-none">
          {[
            clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
            clip.inferredMetas.keyScale || null,
          ].filter(Boolean).join(' | ')}
        </div>
      )}

      {/* MIDI clip hint */}
      {isMidiClip && !generationJob && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-300/80 truncate pointer-events-none">
          MIDI clip • double-click to edit
        </div>
      )}
    </>
  );
}

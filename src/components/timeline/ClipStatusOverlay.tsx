import type { Clip } from '../../types/project';
import { regenerateClip } from '../../services/generationPipeline';

interface ClipStatusOverlayProps {
  clip: Clip;
  generatingProgress: string | number | null;
  isMidiClip: boolean;
}

export function ClipStatusOverlay({ clip, generatingProgress, isMidiClip }: ClipStatusOverlayProps) {
  const isQueued = clip.generationStatus === 'queued' && !generatingProgress;
  const isGenerating = clip.generationStatus === 'generating' || clip.generationStatus === 'processing' || (generatingProgress != null);
  const isError = clip.generationStatus === 'error';

  return (
    <>
      {/* Queued state: pulsing overlay + label */}
      {isQueued && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-md bg-violet-500/10 animate-pulse">
          <span className="text-[9px] font-medium text-violet-300/90 bg-black/40 px-1.5 py-0.5 rounded">
            Queued
          </span>
        </div>
      )}

      {/* Generating state: animated border + spinner + progress */}
      {isGenerating && (
        <>
          <div
            className="absolute inset-0 rounded-md pointer-events-none animate-pulse"
            style={{
              boxShadow: 'inset 0 0 0 1.5px rgba(139, 92, 246, 0.6)',
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/30 rounded-md">
            <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mb-0.5" />
            <span className="text-[8px] text-white/90 font-medium text-center px-1 leading-tight max-w-full truncate">
              {generatingProgress}
            </span>
          </div>
        </>
      )}

      {/* Error state: red border + error message + retry button */}
      {isError && (
        <>
          <div
            className="absolute inset-0 rounded-md pointer-events-none"
            style={{
              boxShadow: 'inset 0 0 0 1.5px rgba(239, 68, 68, 0.6)',
            }}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-0.5">
            <span
              className="text-[8px] text-red-300 truncate flex-1 pointer-events-none"
              title={clip.errorMessage}
            >
              {clip.errorMessage || 'Generation failed'}
            </span>
            <button
              className="text-[8px] text-red-300 hover:text-red-200 bg-red-500/20 hover:bg-red-500/30 px-1 py-px rounded transition-colors shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                void regenerateClip(clip.id);
              }}
              title="Retry generation"
            >
              Retry
            </button>
          </div>
        </>
      )}

      {/* Ready state with inferred metadata */}
      {clip.generationStatus === 'ready' && clip.inferredMetas && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-400 truncate pointer-events-none">
          {[
            clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
            clip.inferredMetas.keyScale || null,
          ].filter(Boolean).join(' | ')}
        </div>
      )}

      {/* MIDI clip indicator */}
      {isMidiClip && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-300/80 truncate pointer-events-none">
          MIDI clip • double-click to edit
        </div>
      )}
    </>
  );
}

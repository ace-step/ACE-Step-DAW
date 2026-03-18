import type { Clip } from '../../types/project';

interface ClipStatusOverlayProps {
  clip: Clip;
  generatingProgress: string | number | null;
  isMidiClip: boolean;
}

export function ClipStatusOverlay({ clip, generatingProgress, isMidiClip }: ClipStatusOverlayProps) {
  return (
    <>
      {generatingProgress && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/30 rounded-md">
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mb-0.5" />
          <span className="text-[8px] text-white/90 font-medium text-center px-1 leading-tight max-w-full truncate">
            {generatingProgress}
          </span>
        </div>
      )}
      {clip.generationStatus === 'error' && (
        <div className="absolute bottom-0 left-1.5 text-[8px] text-red-300 truncate pointer-events-none">
          Error
        </div>
      )}
      {clip.generationStatus === 'ready' && clip.inferredMetas && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-400 truncate pointer-events-none">
          {[
            clip.inferredMetas.bpm != null ? `${clip.inferredMetas.bpm}bpm` : null,
            clip.inferredMetas.keyScale || null,
          ].filter(Boolean).join(' | ')}
        </div>
      )}
      {isMidiClip && (
        <div className="absolute bottom-0 left-1.5 right-1.5 text-[8px] text-zinc-300/80 truncate pointer-events-none">
          MIDI clip • double-click to edit
        </div>
      )}
    </>
  );
}

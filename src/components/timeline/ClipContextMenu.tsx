interface ClipContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenMidi: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLayer: () => void;
  onCreateCover: () => void;
  onRepaint: () => void;
  onVocal2BGM: () => void;
  onAnalyze: () => void;
  onClose: () => void;
  hasPrompt: boolean;
  isReady: boolean;
  isMidiClip: boolean;
  isVocalTrack: boolean;
}

export function ClipContextMenu({
  x,
  y,
  onEdit,
  onGenerate,
  onRegenerate,
  onOpenMidi,
  onDuplicate,
  onDelete,
  onAddLayer,
  onCreateCover,
  onRepaint,
  onVocal2BGM,
  onAnalyze,
  onClose,
  hasPrompt,
  isReady,
  isMidiClip,
  isVocalTrack,
}: ClipContextMenuProps) {
  const clampedX = Math.min(x, window.innerWidth - 210);
  const clampedY = Math.min(y, window.innerHeight - 300);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[190px] backdrop-blur-sm"
        style={{ left: clampedX, top: clampedY }}
      >
        <button onClick={onEdit} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
          Edit Clip
        </button>
        {isMidiClip ? (
          <button onClick={onOpenMidi} className="w-full text-left px-3 py-1.5 text-[11px] text-violet-200 hover:bg-daw-accent hover:text-white transition-colors">
            Open Piano Roll
          </button>
        ) : isReady ? (
          <button onClick={onRegenerate} disabled={!hasPrompt} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed">
            Regenerate
          </button>
        ) : (
          <button onClick={onGenerate} disabled={!hasPrompt} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed">
            Generate
          </button>
        )}

        {!isMidiClip && isReady && (
          <>
            <button onClick={onCreateCover} className="w-full text-left px-3 py-1.5 text-[11px] text-amber-300 hover:bg-daw-accent hover:text-white transition-colors">
              Create Cover…
            </button>
            <button onClick={onRepaint} className="w-full text-left px-3 py-1.5 text-[11px] text-rose-300 hover:bg-daw-accent hover:text-white transition-colors">
              Repaint Selection…
            </button>
            {isVocalTrack && (
              <button onClick={onVocal2BGM} className="w-full text-left px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-daw-accent hover:text-white transition-colors">
                Generate Accompaniment…
              </button>
            )}
            <button onClick={onAnalyze} className="w-full text-left px-3 py-1.5 text-[11px] text-cyan-300 hover:bg-daw-accent hover:text-white transition-colors">
              Analyze Audio…
            </button>
          </>
        )}

        <div className="my-1 border-t border-[#555]" />
        <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
          Duplicate
        </button>
        {!isMidiClip && (
          <button onClick={onAddLayer} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors">
            Add Layer here…
          </button>
        )}
        <div className="my-1 border-t border-[#555]" />
        <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-600 hover:text-white transition-colors">
          Delete
        </button>
      </div>
    </>
  );
}

interface RegionContextMenuProps {
  x: number;
  y: number;
  onRegenerateRegion: () => void;
  onClose: () => void;
  hasReadyClips: boolean;
}

export function RegionContextMenu({
  x,
  y,
  onRegenerateRegion,
  onClose,
  hasReadyClips,
}: RegionContextMenuProps) {
  const clampedX = Math.min(x, window.innerWidth - 210);
  const clampedY = Math.min(y, window.innerHeight - 100);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 bg-[#383838] border border-[#555] rounded-lg shadow-2xl py-1 min-w-[200px] backdrop-blur-sm"
        style={{ left: clampedX, top: clampedY }}
        data-testid="region-context-menu"
      >
        <button
          onClick={onRegenerateRegion}
          disabled={!hasReadyClips}
          className="w-full text-left px-3 py-1.5 text-[11px] text-violet-200 hover:bg-daw-accent hover:text-white transition-colors disabled:text-zinc-600 disabled:cursor-not-allowed"
        >
          Regenerate Selected Region…
        </button>
      </div>
    </>
  );
}

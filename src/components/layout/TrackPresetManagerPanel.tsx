import { useUIStore } from '../../store/uiStore';
import { TrackPresetManager } from '../tracks/TrackPresetManager';
import { Z } from '../../utils/zIndex';

export function TrackPresetManagerPanel() {
  const show = useUIStore((s) => s.showTrackPresetManager);
  const setShow = useUIStore((s) => s.setShowTrackPresetManager);

  if (!show) return null;

  return (
    <div
      className="fixed right-4 top-14 w-[280px] max-w-[calc(100vw-2rem)] max-h-[400px] overflow-hidden rounded-xl border border-white/10 bg-[#141426]/95 shadow-2xl backdrop-blur flex flex-col"
      style={{ zIndex: Z.panel }}
      data-testid="track-preset-manager-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">
          Track Presets
        </div>
        <button
          aria-label="Close track preset manager"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          onClick={() => setShow(false)}
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TrackPresetManager />
      </div>
    </div>
  );
}

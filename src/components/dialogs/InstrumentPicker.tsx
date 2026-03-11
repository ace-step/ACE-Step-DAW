import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { TRACK_NAMES, TRACK_CATALOG } from '../../constants/tracks';
import type { TrackName } from '../../types/project';

export function InstrumentPicker() {
  const show = useUIStore((s) => s.showInstrumentPicker);
  const setShow = useUIStore((s) => s.setShowInstrumentPicker);
  const addTrack = useProjectStore((s) => s.addTrack);
  const project = useProjectStore((s) => s.project);

  if (!show || !project) return null;

  // Count existing tracks per name so we can show a badge
  const trackCountByName: Partial<Record<TrackName, number>> = {};
  for (const t of project.tracks) {
    trackCountByName[t.trackName] = (trackCountByName[t.trackName] ?? 0) + 1;
  }

  const handleSelect = (name: TrackName) => {
    addTrack(name);
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[440px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Add Track</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 grid grid-cols-3 gap-2">
          {TRACK_NAMES.map((name) => {
            const info = TRACK_CATALOG[name];
            const count = trackCountByName[name] ?? 0;
            return (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                className="flex items-center gap-2 px-3 py-2.5 rounded text-left bg-daw-surface-2 hover:bg-zinc-600 cursor-pointer transition-colors relative"
                style={{ borderLeft: `3px solid ${info.color}` }}
              >
                <span className="text-lg">{info.emoji}</span>
                <span className="text-xs font-medium">{info.displayName}</span>
                {count > 0 && (
                  <span className="absolute top-1 right-1.5 text-[9px] font-bold text-zinc-400">
                    ×{count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

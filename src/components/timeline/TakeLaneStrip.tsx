import type { Clip, Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';

interface TakeLaneStripProps {
  clip: Clip;
  track: Track;
}

export function TakeLaneStrip({ clip, track }: TakeLaneStripProps) {
  const selectTake = useProjectStore((s) => s.selectTake);
  const takes = clip.takes ?? [];

  if (takes.length === 0) return null;

  return (
    <div className="bg-[#171717] px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Take Lanes
        </span>
        <span className="text-[10px] text-zinc-600">
          {track.displayName}
        </span>
      </div>

      <div className="space-y-1">
        {takes.map((take, index) => (
          <button
            key={take.id}
            type="button"
            onClick={() => selectTake(clip.id, take.id)}
            className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors ${
              take.selected
                ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-100'
                : 'border-[#303030] bg-[#202020] text-zinc-300 hover:border-[#5a5a5a]'
            }`}
            aria-label={`Select take ${index + 1} for ${track.displayName}${take.selected ? ', selected' : ''}`}
          >
            <span>{`Take ${index + 1}`}</span>
            <span className="truncate pl-3 text-[10px] text-zinc-500">
              {take.audioKey}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

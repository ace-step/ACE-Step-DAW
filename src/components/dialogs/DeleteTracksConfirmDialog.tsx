import { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

export function DeleteTracksConfirmDialog() {
  const pendingIds = useUIStore((s) => s.pendingDeleteTrackIds);
  const confirm = useUIStore((s) => s.confirmDeleteTracks);
  const cancel = useUIStore((s) => s.cancelDeleteTracks);
  const allTracks = useProjectStore((s) => s.project?.tracks);

  const tracks = useMemo(
    () => (pendingIds && allTracks ? allTracks.filter((t) => pendingIds.includes(t.id)) : []),
    [pendingIds, allTracks],
  );

  if (!pendingIds || pendingIds.length === 0) return null;

  const totalClips = tracks.reduce((sum, t) => sum + t.clips.length, 0);
  const trackLabel = pendingIds.length === 1 ? 'track' : 'tracks';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <div
        className="w-[400px] rounded-lg border border-daw-border bg-daw-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            Delete {pendingIds.length} {trackLabel}?
          </h2>
          <button
            type="button"
            onClick={cancel}
            className="text-lg leading-none text-zinc-400 transition-colors hover:text-zinc-200"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="space-y-2 px-4 py-4">
          <p className="text-xs text-zinc-300">
            {pendingIds.length === 1
              ? `This track contains ${totalClips} clips. Deleting the track will remove all of them.`
              : `These ${pendingIds.length} tracks contain a total of ${totalClips} clips. Deleting them will remove all clips.`}
          </p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-400">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="truncate">{t.displayName}</span>
                <span className="ml-auto text-zinc-500">{t.clips.length} clips</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zinc-500">
            This action can be undone with Cmd+Z.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-daw-border px-4 py-3">
          <button
            type="button"
            onClick={cancel}
            className="rounded px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
            autoFocus
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

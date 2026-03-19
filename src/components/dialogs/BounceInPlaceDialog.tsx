import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { projectActionApi } from '../../services/actionApi';
import { DEFAULT_BOUNCE_IN_PLACE_OPTIONS } from '../../services/bounceInPlace';
import type { BounceInPlaceOptions } from '../../types/project';
import { toastError } from '../../hooks/useToast';

const checkboxClass = 'h-4 w-4 rounded border border-daw-border bg-daw-surface-2 text-daw-accent focus:ring-1 focus:ring-daw-accent';

export function BounceInPlaceDialog() {
  const trackId = useUIStore((state) => state.bounceInPlaceTrackId);
  const close = useUIStore((state) => state.closeBounceInPlaceDialog);
  const track = useProjectStore((state) =>
    trackId ? state.project?.tracks.find((candidate) => candidate.id === trackId) ?? null : null,
  );
  const [options, setOptions] = useState<BounceInPlaceOptions>(DEFAULT_BOUNCE_IN_PLACE_OPTIONS);
  const [isBouncing, setIsBouncing] = useState(false);

  useEffect(() => {
    if (trackId) {
      setOptions(DEFAULT_BOUNCE_IN_PLACE_OPTIONS);
    }
  }, [trackId]);

  if (!trackId || !track) return null;

  const handleBounce = async () => {
    setIsBouncing(true);
    try {
      const result = await projectActionApi.bounceInPlace({ trackId, options });
      if (result.ok) {
        close();
      } else {
        console.error('Bounce in place failed', result.error);
        toastError(result.error.message);
      }
    } finally {
      setIsBouncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && !isBouncing && close()}
    >
      <div
        className="w-[420px] rounded-lg border border-daw-border bg-daw-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Bounce In Place</h2>
            <p className="mt-1 text-xs text-zinc-400">{track.displayName}</p>
          </div>
          <button
            type="button"
            onClick={() => !isBouncing && close()}
            className="text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-200"
            aria-label="Close bounce dialog"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-daw-border bg-daw-surface-2/60 px-3 py-2">
            <input
              aria-label="Include effects"
              type="checkbox"
              className={checkboxClass}
              checked={options.includeEffects}
              onChange={(event) => setOptions((current) => ({ ...current, includeEffects: event.target.checked }))}
            />
            <span>
              <span className="block text-sm text-zinc-100">Include effects</span>
              <span className="block text-xs text-zinc-400">Bake the track effect chain into the rendered audio.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-daw-border bg-daw-surface-2/60 px-3 py-2">
            <input
              aria-label="Include automation"
              type="checkbox"
              className={checkboxClass}
              checked={options.includeAutomation}
              onChange={(event) => setOptions((current) => ({ ...current, includeAutomation: event.target.checked }))}
            />
            <span>
              <span className="block text-sm text-zinc-100">Include automation</span>
              <span className="block text-xs text-zinc-400">Bake track volume and pan automation into the bounced audio.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-daw-border bg-daw-surface-2/60 px-3 py-2">
            <input
              aria-label="Normalize"
              type="checkbox"
              className={checkboxClass}
              checked={options.normalize}
              onChange={(event) => setOptions((current) => ({ ...current, normalize: event.target.checked }))}
            />
            <span>
              <span className="block text-sm text-zinc-100">Normalize render</span>
              <span className="block text-xs text-zinc-400">Raise the bounced audio to a safe near-full-scale peak.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-daw-border bg-daw-surface-2/60 px-3 py-2">
            <input
              aria-label="Replace original"
              type="checkbox"
              className={checkboxClass}
              checked={options.replaceOriginal}
              onChange={(event) => setOptions((current) => ({ ...current, replaceOriginal: event.target.checked }))}
            />
            <span>
              <span className="block text-sm text-zinc-100">Replace original track</span>
              <span className="block text-xs text-zinc-400">Turn this track into bounced audio instead of creating a sibling sample track.</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-daw-border px-4 py-3">
          <p className="text-[11px] text-zinc-500">Shortcut: {navigator.platform.includes('Mac') ? '⌘B' : 'Ctrl+B'}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => close()}
              disabled={isBouncing}
              className="rounded-md border border-daw-border px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleBounce()}
              disabled={isBouncing}
              className="rounded-md bg-daw-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBouncing ? 'Bouncing...' : 'Bounce Track'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

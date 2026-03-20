import { useProjectStore } from '../../store/projectStore';

const EMPTY_STATE_THRESHOLD = 3;

export function TimelineEmptyState() {
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const addTrack = useProjectStore((s) => s.addTrack);

  if (tracks.length >= EMPTY_STATE_THRESHOLD) {
    return null;
  }

  return (
    <div
      data-testid="timeline-empty-state"
      className="flex flex-col items-center justify-center gap-4 py-16 mx-6 my-4 border-2 border-dashed border-zinc-700/40 rounded-xl"
    >
      {/* Music note icon */}
      <svg
        className="w-10 h-10 text-zinc-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>

      <p className="text-zinc-500 text-sm">
        Drop audio files here or add a track to get started
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          className="bg-daw-surface-2 hover:bg-daw-surface-3 rounded-lg px-4 py-2 text-zinc-300 text-xs transition-colors"
          onClick={() => addTrack('custom', 'stems')}
        >
          Add Stems Track
        </button>
        <button
          type="button"
          className="bg-daw-surface-2 hover:bg-daw-surface-3 rounded-lg px-4 py-2 text-zinc-300 text-xs transition-colors"
          onClick={() => addTrack('custom', 'sample')}
        >
          Add Sample Track
        </button>
        <button
          type="button"
          className="bg-daw-surface-2 hover:bg-daw-surface-3 rounded-lg px-4 py-2 text-zinc-300 text-xs transition-colors"
          onClick={() => addTrack('custom', 'sequencer')}
        >
          Add Sequencer
        </button>
      </div>
    </div>
  );
}

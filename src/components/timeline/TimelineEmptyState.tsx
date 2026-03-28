import { useProjectStore } from '../../store/projectStore';
import type { Track } from '../../types/project';

const EMPTY_TRACKS: Track[] = [];
const EMPTY_STATE_THRESHOLD = 1;

export function TimelineEmptyState() {
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);

  if (tracks.length >= EMPTY_STATE_THRESHOLD) {
    return null;
  }

  return (
    <div
      data-testid="timeline-empty-state"
      className="flex flex-col items-center justify-center gap-2 py-20"
    >
      {/* Music note icon */}
      <svg
        className="w-8 h-8 text-zinc-700"
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

      <p className="text-zinc-600 text-sm">
        Drop audio files here or click + Track to get started
      </p>
    </div>
  );
}

import { useProjectStore } from '../../store/projectStore';
import { EmptyState } from '../ui/EmptyState';
import type { Track } from '../../types/project';

const EMPTY_TRACKS: Track[] = [];
const EMPTY_STATE_THRESHOLD = 1;

export function TimelineEmptyState() {
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const addTrack = useProjectStore((s) => s.addTrack);

  if (tracks.length >= EMPTY_STATE_THRESHOLD) {
    return null;
  }

  return (
    <div data-testid="timeline-empty-state">
      <EmptyState
        icon={
          <svg
            className="w-8 h-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        }
        title="Drop audio files here or click + Track to get started"
        description="Create tracks, generate AI music, or drag loops from the library"
        action={{
          label: '+ New Track',
          onClick: () => addTrack('custom', 'stems'),
        }}
      />
    </div>
  );
}

import { EmptyState } from '../ui/EmptyState';

export function PianoRollEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <EmptyState
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        }
        title="No MIDI clip on this track"
        description="Select a MIDI track with clips to edit notes"
        compact
      />
    </div>
  );
}

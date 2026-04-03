import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { Track } from '../../types/project';

const EMPTY_TRACKS: Track[] = [];
const EMPTY_STATE_THRESHOLD = 1;

function ActionCard({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-lg
        bg-white/[0.03] border border-transparent
        hover:bg-white/[0.06] hover:border-daw-border
        transition-colors cursor-pointer text-center group"
    >
      <span className="text-zinc-500 group-hover:text-daw-accent transition-colors">
        {icon}
      </span>
      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
      <span className="text-[10px] text-zinc-600">{hint}</span>
    </button>
  );
}

export function TimelineEmptyState() {
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const addTrack = useProjectStore((s) => s.addTrack);

  if (tracks.length >= EMPTY_STATE_THRESHOLD) {
    return null;
  }

  return (
    <div
      data-testid="timeline-empty-state"
      className="flex flex-col items-center justify-center gap-4 py-16"
    >
      {/* Music note icon */}
      <svg
        className="w-10 h-10 text-zinc-700"
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

      <div className="text-center">
        <p className="text-zinc-500 text-xs font-medium">Start creating</p>
        <p className="text-zinc-600 text-[10px] mt-1">
          Add a track, import audio, or drag files here
        </p>
      </div>

      {/* Action cards */}
      <div className="flex gap-3 mt-1">
        <ActionCard
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          }
          label="Add Track"
          hint="Instrument or audio"
          onClick={() => setShowInstrumentPicker(true)}
        />
        <ActionCard
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          }
          label="Import Audio"
          hint="WAV, MP3, FLAC"
          onClick={() => {
            const newTrack = addTrack('custom', 'sample');
            // Open file picker for the new track
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.aac,.m4a,.webm';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              // Re-use the import hook would be ideal, but for simplicity
              // we dispatch a custom event that the timeline can pick up
              useProjectStore.getState().updateTrack(newTrack.id, {
                displayName: file.name.replace(/\.[^.]+$/, ''),
              });
            };
            input.click();
          }}
        />
        <ActionCard
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          }
          label="AI Generate"
          hint="Text to music"
          onClick={() => {
            addTrack('custom', 'sample');
            useUIStore.getState().setShowGenerationPanel(true);
          }}
        />
      </div>
    </div>
  );
}

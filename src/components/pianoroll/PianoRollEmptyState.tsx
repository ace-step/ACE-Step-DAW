export function PianoRollEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-white/15 text-sm flex flex-col items-center gap-3">
        {/* Ghost grid hint */}
        <div className="grid grid-cols-8 gap-px w-48 opacity-30" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="h-3 rounded-sm"
              style={{ backgroundColor: 'var(--color-daw-surface-2, rgba(255,255,255,0.03))' }}
            />
          ))}
        </div>

        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
        <span className="text-[11px]">Click a MIDI clip to edit, or draw notes with the pencil tool</span>
      </div>
    </div>
  );
}

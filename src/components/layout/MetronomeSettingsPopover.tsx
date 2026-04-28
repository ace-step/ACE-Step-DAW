import { useTransportStore } from '../../store/transportStore';

interface MetronomeSettingsPopoverProps {
  open: boolean;
  onClose: () => void;
}

const SOUND_OPTIONS = [
  { id: 'click', label: 'Click' },
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'beep', label: 'Beep' },
] as const;

const COUNTIN_OPTIONS = [
  { bars: 0, label: 'Off' },
  { bars: 1, label: '1 Bar' },
  { bars: 2, label: '2 Bars' },
] as const;

export function MetronomeSettingsPopover({ open, onClose }: MetronomeSettingsPopoverProps) {
  const metronomeSound = useTransportStore((s) => s.metronomeSound);
  const metronomeVolume = useTransportStore((s) => s.metronomeVolume);
  const countInBars = useTransportStore((s) => s.countInBars);
  const setMetronomeSound = useTransportStore((s) => s.setMetronomeSound);
  const setMetronomeVolume = useTransportStore((s) => s.setMetronomeVolume);
  const setCountInBars = useTransportStore((s) => s.setCountInBars);

  if (!open) return null;

  return (
    <>
      <div
        data-testid="metronome-settings-backdrop"
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
      />
      <div
        data-testid="metronome-settings-popover"
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg border border-daw-border bg-daw-surface shadow-xl z-50 p-3 space-y-3"
      >
        {/* Sound */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
            Sound
          </label>
          <div className="flex gap-1">
            {SOUND_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                data-testid={`sound-${id}`}
                aria-pressed={metronomeSound === id}
                onClick={() => setMetronomeSound(id)}
                className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  metronomeSound === id
                    ? 'bg-daw-accent text-white'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
            Volume
          </label>
          <input
            type="range"
            data-testid="metronome-volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={metronomeVolume}
            onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-daw-accent"
          />
        </div>

        {/* Count-In */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
            Count-In
          </label>
          <div className="flex gap-1">
            {COUNTIN_OPTIONS.map(({ bars, label }) => (
              <button
                key={bars}
                type="button"
                data-testid={`countin-${bars}`}
                aria-pressed={countInBars === bars}
                onClick={() => setCountInBars(bars)}
                className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  countInBars === bars
                    ? 'bg-daw-accent text-white'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

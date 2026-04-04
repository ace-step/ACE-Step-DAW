type OscillatorWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface OscillatorSelectorProps {
  waveform: OscillatorWaveform;
  onChange: (waveform: OscillatorWaveform) => void;
}

const WAVEFORMS: { type: OscillatorWaveform; label: string }[] = [
  { type: 'sine', label: 'Sine' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'sawtooth', label: 'Sawtooth' },
  { type: 'square', label: 'Square' },
];

function WaveformIcon({ type }: { type: OscillatorWaveform }) {
  const w = 20;
  const h = 14;
  const mid = h / 2;

  let d: string;
  switch (type) {
    case 'sine':
      d = `M 0 ${mid} C ${w * 0.25} ${0} ${w * 0.25} ${0} ${w * 0.5} ${mid} C ${w * 0.75} ${h} ${w * 0.75} ${h} ${w} ${mid}`;
      break;
    case 'triangle':
      d = `M 0 ${mid} L ${w * 0.25} ${1} L ${w * 0.75} ${h - 1} L ${w} ${mid}`;
      break;
    case 'sawtooth':
      d = `M 0 ${mid} L ${w * 0.5} ${1} L ${w * 0.5} ${h - 1} L ${w} ${mid}`;
      break;
    case 'square':
      d = `M 0 ${mid} L 0 ${1} L ${w * 0.5} ${1} L ${w * 0.5} ${h - 1} L ${w} ${h - 1} L ${w} ${mid}`;
      break;
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0">
      <path d={d} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OscillatorSelector({ waveform, onChange }: OscillatorSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Oscillator</div>
      <div className="flex gap-1">
        {WAVEFORMS.map(({ type, label }) => {
          const active = waveform === type;
          return (
            <button
              key={type}
              type="button"
              aria-label={label}
              aria-pressed={active ? 'true' : 'false'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                active
                  ? 'bg-violet-600/50 text-violet-200'
                  : 'bg-[#2a2a2a] text-zinc-400 hover:bg-[#3a3a3a]'
              }`}
              onClick={() => {
                if (!active) onChange(type);
              }}
            >
              <WaveformIcon type={type} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

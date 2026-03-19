import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { SCALES, type TransformOptions } from '../../utils/midiTransforms';

interface TransformMenuProps {
  clipId: string;
  selectedNoteIds: Set<string>;
}

type TransformType = TransformOptions['type'];

const TRANSFORM_LABELS: Record<TransformType, string> = {
  humanize: 'Humanize',
  transpose: 'Transpose',
  invert: 'Invert',
  retrograde: 'Retrograde',
  legato: 'Legato',
  scaleCorrect: 'Scale Correct',
  velocityScale: 'Velocity Scale',
};

export function TransformMenu({ clipId, selectedNoteIds }: TransformMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeTransform, setActiveTransform] = useState<TransformType | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const transformMidiNotes = useProjectStore((s) => s.transformMidiNotes);

  // Parameter states
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const [humanizeTiming, setHumanizeTiming] = useState(0.05);
  const [humanizeVelocity, setHumanizeVelocity] = useState(10);
  const [invertAxis, setInvertAxis] = useState<string>('');
  const [legatoOverlap, setLegatoOverlap] = useState(0);
  const [scaleRoot, setScaleRoot] = useState(0);
  const [scaleName, setScaleName] = useState('major');
  const [velMin, setVelMin] = useState(20);
  const [velMax, setVelMax] = useState(120);

  const noteIdArray = useCallback(() => Array.from(selectedNoteIds), [selectedNoteIds]);

  const apply = useCallback(
    (opts: TransformOptions) => {
      transformMidiNotes(clipId, noteIdArray(), opts);
      setActiveTransform(null);
      setOpen(false);
    },
    [clipId, noteIdArray, transformMidiNotes],
  );

  const disabled = selectedNoteIds.size === 0;

  const handleSelect = (type: TransformType) => {
    // Immediate-apply transforms (no params needed)
    if (type === 'retrograde') {
      apply({ type: 'retrograde' });
      return;
    }
    setActiveTransform(type);
  };

  const renderParams = () => {
    switch (activeTransform) {
      case 'transpose':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Semitones</label>
            <input
              type="number"
              value={transposeSemitones}
              onChange={(e) => setTransposeSemitones(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={-48}
              max={48}
            />
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() => apply({ type: 'transpose', semitones: transposeSemitones })}
            >
              Apply
            </button>
          </div>
        );

      case 'humanize':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Timing (beats)</label>
            <input
              type="number"
              value={humanizeTiming}
              onChange={(e) => setHumanizeTiming(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={0}
              max={1}
              step={0.01}
            />
            <label className="text-[10px] text-zinc-400">Velocity</label>
            <input
              type="number"
              value={humanizeVelocity}
              onChange={(e) => setHumanizeVelocity(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={0}
              max={64}
            />
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() =>
                apply({ type: 'humanize', timingAmount: humanizeTiming, velocityAmount: humanizeVelocity })
              }
            >
              Apply
            </button>
          </div>
        );

      case 'invert':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Axis (pitch, blank=auto)</label>
            <input
              type="number"
              value={invertAxis}
              onChange={(e) => setInvertAxis(e.target.value)}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={0}
              max={127}
              placeholder="auto"
            />
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() =>
                apply({ type: 'invert', axis: invertAxis !== '' ? Number(invertAxis) : undefined })
              }
            >
              Apply
            </button>
          </div>
        );

      case 'legato':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Overlap (beats)</label>
            <input
              type="number"
              value={legatoOverlap}
              onChange={(e) => setLegatoOverlap(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={-1}
              max={1}
              step={0.05}
            />
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() => apply({ type: 'legato', overlapBeats: legatoOverlap })}
            >
              Apply
            </button>
          </div>
        );

      case 'scaleCorrect':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Root</label>
            <select
              value={scaleRoot}
              onChange={(e) => setScaleRoot(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200"
            >
              {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
            <label className="text-[10px] text-zinc-400">Scale</label>
            <select
              value={scaleName}
              onChange={(e) => setScaleName(e.target.value)}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200"
            >
              {Object.keys(SCALES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() => apply({ type: 'scaleCorrect', root: scaleRoot, scale: scaleName })}
            >
              Apply
            </button>
          </div>
        );

      case 'velocityScale':
        return (
          <div className="flex flex-col gap-1.5 p-2">
            <label className="text-[10px] text-zinc-400">Min velocity</label>
            <input
              type="number"
              value={velMin}
              onChange={(e) => setVelMin(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={1}
              max={127}
            />
            <label className="text-[10px] text-zinc-400">Max velocity</label>
            <input
              type="number"
              value={velMax}
              onChange={(e) => setVelMax(Number(e.target.value))}
              className="bg-[#111] border border-[#444] rounded px-2 py-0.5 text-[11px] text-zinc-200 w-20"
              min={1}
              max={127}
            />
            <button
              className="mt-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[10px] text-white"
              onClick={() => apply({ type: 'velocityScale', min: velMin, max: velMax })}
            >
              Apply
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label="MIDI transform tools"
        className={`px-2 py-1 rounded text-[10px] transition-colors ${
          disabled
            ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
            : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
        }`}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setActiveTransform(null);
        }}
        title="Transform selected notes"
      >
        Transform
      </button>

      {open && !disabled && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#1a1a2e] border border-[#333] rounded shadow-lg min-w-[140px]">
          {activeTransform ? (
            <div>
              <button
                className="w-full text-left px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 border-b border-[#333]"
                onClick={() => setActiveTransform(null)}
              >
                ← Back
              </button>
              <div className="text-[11px] text-zinc-200 px-2 pt-1 font-medium">
                {TRANSFORM_LABELS[activeTransform]}
              </div>
              {renderParams()}
            </div>
          ) : (
            <div className="py-1">
              {(Object.keys(TRANSFORM_LABELS) as TransformType[]).map((type) => (
                <button
                  key={type}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-violet-600/30 hover:text-white transition-colors"
                  onClick={() => handleSelect(type)}
                >
                  {TRANSFORM_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

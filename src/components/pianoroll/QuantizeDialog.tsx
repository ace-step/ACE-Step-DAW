import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { PianoRollGrid } from '../../types/project';
import type { QuantizeOptions } from '../../utils/midiQuantize';
import { gridSizeToBeats } from './PianoRollConstants';

const GRID_OPTIONS: { label: string; value: PianoRollGrid }[] = [
  { label: '1/4', value: '1/4' },
  { label: '1/8', value: '1/8' },
  { label: '1/16', value: '1/16' },
  { label: '1/32', value: '1/32' },
];

const SCOPE_OPTIONS: { label: string; value: QuantizeOptions['scope'] }[] = [
  { label: 'Start only', value: 'start' },
  { label: 'Start + End', value: 'startEnd' },
  { label: 'Preserve duration', value: 'preserveDuration' },
];

export function QuantizeDialog() {
  const show = useUIStore((s) => s.showQuantizeDialog);
  const target = useUIStore((s) => s.quantizeTarget);
  const setShow = useUIStore((s) => s.setShowQuantizeDialog);
  const quantizeMidiNotes = useProjectStore((s) => s.quantizeMidiNotes);

  const [gridSize, setGridSize] = useState<PianoRollGrid>('1/8');
  const [strength, setStrength] = useState(100);
  const [swing, setSwing] = useState(0);
  const [scope, setScope] = useState<QuantizeOptions['scope']>('start');

  const handleApply = useCallback(() => {
    if (!target) return;
    const options: QuantizeOptions = {
      gridBeats: gridSizeToBeats(gridSize),
      strength,
      swing,
      scope,
    };
    quantizeMidiNotes(target.clipId, target.noteIds, options);
    setShow(false);
  }, [target, gridSize, strength, swing, scope, quantizeMidiNotes, setShow]);

  const handleCancel = useCallback(() => {
    setShow(false);
  }, [setShow]);

  if (!show || !target) return null;

  const noteCount = target.noteIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        className="w-[360px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
          if (e.key === 'Escape') handleCancel();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-semibold text-zinc-100">
            Quantize {noteCount} note{noteCount !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={handleCancel}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Grid size */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Grid size</label>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(e.target.value as PianoRollGrid)}
              className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 w-24"
            >
              {GRID_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Strength */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">Strength</label>
              <span className="text-[11px] text-zinc-300 tabular-nums w-10 text-right">{strength}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-violet-500"
            />
          </div>

          {/* Swing */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">Swing</label>
              <span className="text-[11px] text-zinc-300 tabular-nums w-10 text-right">{swing}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={swing}
              onChange={(e) => setSwing(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-violet-500"
            />
          </div>

          {/* Scope */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as QuantizeOptions['scope'])}
              className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 w-40"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-daw-border">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1.5 text-xs text-white bg-violet-600 hover:bg-violet-500 rounded transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

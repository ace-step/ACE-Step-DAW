import { WaveformRangeSelector } from './WaveformRangeSelector';
import type { RepaintMode } from '../../types/api';

function fmt(s: number) {
  const val = Number.isFinite(s) ? s : 0;
  return `${val.toFixed(2)}s`;
}

export interface EnhanceRepaintControlsProps {
  sourcePeaks: number[];
  clipDuration: number;
  clipStart: number;
  selStart: number;
  selEnd: number;
  onRangeChange: (start: number, end: number) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  globalCaption: string;
  onGlobalCaptionChange: (value: string) => void;
  repaintMode: RepaintMode;
  onRepaintModeChange: (value: RepaintMode) => void;
  repaintStrength: number;
  onRepaintStrengthChange: (value: number) => void;
  bpm?: number;
}

export function EnhanceRepaintControls({
  sourcePeaks,
  clipDuration,
  clipStart,
  selStart,
  selEnd,
  onRangeChange,
  prompt,
  onPromptChange,
  globalCaption,
  onGlobalCaptionChange,
  repaintMode,
  onRepaintModeChange,
  repaintStrength,
  onRepaintStrengthChange,
  bpm,
}: EnhanceRepaintControlsProps) {
  return (
    <>
      {/* Repaint range — waveform selector */}
      <div className="bg-[#222]/60 rounded px-3 pt-2 pb-2 border border-[#3a3a3a]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-zinc-300">Repaint range</span>
          <span className="text-[10px] font-mono text-rose-300">
            {fmt(selStart)} — {fmt(selEnd)}
          </span>
        </div>
        <WaveformRangeSelector
          peaks={sourcePeaks}
          duration={clipDuration || 0}
          rangeStart={clipDuration > 0 ? (selStart - clipStart) / clipDuration : 0}
          rangeEnd={clipDuration > 0 ? (selEnd - clipStart) / clipDuration : 1}
          onRangeChange={(s, e) => {
            onRangeChange(
              clipStart + s * clipDuration,
              clipStart + e * clipDuration,
            );
          }}
          bpm={bpm}
          snapToGrid={true}
        />
        <div className="flex gap-4 mt-1">
          <span className="flex items-center gap-1 text-[8px] text-zinc-400">
            <span className="inline-block w-3 h-2 rounded-sm bg-black/55 border border-zinc-600/50" />
            Keep
          </span>
          <span className="flex items-center gap-1 text-[8px] text-rose-400">
            <span className="inline-block w-3 h-2 rounded-sm bg-rose-600/20 border border-rose-500/60" />
            Regenerate
          </span>
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
          Prompt for this section
        </label>
        <textarea
          data-testid="enhance-repaint-prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe how this section should sound..."
          rows={3}
          className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60"
        />
      </div>

      {/* Global caption */}
      <div>
        <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
          Global song description
          <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
        </label>
        <textarea
          data-testid="enhance-global-caption"
          value={globalCaption}
          onChange={(e) => onGlobalCaptionChange(e.target.value)}
          placeholder="e.g. upbeat pop song..."
          rows={2}
          className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60"
        />
      </div>

      {/* Repaint mode & strength */}
      <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-2.5">
        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
            Repaint mode
          </label>
          <div className="flex gap-1" data-testid="enhance-repaint-mode-toggle">
            {(['conservative', 'balanced', 'aggressive'] as const).map((rm) => (
              <button
                key={rm}
                onClick={() => onRepaintModeChange(rm)}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  repaintMode === rm
                    ? 'bg-rose-600/80 text-white border border-rose-500'
                    : 'bg-[#333] text-zinc-400 border border-[#444] hover:bg-[#3a3a3a]'
                }`}
              >
                {rm.charAt(0).toUpperCase() + rm.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-[8px] text-zinc-600 mt-1">
            {repaintMode === 'conservative' && 'Maximum source preservation — subtle changes only.'}
            {repaintMode === 'balanced' && 'Tunable blend between source preservation and fresh generation.'}
            {repaintMode === 'aggressive' && 'Pure diffusion — fully regenerates the region.'}
          </p>
        </div>

        {repaintMode === 'balanced' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-zinc-400">
                Repaint strength
              </label>
              <span className="text-[10px] font-mono text-rose-300">{repaintStrength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={repaintStrength}
              onChange={(e) => onRepaintStrengthChange(Number(e.target.value))}
              className="w-full h-1.5 accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
              <span>Preserve source</span>
              <span>Fresh generation</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-zinc-600">
        Only the selected range will be regenerated. Audio outside the repaint region is preserved.
      </p>
    </>
  );
}

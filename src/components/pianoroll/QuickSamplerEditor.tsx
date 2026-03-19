import { useCallback } from 'react';
import { samplerEngine } from '../../engine/SamplerEngine';
import type { SamplerConfig, SamplerPlaybackMode, SamplerSettings, Track } from '../../types/project';
import { midiNoteToName } from './PianoRollConstants';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The 12 notes of one octave, centred on the root note. Used for the audition keyboard. */
const AUDITION_OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
const BLACK_OFFSETS = new Set([-4, -2, 1, 3, 6]);

interface QuickSamplerEditorProps {
  track: Track;
  onSamplerConfigChange: (updates: Partial<SamplerConfig>) => void;
  onSamplerSettingsChange: (updates: Partial<SamplerSettings>) => void;
  onClear: () => void;
  onLoadSample: () => void;
}

export function QuickSamplerEditor({
  track,
  onSamplerConfigChange,
  onSamplerSettingsChange,
  onClear,
  onLoadSample,
}: QuickSamplerEditorProps) {
  const samplerConfig = track.samplerConfig ?? null;
  const sampleDuration = Math.max(0.01, track.sampler?.sampleDuration ?? samplerConfig?.trimEnd ?? 1);
  const hasAudio = !!track.sampler?.audioKey;
  const rootNote = track.sampler?.rootNote ?? 60;

  const handleAdsrChange = useCallback(
    (param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => {
      onSamplerConfigChange({ [param]: value });
    },
    [onSamplerConfigChange],
  );

  const handleAuditionNote = useCallback(
    (pitch: number) => {
      void samplerEngine.previewTrackNote(track, pitch, 110, 0.5);
    },
    [track],
  );

  return (
    <div className="grid grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)] gap-3 px-3 py-3 border-b border-[#1f2536] bg-[#0b1220] shrink-0">
      {/* Left column: sample info + controls */}
      <div className={`rounded-xl border px-3 py-3 ${hasAudio ? 'border-amber-400/25 bg-amber-300/[0.08]' : 'border-cyan-400/25 bg-cyan-300/[0.06]'}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Quick Sampler</div>
            <div className="text-sm text-zinc-100">{track.sampler?.sampleName ?? 'Drop audio here to build an instrument'}</div>
          </div>
          <button
            aria-label={`Load sampler source for ${track.displayName}`}
            className="px-2 py-1 rounded text-[10px] bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors"
            onClick={onLoadSample}
          >
            {hasAudio ? 'Swap Sample' : 'Load Sample'}
          </button>
        </div>

        {!hasAudio && (
          <div className="mt-2 text-[11px] text-zinc-400">
            Drop an audio file or imported asset here to create a playable instrument in one step.
          </div>
        )}

        {hasAudio && samplerConfig && (
          <>
            <div className="mt-2 text-[11px] text-zinc-400">
              Drag an imported asset here to remap it instantly. Current range: {sampleDuration.toFixed(2)}s
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] text-zinc-400 flex items-center gap-1">
                Root
                <input
                  aria-label="Sampler root note"
                  type="number"
                  min="0"
                  max="127"
                  value={rootNote}
                  onChange={(e) => {
                    const rn = Number(e.target.value);
                    onSamplerSettingsChange({ rootNote: rn });
                    onSamplerConfigChange({ rootNote: rn });
                  }}
                  className="w-14 bg-[#111] border border-[#333] rounded px-1.5 py-1 text-[11px] text-zinc-200"
                />
                <span className="text-zinc-500">{midiNoteToName(rootNote)}</span>
              </label>
              <label className="text-[10px] text-zinc-400 flex items-center gap-1">
                Mode
                <select
                  aria-label="Quick Sampler playback mode"
                  value={samplerConfig.playbackMode}
                  onChange={(e) => onSamplerConfigChange({ playbackMode: e.target.value as SamplerPlaybackMode })}
                  className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="classic">Classic</option>
                  <option value="oneShot">One Shot</option>
                  <option value="loop">Loop</option>
                </select>
              </label>
              <button
                aria-label="Preview quick sampler root note"
                className="px-2 py-1 rounded text-[10px] bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 transition-colors"
                onClick={() => handleAuditionNote(rootNote)}
              >
                Preview
              </button>
              <button
                aria-label={`Clear sampler source for ${track.displayName}`}
                className="px-2 py-1 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10"
                onClick={onClear}
              >
                Clear
              </button>
            </div>

            {/* ADSR controls */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              <AdsrSlider
                label="Attack"
                value={samplerConfig.attack}
                min={0}
                max={2}
                step={0.005}
                onChange={(v) => handleAdsrChange('attack', v)}
              />
              <AdsrSlider
                label="Decay"
                value={samplerConfig.decay}
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => handleAdsrChange('decay', v)}
              />
              <AdsrSlider
                label="Sustain"
                value={samplerConfig.sustain}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleAdsrChange('sustain', v)}
              />
              <AdsrSlider
                label="Release"
                value={samplerConfig.release}
                min={0}
                max={5}
                step={0.01}
                onChange={(v) => handleAdsrChange('release', v)}
              />
            </div>

            {/* Audition keyboard */}
            <div data-testid="audition-keyboard" className="mt-3 flex gap-px h-7 select-none">
              {AUDITION_OFFSETS.map((offset) => {
                const pitch = clamp(rootNote + offset, 0, 127);
                const isBlack = BLACK_OFFSETS.has(offset);
                const isRoot = offset === 0;
                return (
                  <button
                    key={offset}
                    aria-label={`Audition ${midiNoteToName(pitch)}`}
                    className={`flex-1 rounded-b text-[8px] leading-none flex items-end justify-center pb-0.5 transition-colors
                      ${isBlack ? 'bg-zinc-800 text-zinc-500 hover:bg-zinc-600' : 'bg-zinc-200 text-zinc-700 hover:bg-white'}
                      ${isRoot ? 'ring-1 ring-amber-400' : ''}
                    `}
                    onMouseDown={() => handleAuditionNote(pitch)}
                  >
                    {isRoot ? midiNoteToName(pitch) : ''}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Right column: trim, loop, sample editor */}
      <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
        {samplerConfig ? (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Sample Editor</div>
            <label className="block text-[10px] text-zinc-400">
              Trim Start
              <input
                aria-label="Quick Sampler trim start"
                type="range"
                min="0"
                max={sampleDuration}
                step="0.01"
                value={samplerConfig.trimStart}
                onChange={(e) => onSamplerConfigChange({ trimStart: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-zinc-500">{samplerConfig.trimStart.toFixed(2)}s</span>
            </label>
            <label className="block text-[10px] text-zinc-400">
              Trim End
              <input
                aria-label="Quick Sampler trim end"
                type="range"
                min="0.01"
                max={sampleDuration}
                step="0.01"
                value={samplerConfig.trimEnd}
                onChange={(e) => onSamplerConfigChange({ trimEnd: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-zinc-500">{samplerConfig.trimEnd.toFixed(2)}s</span>
            </label>
            {samplerConfig.playbackMode === 'loop' && (
              <>
                <label className="block text-[10px] text-zinc-400">
                  Loop Start
                  <input
                    aria-label="Quick Sampler loop start"
                    type="range"
                    min={samplerConfig.trimStart}
                    max={samplerConfig.trimEnd - 0.01}
                    step="0.01"
                    value={samplerConfig.loopStart}
                    onChange={(e) => onSamplerConfigChange({ loopStart: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-zinc-500">{samplerConfig.loopStart.toFixed(2)}s</span>
                </label>
                <label className="block text-[10px] text-zinc-400">
                  Loop End
                  <input
                    aria-label="Quick Sampler loop end"
                    type="range"
                    min={samplerConfig.loopStart + 0.01}
                    max={samplerConfig.trimEnd}
                    step="0.01"
                    value={samplerConfig.loopEnd}
                    onChange={(e) => onSamplerConfigChange({ loopEnd: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-zinc-500">{samplerConfig.loopEnd.toFixed(2)}s</span>
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">Load a sample to reveal trim and loop controls.</div>
        )}
      </div>
    </div>
  );
}

/** Compact ADSR slider with label. */
function AdsrSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col items-center gap-0.5 text-[9px] text-zinc-500">
      <span>{label[0]}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-amber-400"
      />
      <span>{value.toFixed(label === 'Sustain' ? 1 : 2)}</span>
    </label>
  );
}

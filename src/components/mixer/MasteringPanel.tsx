import { useProjectStore } from '../../store/projectStore';
import { LevelMeter } from './LevelMeter';
import { ensureMasteringState } from '../../utils/mastering';
import type { LoudnessTarget, MasteringPreset } from '../../types/project';

const PRESETS: { id: MasteringPreset; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'loud', label: 'Loud' },
  { id: 'warm', label: 'Warm' },
  { id: 'bright', label: 'Bright' },
];

const TARGETS: LoudnessTarget[] = [-14, -11, -8];

function formatLufs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return `${value.toFixed(1)} LUFS`;
}

export function MasteringPanel() {
  const project = useProjectStore((s) => s.project);
  const analyzeMastering = useProjectStore((s) => s.analyzeMastering);
  const setMasteringPreset = useProjectStore((s) => s.setMasteringPreset);
  const setMasteringLoudnessTarget = useProjectStore((s) => s.setMasteringLoudnessTarget);
  const toggleMasteringPreview = useProjectStore((s) => s.toggleMasteringPreview);
  const setMasteringEnabled = useProjectStore((s) => s.setMasteringEnabled);
  const removeMastering = useProjectStore((s) => s.removeMastering);

  if (!project) return null;

  const mastering = ensureMasteringState(project.mastering);
  const hasAnalysis = mastering.analysis !== null;
  const isAnalyzing = mastering.status === 'analyzing';

  return (
    <div className="w-full rounded-lg border border-[#3a3a3a] bg-[#1d1d1d] px-3 py-2 text-[10px] text-zinc-300">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-400">AI Master</div>
          <div className="text-[10px] text-zinc-500">One-click master bus chain</div>
        </div>
        <button
          onClick={() => void analyzeMastering()}
          disabled={isAnalyzing}
          aria-label={hasAnalysis ? 'Re-analyze master bus' : 'Analyze mix for AI mastering'}
          className="rounded bg-cyan-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
        >
          {isAnalyzing ? 'Analyzing...' : hasAnalysis ? 'Re-analyze' : 'AI Master'}
        </button>
      </div>

      {isAnalyzing && (
        <div className="mt-2 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#2b2b2b]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-500" />
          </div>
          <p className="text-[10px] text-zinc-500">
            Analyzing loudness, dynamics, and stereo image...
          </p>
        </div>
      )}

      {hasAnalysis && mastering.analysis && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-[#313131] bg-[#151515] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-zinc-500">Before</div>
              <div className="mt-1 flex items-end gap-2">
                <div className="h-14">
                  <LevelMeter masterStage="input" />
                </div>
                <div>
                  <div className="font-mono text-[11px] text-zinc-100">
                    {formatLufs(mastering.analysis.inputLufs)}
                  </div>
                  <div className="text-zinc-500">Peak {mastering.analysis.peakDb.toFixed(1)} dB</div>
                </div>
              </div>
            </div>
            <div className="rounded border border-cyan-900/50 bg-cyan-950/20 px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-cyan-400">After</div>
              <div className="mt-1 flex items-end gap-2">
                <div className="h-14">
                  <LevelMeter masterStage="output" />
                </div>
                <div>
                  <div className="font-mono text-[11px] text-cyan-100">
                    {formatLufs(mastering.outputLufs)}
                  </div>
                  <div className="text-cyan-200/70">Target {mastering.loudnessTarget} LUFS</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="rounded border border-[#313131] bg-[#151515] px-2 py-1.5">
              <div className="text-zinc-500">Dynamics</div>
              <div className="font-mono text-zinc-100">{mastering.analysis.dynamicRangeDb.toFixed(1)} dB</div>
            </div>
            <div className="rounded border border-[#313131] bg-[#151515] px-2 py-1.5">
              <div className="text-zinc-500">Stereo</div>
              <div className="font-mono text-zinc-100">{mastering.analysis.stereoWidth.toFixed(2)}x</div>
            </div>
            <div className="rounded border border-[#313131] bg-[#151515] px-2 py-1.5">
              <div className="text-zinc-500">Tone</div>
              <div className="font-mono text-zinc-100 capitalize">{mastering.analysis.tonalBalance}</div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wide text-zinc-500">Style</div>
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setMasteringPreset(preset.id)}
                  aria-label={`Use ${preset.label} mastering preset`}
                  className={`rounded border px-2 py-1 text-left transition-colors ${
                    mastering.preset === preset.id
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100'
                      : 'border-[#3a3a3a] bg-[#202020] text-zinc-300 hover:border-[#535353]'
                  }`}
                >
                  {preset.label}
                  {mastering.analysis?.recommendedPreset === preset.id && (
                    <span className="ml-1 text-[9px] text-cyan-400">Rec</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wide text-zinc-500">Loudness Target</div>
            <div className="flex gap-1">
              {TARGETS.map((target) => (
                <button
                  key={target}
                  onClick={() => setMasteringLoudnessTarget(target)}
                  aria-label={`Set mastering loudness target to ${target} LUFS`}
                  className={`flex-1 rounded border px-2 py-1 font-mono transition-colors ${
                    mastering.loudnessTarget === target
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100'
                      : 'border-[#3a3a3a] bg-[#202020] text-zinc-300 hover:border-[#535353]'
                  }`}
                >
                  {target}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setMasteringEnabled(!mastering.enabled)}
              aria-label={mastering.enabled ? 'Disable mastered output' : 'Enable mastered output'}
              className={`flex-1 rounded px-2 py-1 font-semibold transition-colors ${
                mastering.enabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-[#303030] text-zinc-200 hover:bg-[#3a3a3a]'
              }`}
            >
              {mastering.enabled ? 'Master On' : 'Master Off'}
            </button>
            <button
              onClick={toggleMasteringPreview}
              aria-label={mastering.previewOriginal ? 'Preview mastered signal' : 'Preview original signal'}
              className="flex-1 rounded bg-[#303030] px-2 py-1 font-semibold text-zinc-200 transition-colors hover:bg-[#3a3a3a]"
            >
              {mastering.previewOriginal ? 'A/B: Original' : 'A/B: Mastered'}
            </button>
            <button
              onClick={removeMastering}
              aria-label="Remove AI mastering chain"
              className="rounded bg-red-500/15 px-2 py-1 font-semibold text-red-200 transition-colors hover:bg-red-500/25"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

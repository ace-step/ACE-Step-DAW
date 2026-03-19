import { useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import { LevelMeter } from './LevelMeter';
import type { Track } from '../../types/project';

function volumeToDb(v: number): string {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

interface ChannelStripProps {
  track: Track;
  faderHeight: number;
}

function ChannelStrip({ track, faderHeight }: ChannelStripProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);

  const vol = track.volume;
  const pan = track.pan ?? 0;
  const eqLow = track.eqLowGain ?? 0;
  const eqMid = track.eqMidGain ?? 0;
  const eqHigh = track.eqHighGain ?? 0;
  const compEnabled = track.compressorEnabled ?? false;
  const compThresh = track.compressorThreshold ?? -24;
  const compRatio = track.compressorRatio ?? 4;
  const isFrozen = track.frozen ?? false;

  return (
    <div className={`flex flex-col items-center gap-1.5 px-3 py-2 bg-[#2a2a2a] border-r border-[#3a3a3a] min-w-[120px] ${isFrozen ? 'opacity-70' : ''}`}>
      <div className="w-full h-1.5 rounded-full mb-0.5" style={{ backgroundColor: track.color }} />
      <span className="text-xs text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide" title={track.displayName}>
        {isFrozen && <span className="text-cyan-400 mr-0.5" title="Frozen">*</span>}
        {track.displayName}
      </span>

      <div className="flex gap-2 mt-0.5">
        <button
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
            track.muted ? 'bg-amber-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
          }`}
        >
          M
        </button>
        <button
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
            track.soloed ? 'bg-emerald-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
          }`}
        >
          S
        </button>
      </div>

      <Knob value={pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { pan: v })} label="Pan" size={36} step={0.01} disabled={isFrozen} />

      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">EQ</div>
      <div className="flex gap-1.5">
        <Knob value={eqLow} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })} label="Lo" unit="dB" size={34} step={0.5} disabled={isFrozen} />
        <Knob value={eqMid} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })} label="Mid" unit="dB" size={34} step={0.5} disabled={isFrozen} />
        <Knob value={eqHigh} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })} label="Hi" unit="dB" size={34} step={0.5} disabled={isFrozen} />
      </div>

      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Comp</div>
      <button
        onClick={() => updateTrackMixer(track.id, { compressorEnabled: !compEnabled })}
        className={`text-xs font-semibold px-2 py-1 rounded w-full transition-colors ${
          compEnabled ? 'bg-daw-accent text-white' : 'bg-[#444] text-zinc-400 hover:bg-[#555]'
        }`}
      >
        {compEnabled ? 'ON' : 'OFF'}
      </button>
      <div className="flex gap-1.5">
        <Knob value={compThresh} min={-60} max={0} defaultValue={-24} onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })} label="Thr" unit="dB" size={34} step={1} disabled={!compEnabled || isFrozen} />
        <Knob value={compRatio} min={1} max={20} defaultValue={4} onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })} label="Rat" size={34} step={0.5} disabled={!compEnabled || isFrozen} />
      </div>

      <div className="flex-1 flex flex-col items-center gap-1 mt-1 min-h-0 w-full">
        <div className="relative flex items-stretch justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter trackId={track.id} />
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 28, height: faderHeight, accentColor: track.color }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>
    </div>
  );
}

interface MasterStripProps { faderHeight: number; }

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setMasteringEnabled = useProjectStore((s) => s.setMasteringEnabled);
  const setMasteringPreset = useProjectStore((s) => s.setMasteringPreset);
  const setMasteringTargetLufs = useProjectStore((s) => s.setMasteringTargetLufs);
  const setMasteringPreviewBypassed = useProjectStore((s) => s.setMasteringPreviewBypassed);
  const runMasteringAnalysis = useProjectStore((s) => s.runMasteringAnalysis);
  if (!project) return null;
  const masterVol = project.masterVolume ?? 1.0;
  const mastering = project.mastering;
  const analysis = mastering?.analysis;
  const handleChange = (v: number) => { updateProject({ masterVolume: v }); getAudioEngine().masterVolume = v; };
  const handleAnalyze = async () => {
    await runMasteringAnalysis();
    getAudioEngine().applyMastering(useProjectStore.getState().project?.mastering);
  };
  const handleMasteringToggle = async () => {
    if (!mastering?.enabled) {
      await handleAnalyze();
      return;
    }
    setMasteringEnabled(false);
    getAudioEngine().applyMastering({
      ...mastering,
      enabled: false,
      previewBypassed: false,
    });
  };
  const beforeMeterWidth = `${Math.min(100, Math.max(8, ((analysis?.inputLufs ?? -18) + 30) * 4))}%`;
  const afterMeterWidth = `${Math.min(100, Math.max(8, ((analysis?.outputLufs ?? -14) + 30) * 4))}%`;
  const tonalBars = [
    { label: 'Lo', value: analysis?.lowBalance ?? 0.33, color: '#f59e0b' },
    { label: 'Mid', value: analysis?.midBalance ?? 0.34, color: '#38bdf8' },
    { label: 'Hi', value: analysis?.highBalance ?? 0.33, color: '#e879f9' },
  ];

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-2 bg-[#252525] border-l-2 border-[#555] min-w-[220px]">
      <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Master</span>
      <div className="w-full rounded-lg border border-[#3f3f3f] bg-[#202020] p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={mastering?.enabled ? 'Disable AI mastering' : 'Enable AI mastering'}
            onClick={() => { void handleMasteringToggle(); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              mastering?.enabled
                ? 'bg-emerald-500 text-black'
                : 'bg-daw-accent text-white hover:bg-[#5fa6ec]'
            }`}
          >
            {mastering?.enabled ? 'AI Master On' : 'AI Master'}
          </button>
          <button
            type="button"
            aria-label="Run AI mastering analysis"
            onClick={() => { void handleAnalyze(); }}
            className="rounded-md border border-[#4a4a4a] px-2 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-[#6a6a6a]"
          >
            Analyze
          </button>
        </div>

        <div className="mt-2">
          {analysis?.status === 'analyzing' ? (
            <div className="space-y-1.5" aria-label="AI mastering analysis in progress">
              <div className="text-[10px] uppercase tracking-widest text-zinc-400">Analyzing Mix</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#101010]">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-daw-accent" />
              </div>
              <div className="text-[10px] text-zinc-500">
                Scanning balance, loudness, and dynamics...
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-[9px] uppercase tracking-widest text-zinc-500">Preset</span>
                  <select
                    aria-label="Mastering preset"
                    value={mastering?.preset ?? 'balanced'}
                    onChange={(e) => setMasteringPreset(e.target.value as 'balanced' | 'loud' | 'warm' | 'bright')}
                    className="w-full rounded-md border border-[#404040] bg-[#171717] px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="loud">Loud</option>
                    <option value="warm">Warm</option>
                    <option value="bright">Bright</option>
                  </select>
                </label>
                <label className="w-[78px]">
                  <span className="mb-1 block text-[9px] uppercase tracking-widest text-zinc-500">Target</span>
                  <select
                    aria-label="Mastering loudness target"
                    value={String(mastering?.targetLufs ?? -14)}
                    onChange={(e) => setMasteringTargetLufs(Number(e.target.value) as -14 | -11 | -8)}
                    className="w-full rounded-md border border-[#404040] bg-[#171717] px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="-14">-14</option>
                    <option value="-11">-11</option>
                    <option value="-8">-8</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-md bg-[#171717] px-2 py-1.5">
                  <div className="uppercase tracking-widest text-zinc-500">Before</div>
                  <div className="font-mono text-zinc-200">{(analysis?.inputLufs ?? -18).toFixed(1)} LUFS</div>
                  <div className="mt-1 h-1 rounded-full bg-[#101010]">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: beforeMeterWidth }} />
                  </div>
                </div>
                <div className="rounded-md bg-[#171717] px-2 py-1.5">
                  <div className="uppercase tracking-widest text-zinc-500">After</div>
                  <div className="font-mono text-zinc-200">{(analysis?.outputLufs ?? -14).toFixed(1)} LUFS</div>
                  <div className="mt-1 h-1 rounded-full bg-[#101010]">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: afterMeterWidth }} />
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-[#171717] px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-widest text-zinc-500">
                  <span>Tonal Balance</span>
                  <span>{analysis?.recommendedPreset ?? 'balanced'}</span>
                </div>
                <div className="space-y-1">
                  {tonalBars.map((bar) => (
                    <div key={bar.label} className="flex items-center gap-2 text-[9px] text-zinc-400">
                      <span className="w-6 uppercase">{bar.label}</span>
                      <div className="h-1 flex-1 rounded-full bg-[#101010]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round(bar.value * 100)}%`, backgroundColor: bar.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                <div className="rounded-md bg-[#171717] px-2 py-1.5">
                  <div className="uppercase tracking-widest text-zinc-500">Dynamics</div>
                  <div className="font-mono text-zinc-200">{(analysis?.dynamicRange ?? 10).toFixed(1)} dB</div>
                </div>
                <div className="rounded-md bg-[#171717] px-2 py-1.5">
                  <div className="uppercase tracking-widest text-zinc-500">Stereo</div>
                  <div className="font-mono text-zinc-200">{Math.round((analysis?.stereoWidth ?? 0.5) * 100)}%</div>
                </div>
              </div>

              <button
                type="button"
                aria-label={mastering?.previewBypassed ? 'Switch to mastered preview' : 'Switch to original preview'}
                onClick={() => setMasteringPreviewBypassed(!(mastering?.previewBypassed ?? false))}
                className={`w-full rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest ${
                  mastering?.previewBypassed
                    ? 'bg-[#3b2a1a] text-amber-300'
                    : 'bg-[#16221b] text-emerald-300'
                }`}
              >
                {mastering?.previewBypassed ? 'A/B: Original' : 'A/B: Mastered'}
              </button>

              <div className="text-[10px] text-zinc-500">
                {analysis?.summary ?? 'Run analysis to generate a non-destructive mastering chain.'}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-end gap-1 w-full">
        <div className="relative flex justify-center" style={{ height: faderHeight }}>
          <input
            type="range" min={0} max={1.5} step={0.01} value={masterVol}
            onChange={(e) => handleChange(parseFloat(e.target.value))}
            aria-label="Master volume fader"
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 32, height: faderHeight, accentColor: '#4a90d9' }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(masterVol)}</span>
      </div>
    </div>
  );
}

export function MixerPanel() {
  const showMixer = useUIStore((s) => s.showMixer);
  const mixerHeight = useUIStore((s) => s.mixerHeight);
  const setMixerHeight = useUIStore((s) => s.setMixerHeight);
  const project = useProjectStore((s) => s.project);

  const dragState = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startH: mixerHeight };
      const onMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY;
        setMixerHeight(dragState.current.startH + delta);
      };
      const onMouseUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [mixerHeight, setMixerHeight],
  );

  if (!showMixer || !project) return null;

  const faderHeight = Math.max(60, mixerHeight - 300);

  return (
    <div className="border-t border-[#1a1a1a] bg-[#2a2a2a] flex flex-col select-none shrink-0" style={{ height: mixerHeight }}>
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-daw-accent transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize mixer"
      />
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-stretch h-full">
          {project.tracks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">
              Add tracks to see mixer channels
            </div>
          )}
          {project.tracks.map((track) => (
            <ChannelStrip key={track.id} track={track} faderHeight={faderHeight} />
          ))}
          <MasterStrip faderHeight={faderHeight} />
        </div>
      </div>
    </div>
  );
}

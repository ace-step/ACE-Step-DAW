import { useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import { LevelMeter } from './LevelMeter';
import { MasteringPanel } from './MasteringPanel';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import type { Track } from '../../types/project';

const MIXER_MIN_VISIBLE_HEIGHT = 360;
const MIXER_RESIZE_HANDLE_HEIGHT = 6;
const CHANNEL_STRIP_RESERVED_HEIGHT = 246;
const CHANNEL_STRIP_BOTTOM_PADDING = 12;
const FADER_MIN_HEIGHT = 96;

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
    <div className={`flex h-full min-h-0 min-w-[120px] flex-col border-r border-[#3a3a3a] bg-[#2a2a2a] px-3 py-2 ${isFrozen ? 'opacity-70' : ''}`}>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
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
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col items-center justify-end gap-1 self-stretch pb-1">
        <div className="relative flex items-stretch justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter trackId={track.id} />
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            aria-label={`${track.displayName} volume fader`}
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 28, height: faderHeight, accentColor: track.color }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>
    </div>
  );
}

interface MasterStripProps {
  faderHeight: number;
}

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showSpectrum = useUIStore((s) => s.showSpectrumAnalyzer);
  const toggleSpectrum = useUIStore((s) => s.toggleSpectrumAnalyzer);
  if (!project) return null;
  const masterVol = project.masterVolume ?? 1.0;
  const handleChange = (v: number) => { updateProject({ masterVolume: v }); getAudioEngine().masterVolume = v; };

  return (
    <div className="flex h-full min-h-0 min-w-[250px] flex-col border-l-2 border-[#555] bg-[#252525] px-4 py-2">
      <div className="flex w-full shrink-0 items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Master</span>
        <button
          onClick={toggleSpectrum}
          className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
            showSpectrum ? 'bg-blue-600 text-white' : 'bg-[#444] text-zinc-400 hover:bg-[#555]'
          }`}
          title="Toggle spectrum analyzer & LUFS meter"
          data-testid="spectrum-toggle"
        >
          SPEC
        </button>
      </div>
      <div data-testid="master-controls-region" className="mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showSpectrum && <SpectrumAnalyzer width={220} height={120} />}
        <MasteringPanel />
      </div>
      <div data-testid="master-fader-region" className="mt-1 flex min-h-0 flex-1 flex-col items-center justify-end gap-1 self-stretch pb-1">
        <div className="relative flex justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter masterStage="input" />
          <LevelMeter masterStage="output" />
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

  const visibleMixerHeight = Math.max(mixerHeight, MIXER_MIN_VISIBLE_HEIGHT);
  const faderHeight = Math.max(
    FADER_MIN_HEIGHT,
    visibleMixerHeight - MIXER_RESIZE_HANDLE_HEIGHT - CHANNEL_STRIP_RESERVED_HEIGHT - CHANNEL_STRIP_BOTTOM_PADDING,
  );

  return (
    <div className="border-t border-[#1a1a1a] bg-[#2a2a2a] flex flex-col select-none shrink-0" style={{ height: visibleMixerHeight }}>
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-daw-accent transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize mixer"
      />
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-3">
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

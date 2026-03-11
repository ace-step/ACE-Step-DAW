import { useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import type { Track } from '../../types/project';

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function volumeToDb(v: number): string {
  if (v <= 0) return '-∞';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

// -------------------------------------------------------------------------
// Channel strip
// -------------------------------------------------------------------------

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

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2 bg-daw-surface border-r border-daw-border min-w-[104px]">
      {/* Color bar + name */}
      <div
        className="w-full h-1 rounded-full mb-0.5"
        style={{ backgroundColor: track.color }}
      />
      <span
        className="text-[11px] text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide"
        title={track.displayName}
      >
        {track.displayName}
      </span>

      {/* Mute / Solo */}
      <div className="flex gap-1.5 mt-0.5">
        <button
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${
            track.muted
              ? 'bg-amber-500 text-black'
              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
          }`}
        >
          M
        </button>
        <button
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={`text-xs font-bold px-2 py-1 rounded transition-colors ${
            track.soloed
              ? 'bg-emerald-500 text-black'
              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
          }`}
        >
          S
        </button>
      </div>

      {/* Pan */}
      <Knob
        value={pan}
        min={-1}
        max={1}
        defaultValue={0}
        onChange={(v) => updateTrackMixer(track.id, { pan: v })}
        label="Pan"
        size={34}
        step={0.01}
      />

      {/* EQ section */}
      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">EQ</div>
      <div className="flex gap-1">
        <Knob
          value={eqLow}
          min={-15}
          max={15}
          defaultValue={0}
          onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })}
          label="Lo"
          unit="dB"
          size={30}
          step={0.5}
        />
        <Knob
          value={eqMid}
          min={-15}
          max={15}
          defaultValue={0}
          onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })}
          label="Mid"
          unit="dB"
          size={30}
          step={0.5}
        />
        <Knob
          value={eqHigh}
          min={-15}
          max={15}
          defaultValue={0}
          onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })}
          label="Hi"
          unit="dB"
          size={30}
          step={0.5}
        />
      </div>

      {/* Compressor */}
      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Comp</div>
      <button
        onClick={() => updateTrackMixer(track.id, { compressorEnabled: !compEnabled })}
        className={`text-xs font-semibold px-2 py-1 rounded w-full transition-colors ${
          compEnabled
            ? 'bg-indigo-600 text-white'
            : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
        }`}
      >
        {compEnabled ? 'ON' : 'OFF'}
      </button>
      <div className="flex gap-1">
        <Knob
          value={compThresh}
          min={-60}
          max={0}
          defaultValue={-24}
          onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })}
          label="Thr"
          unit="dB"
          size={30}
          step={1}
          disabled={!compEnabled}
        />
        <Knob
          value={compRatio}
          min={1}
          max={20}
          defaultValue={4}
          onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })}
          label="Rat"
          size={30}
          step={0.5}
          disabled={!compEnabled}
        />
      </div>

      {/* Volume fader */}
      <div className="flex-1 flex flex-col items-center gap-1 mt-1 min-h-0 w-full">
        <div className="relative flex justify-center" style={{ height: faderHeight }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={vol}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            className="appearance-none bg-transparent cursor-pointer"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              width: 28,
              height: faderHeight,
              accentColor: track.color,
            }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Master strip
// -------------------------------------------------------------------------

interface MasterStripProps {
  faderHeight: number;
}

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!project) return null;

  const masterVol = project.masterVolume ?? 1.0;

  const handleChange = (v: number) => {
    updateProject({ masterVolume: v });
    getAudioEngine().masterVolume = v;
  };

  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-2 bg-zinc-900 border-l-2 border-zinc-600 min-w-[104px]">
      <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">
        Master
      </span>

      {/* Spacer to align fader with track faders — fixed content height above fader */}
      <div className="flex-1 flex flex-col items-center justify-end gap-1 w-full">
        <div className="relative flex justify-center" style={{ height: faderHeight }}>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={masterVol}
            onChange={(e) => handleChange(parseFloat(e.target.value))}
            className="appearance-none bg-transparent cursor-pointer"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              width: 32,
              height: faderHeight,
              accentColor: '#6366f1',
            }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(masterVol)}</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Panel
// -------------------------------------------------------------------------

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
        // Drag upward → increase height (panel grows upward)
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

  // The fader height scales proportionally with the panel height.
  // Reserve ~160px for strip header (name, mute/solo, knobs, eq, comp).
  const faderHeight = Math.max(60, mixerHeight - 195);

  return (
    <div
      className="border-t border-daw-border bg-daw-surface flex flex-col select-none"
      style={{ height: mixerHeight }}
    >
      {/* Drag-to-resize handle */}
      <div
        className="h-1.5 w-full cursor-ns-resize bg-zinc-700 hover:bg-indigo-500 transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize mixer"
      />

      {/* Scrollable strip area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-stretch h-full">
          {project.tracks.map((track) => (
            <ChannelStrip key={track.id} track={track} faderHeight={faderHeight} />
          ))}
          <MasterStrip faderHeight={faderHeight} />
          {project.tracks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">
              Add tracks to see the mixer
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

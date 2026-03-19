import { useRef, useCallback, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import { LevelMeter } from './LevelMeter';
import type { Track, ReturnTrack } from '../../types/project';

function volumeToDb(v: number): string {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

// ─── ReturnLevelMeter ────────────────────────────────────────────────────────

interface ReturnLevelMeterProps { returnTrackId: string; }

function ReturnLevelMeter({ returnTrackId }: ReturnLevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef(0);
  const peakFramesRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const level = getAudioEngine().getReturnBusLevel(returnTrackId);
    const db = level > 0 ? 20 * Math.log10(level) : -Infinity;
    const normalised = Math.max(0, Math.min(1, (db + 60) / 60));

    // Peak hold
    if (normalised > peakRef.current) {
      peakRef.current = normalised;
      peakFramesRef.current = 18;
    } else if (peakFramesRef.current > 0) {
      peakFramesRef.current--;
    } else {
      peakRef.current = Math.max(0, peakRef.current - 0.008);
    }

    const h = canvas.height;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, h);

    const fillH = normalised * h;
    const green = db < -12;
    const yellow = db >= -12 && db < -3;
    ctx.fillStyle = green ? '#22c55e' : yellow ? '#eab308' : '#ef4444';
    ctx.fillRect(0, h - fillH, w, fillH);

    const peakY = h - peakRef.current * h;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, peakY - 1, w, 2);

    rafRef.current = requestAnimationFrame(draw);
  }, [returnTrackId]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={6}
      style={{ height: '100%' }}
      className="rounded-sm"
    />
  );
}

// ─── ChannelStrip ─────────────────────────────────────────────────────────────

interface ChannelStripProps {
  track: Track;
  faderHeight: number;
  returnTracks: ReturnTrack[];
}

function ChannelStrip({ track, faderHeight, returnTracks }: ChannelStripProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const setTrackSend = useProjectStore((s) => s.setTrackSend);

  const vol = track.volume;
  const pan = track.pan ?? 0;
  const eqLow = track.eqLowGain ?? 0;
  const eqMid = track.eqMidGain ?? 0;
  const eqHigh = track.eqHighGain ?? 0;
  const compEnabled = track.compressorEnabled ?? false;
  const compThresh = track.compressorThreshold ?? -24;
  const compRatio = track.compressorRatio ?? 4;

  const getSendAmount = (returnTrackId: string) =>
    (track.sends ?? []).find((s) => s.returnTrackId === returnTrackId)?.amount ?? 0;

  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-2 bg-[#2a2a2a] border-r border-[#3a3a3a] min-w-[120px]">
      <div className="w-full h-1.5 rounded-full mb-0.5" style={{ backgroundColor: track.color }} />
      <span className="text-xs text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide" title={track.displayName}>
        {track.displayName}
      </span>

      <div className="flex gap-2 mt-0.5">
        <button
          aria-label={`Mute ${track.displayName}`}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
            track.muted ? 'bg-amber-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
          }`}
        >
          M
        </button>
        <button
          aria-label={`Solo ${track.displayName}`}
          onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
          className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
            track.soloed ? 'bg-emerald-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
          }`}
        >
          S
        </button>
      </div>

      <Knob value={pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { pan: v })} label="Pan" size={36} step={0.01} />

      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">EQ</div>
      <div className="flex gap-1.5">
        <Knob value={eqLow} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })} label="Lo" unit="dB" size={34} step={0.5} />
        <Knob value={eqMid} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })} label="Mid" unit="dB" size={34} step={0.5} />
        <Knob value={eqHigh} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })} label="Hi" unit="dB" size={34} step={0.5} />
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
        <Knob value={compThresh} min={-60} max={0} defaultValue={-24} onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })} label="Thr" unit="dB" size={34} step={1} disabled={!compEnabled} />
        <Knob value={compRatio} min={1} max={20} defaultValue={4} onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })} label="Rat" size={34} step={0.5} disabled={!compEnabled} />
      </div>

      {/* ── Sends section ──────────────────────────────────────── */}
      {returnTracks.length > 0 && (
        <>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Sends</div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {returnTracks.map((rt) => (
              <Knob
                key={rt.id}
                value={getSendAmount(rt.id)}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => setTrackSend(track.id, rt.id, v)}
                label={rt.displayName}
                size={34}
                step={0.01}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col items-center gap-1 mt-1 min-h-0 w-full">
        <div className="relative flex items-stretch justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter trackId={track.id} />
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            aria-label={`Volume ${track.displayName}`}
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

// ─── ReturnStrip ─────────────────────────────────────────────────────────────

interface ReturnStripProps {
  returnTrack: ReturnTrack;
  faderHeight: number;
}

function ReturnStrip({ returnTrack, faderHeight }: ReturnStripProps) {
  const updateReturnTrack = useProjectStore((s) => s.updateReturnTrack);
  const removeReturnTrack = useProjectStore((s) => s.removeReturnTrack);

  const vol = returnTrack.volume;

  return (
    <div
      className="flex flex-col items-center gap-1.5 px-3 py-2 bg-[#232a32] border-r border-[#3a4a5a] min-w-[100px]"
      data-return-track-id={returnTrack.id}
    >
      <div className="w-full h-1.5 rounded-full mb-0.5" style={{ backgroundColor: returnTrack.color }} />
      <span
        className="text-xs text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide"
        title={`Return ${returnTrack.displayName}`}
      >
        {returnTrack.displayName}
      </span>
      <span className="text-[9px] text-zinc-600 uppercase tracking-widest -mt-1">Return</span>

      <button
        aria-label={`Mute Return ${returnTrack.displayName}`}
        onClick={() => updateReturnTrack(returnTrack.id, { muted: !returnTrack.muted })}
        className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
          returnTrack.muted ? 'bg-amber-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
        }`}
      >
        M
      </button>

      <Knob
        value={returnTrack.pan ?? 0}
        min={-1} max={1} defaultValue={0}
        onChange={(v) => updateReturnTrack(returnTrack.id, { pan: v })}
        label="Pan" size={34} step={0.01}
      />

      <div className="flex-1 flex flex-col items-center gap-1 mt-1 min-h-0 w-full">
        <div className="relative flex items-stretch justify-center gap-2" style={{ height: faderHeight }}>
          <ReturnLevelMeter returnTrackId={returnTrack.id} />
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            aria-label={`Volume Return ${returnTrack.displayName}`}
            onChange={(e) => updateReturnTrack(returnTrack.id, { volume: parseFloat(e.target.value) })}
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 28, height: faderHeight, accentColor: returnTrack.color }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>

      <button
        aria-label={`Remove Return ${returnTrack.displayName}`}
        onClick={() => removeReturnTrack(returnTrack.id)}
        className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors mt-0.5"
        title="Remove return track"
      >
        ✕
      </button>
    </div>
  );
}

// ─── MasterStrip ─────────────────────────────────────────────────────────────

interface MasterStripProps { faderHeight: number; }

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  if (!project) return null;
  const masterVol = project.masterVolume ?? 1.0;
  const handleChange = (v: number) => { updateProject({ masterVolume: v }); getAudioEngine().masterVolume = v; };

  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-2 bg-[#252525] border-l-2 border-[#555] min-w-[120px]">
      <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Master</span>
      <div className="flex-1 flex flex-col items-center justify-end gap-1 w-full">
        <div className="relative flex justify-center" style={{ height: faderHeight }}>
          <input
            type="range" min={0} max={1.5} step={0.01} value={masterVol}
            aria-label="Master volume"
            onChange={(e) => handleChange(parseFloat(e.target.value))}
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 32, height: faderHeight, accentColor: '#4a90d9' }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(masterVol)}</span>
      </div>
    </div>
  );
}

// ─── MixerPanel ───────────────────────────────────────────────────────────────

export function MixerPanel() {
  const showMixer = useUIStore((s) => s.showMixer);
  const mixerHeight = useUIStore((s) => s.mixerHeight);
  const setMixerHeight = useUIStore((s) => s.setMixerHeight);
  const project = useProjectStore((s) => s.project);
  const addReturnTrack = useProjectStore((s) => s.addReturnTrack);

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
  const returnTracks = project.returnTracks ?? [];

  return (
    <div className="border-t border-[#1a1a1a] bg-[#2a2a2a] flex flex-col select-none shrink-0" style={{ height: mixerHeight }}>
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-daw-accent transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize mixer"
      />
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-stretch h-full">
          {project.tracks.length === 0 && returnTracks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">
              Add tracks to see mixer channels
            </div>
          )}

          {/* Track channel strips */}
          {project.tracks.map((track) => (
            <ChannelStrip key={track.id} track={track} faderHeight={faderHeight} returnTracks={returnTracks} />
          ))}

          {/* Separator before return tracks */}
          {returnTracks.length > 0 && (
            <div className="w-px bg-[#4a6080] self-stretch mx-1 flex-shrink-0" />
          )}

          {/* Return track strips */}
          {returnTracks.map((rt) => (
            <ReturnStrip key={rt.id} returnTrack={rt} faderHeight={faderHeight} />
          ))}

          {/* Add Return button */}
          <div className="flex flex-col items-center justify-center px-2 border-r border-[#3a3a3a]">
            <button
              aria-label="Add return track"
              onClick={() => addReturnTrack()}
              className="text-xs text-zinc-500 hover:text-zinc-200 bg-[#333] hover:bg-[#3a3a3a] border border-[#4a4a4a] rounded px-2 py-1.5 transition-colors"
              title="Add Return Track"
            >
              + Return
            </button>
          </div>

          <MasterStrip faderHeight={faderHeight} />
        </div>
      </div>
    </div>
  );
}


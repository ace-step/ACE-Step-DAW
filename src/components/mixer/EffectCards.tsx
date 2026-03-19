/**
 * EffectCards.tsx — Individual effect parameter UIs (EQ3, Compressor, Reverb, Delay, Distortion, Filter)
 * Extracted from EffectChain.tsx to keep components under 600 lines.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Knob } from '../ui/Knob';
import { useProjectStore } from '../../store/projectStore';
import { effectsEngine } from '../../engine/EffectsEngine';
import type {
  TrackEffect,
  TrackEffectType,
  EQ3Params,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
} from '../../types/project';

interface HSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
  displayValue?: string;
  color?: string;
  width?: number;
}
export function HSlider({ value, onChange, min = 0, max = 1, label, displayValue, color = '#a855f7', width = 80 }: HSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(min + norm * (max - min));
    };
    update(e.clientX);

    const onMove = (me: MouseEvent) => update(me.clientX);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onChange, min, max]);

  const norm = (value - min) / (max - min);

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[7px] text-white/30 uppercase">{label}</span>
          {displayValue && <span className="text-[8px] text-white/50 font-mono">{displayValue}</span>}
        </div>
      )}
      <div
        ref={trackRef}
        className="relative cursor-pointer rounded-full"
        style={{ width, height: 6 }}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10" />
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full"
          style={{ width: `${norm * 100}%`, backgroundColor: color, opacity: 0.7 }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#2a2a4a] border border-white/20 shadow"
          style={{ left: `calc(${norm * 100}% - 6px)` }}
        />
      </div>
    </div>
  );
}

// ─── Per-Effect Cards ────────────────────────────────────────────────────────

export function EQ3Card({ effect, trackId }: { effect: TrackEffect & { type: 'eq3' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<EQ3Params>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'eq3');
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-3 justify-center">
        <Knob value={p.low} onChange={(v) => update({ low: v })} min={-12} max={12} defaultValue={0} label="Low" unit="dB" size={30} step={0.5} />
        <Knob value={p.mid} onChange={(v) => update({ mid: v })} min={-12} max={12} defaultValue={0} label="Mid" unit="dB" size={30} step={0.5} />
        <Knob value={p.high} onChange={(v) => update({ high: v })} min={-12} max={12} defaultValue={0} label="High" unit="dB" size={30} step={0.5} />
      </div>
      <EQCurve low={p.low} mid={p.mid} high={p.high} />
      <div className="flex gap-2">
        <HSlider value={p.lowFrequency} onChange={(v) => update({ lowFrequency: v })} min={100} max={1000} label="Low Freq" displayValue={`${Math.round(p.lowFrequency)} Hz`} color="#22c55e" width={70} />
        <HSlider value={p.highFrequency} onChange={(v) => update({ highFrequency: v })} min={1000} max={8000} label="High Freq" displayValue={`${Math.round(p.highFrequency)} Hz`} color="#ef4444" width={70} />
      </div>
    </div>
  );
}

export function EQCurve({ low, mid, high }: { low: number; mid: number; high: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 150; const h = 40;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.lineWidth = 2;
    const centerY = h / 2;
    const scale = h / 30;

    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let gain = 0;
      if (t < 0.33) { gain = low * (1 - t * 3) + mid * (t * 3); }
      else if (t < 0.66) { gain = mid; }
      else { const lt = (t - 0.66) / 0.34; gain = mid * (1 - lt) + high * lt; }
      const y = centerY - gain * scale;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(w, centerY); ctx.lineTo(0, centerY); ctx.closePath();
    ctx.fillStyle = 'rgba(168, 85, 247, 0.1)'; ctx.fill();
  }, [low, mid, high]);

  return <canvas ref={canvasRef} className="rounded" style={{ width: 150, height: 40 }} />;
}

export function CompressorCard({ effect, trackId }: { effect: TrackEffect & { type: 'compressor' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const setSidechainSource = useProjectStore((s) => s.setSidechainSource);
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const p = effect.params;
  const [reduction, setReduction] = useState(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      setReduction(effectsEngine.getCompressorReduction(trackId, effect.id));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [trackId, effect.id]);

  const update = (updates: Partial<CompressorParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'compressor');
  };

  const otherTracks = tracks.filter((t) => t.id !== trackId);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-2 justify-center">
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-60} max={0} defaultValue={-24} label="Thresh" unit="dB" size={28} step={1} />
        <Knob value={p.ratio} onChange={(v) => update({ ratio: v })} min={1} max={20} defaultValue={4} label="Ratio" size={28} step={0.5} />
        <Knob value={p.attack} onChange={(v) => update({ attack: v })} min={0.001} max={0.1} defaultValue={0.02} label="Attack" size={28} step={0.001} />
        <Knob value={p.release} onChange={(v) => update({ release: v })} min={0.01} max={1} defaultValue={0.2} label="Release" size={28} step={0.01} />
      </div>
      <Knob value={p.knee} onChange={(v) => update({ knee: v })} min={0} max={40} defaultValue={6} label="Knee" size={24} step={1} />
      {/* Sidechain source selector */}
      <div className="border-t border-white/5 pt-1.5 mt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-white/30 uppercase whitespace-nowrap">Sidechain</span>
          <select
            data-testid="sidechain-source-select"
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] text-white/70 outline-none cursor-pointer hover:bg-white/10 appearance-none"
            value={p.sidechainSourceTrackId ?? ''}
            onChange={(e) => {
              const sourceId = e.target.value || undefined;
              setSidechainSource(trackId, effect.id, sourceId);
            }}
          >
            <option value="" className="bg-[#1a1a2e]">None</option>
            {otherTracks.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#1a1a2e]">
                {t.displayName || `Track ${tracks.indexOf(t) + 1}`}
              </option>
            ))}
          </select>
        </div>
        {p.sidechainSourceTrackId && (
          <div className="text-[7px] text-amber-400/60 mt-0.5">
            SC from: {tracks.find((t) => t.id === p.sidechainSourceTrackId)?.displayName ?? 'Unknown'}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[7px] text-white/30 w-6">GR</span>
        <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden relative">
          <div
            className="absolute right-0 top-0 bottom-0 bg-amber-500/60 rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.abs(reduction) * 100 / 30)}%` }}
          />
        </div>
        <span className="text-[8px] text-white/40 font-mono w-10 text-right">{reduction.toFixed(1)} dB</span>
      </div>
    </div>
  );
}

export function ReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'reverb' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ReverbParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'reverb');
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-3 justify-center">
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0.1} max={10} defaultValue={2.4} label="Decay" size={32} step={0.1} />
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={0.1} defaultValue={0.02} label="Pre-Dly" size={32} step={0.001} />
      </div>
      <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color="#8b5cf6" />
    </div>
  );
}

export function DelayCard({ effect, trackId }: { effect: TrackEffect & { type: 'delay' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DelayParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'delay');
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <Knob value={p.time} onChange={(v) => update({ time: v })} min={0.01} max={1} defaultValue={0.25} label="Time" unit="s" size={36} step={0.01} />
      <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={0} max={0.95} defaultValue={0.3} label="Feedback" size={32} step={0.01} />
      <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color="#f59e0b" />
    </div>
  );
}

export function DistortionCard({ effect, trackId }: { effect: TrackEffect & { type: 'distortion' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DistortionParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'distortion');
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-1 justify-center">
        {(['soft', 'overdrive', 'fuzz'] as DistortionParams['distortionType'][]).map((dt) => (
          <button
            key={dt}
            className={`px-2 py-0.5 text-[8px] rounded capitalize ${
              p.distortionType === dt ? 'bg-red-500/30 text-red-300' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
            }`}
            onClick={() => update({ distortionType: dt })}
          >
            {dt}
          </button>
        ))}
      </div>
      <Knob value={p.amount} onChange={(v) => update({ amount: v })} min={0} max={1} defaultValue={0.2} label="Amount" size={36} step={0.01} />
      <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color="#ef4444" />
    </div>
  );
}

export function FilterCard({ effect, trackId }: { effect: TrackEffect & { type: 'filter' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<FilterParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'filter');
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-1 justify-center">
        {(['lowpass', 'highpass', 'bandpass'] as FilterParams['filterType'][]).map((ft) => (
          <button
            key={ft}
            className={`px-1.5 py-0.5 text-[8px] rounded uppercase ${
              p.filterType === ft ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
            }`}
            onClick={() => update({ filterType: ft })}
          >
            {ft === 'lowpass' ? 'LP' : ft === 'highpass' ? 'HP' : 'BP'}
          </button>
        ))}
      </div>
      <div className="flex gap-3 justify-center">
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={20} max={20000} defaultValue={1800} label="Cutoff" size={36} step={10} />
        <Knob value={p.resonance} onChange={(v) => update({ resonance: v })} min={0} max={20} defaultValue={1} label="Reso" size={36} step={0.1} />
      </div>
      <div className="border-t border-white/5 pt-1.5 mt-1">
        <div className="flex items-center gap-1.5 mb-1">
          <button
            className={`px-2 py-0.5 text-[8px] rounded ${
              p.lfoEnabled ? 'bg-green-500/30 text-green-300' : 'text-white/30 hover:bg-white/5'
            }`}
            onClick={() => update({ lfoEnabled: !p.lfoEnabled })}
          >
            LFO {p.lfoEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {p.lfoEnabled && (
          <div className="flex gap-3 justify-center">
            <Knob value={p.lfoRate} onChange={(v) => update({ lfoRate: v })} min={0.1} max={20} defaultValue={2} label="Rate" size={26} step={0.1} />
            <Knob value={p.lfoDepth} onChange={(v) => update({ lfoDepth: v })} min={0} max={1} defaultValue={0.25} label="Depth" size={26} step={0.01} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Effect Device Card ──────────────────────────────────────────────────────

export const EFFECT_COLORS: Record<TrackEffectType, string> = {
  eq3: '#22c55e',
  compressor: '#f59e0b',
  reverb: '#8b5cf6',
  delay: '#f59e0b',
  distortion: '#ef4444',
  filter: '#06b6d4',
};

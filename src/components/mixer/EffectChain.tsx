import { useCallback, useEffect, useRef, useState } from 'react';
import { Knob } from '../ui/Knob';

// Inline icon components (no lucide-react dependency)
const GripVertical = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
);
const ChevronDown = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
);
const ChevronRight = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
);
const Plus = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>
);
const Power = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/></svg>
);
const Trash2 = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
);

import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { effectsEngine } from '../../engine/EffectsEngine';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type {
  TrackEffect,
  TrackEffectType,
  EQ3Params,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
  Track,
} from '../../types/project';

// ─── Effect Presets ──────────────────────────────────────────────────────────

interface EffectPreset {
  name: string;
  params: TrackEffect['params'];
}

const EFFECT_PRESETS: Record<TrackEffectType, EffectPreset[]> = {
  eq3: [
    { name: 'Flat', params: { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 4000 } as EQ3Params },
    { name: 'Bass Boost', params: { low: 6, mid: 0, high: 0, lowFrequency: 250, highFrequency: 4000 } as EQ3Params },
    { name: 'Presence', params: { low: 0, mid: 3, high: 4, lowFrequency: 250, highFrequency: 4000 } as EQ3Params },
    { name: 'Warmth', params: { low: 3, mid: -1, high: -2, lowFrequency: 350, highFrequency: 5000 } as EQ3Params },
  ],
  compressor: [
    { name: 'Gentle', params: { threshold: -24, ratio: 2, attack: 0.02, release: 0.2, knee: 10 } as CompressorParams },
    { name: 'Vocal', params: { threshold: -18, ratio: 4, attack: 0.005, release: 0.1, knee: 6 } as CompressorParams },
    { name: 'Drum Bus', params: { threshold: -12, ratio: 6, attack: 0.001, release: 0.05, knee: 3 } as CompressorParams },
    { name: 'Limit', params: { threshold: -6, ratio: 20, attack: 0.001, release: 0.02, knee: 0 } as CompressorParams },
  ],
  reverb: [
    { name: 'Room', params: { decay: 1.2, preDelay: 0.01, wet: 0.2 } as ReverbParams },
    { name: 'Hall', params: { decay: 3.5, preDelay: 0.02, wet: 0.3 } as ReverbParams },
    { name: 'Chamber', params: { decay: 2.0, preDelay: 0.015, wet: 0.25 } as ReverbParams },
    { name: 'Plate', params: { decay: 1.8, preDelay: 0.005, wet: 0.35 } as ReverbParams },
  ],
  delay: [
    { name: 'Slap', params: { time: 0.08, feedback: 0.2, wet: 0.3 } as DelayParams },
    { name: 'Echo', params: { time: 0.25, feedback: 0.45, wet: 0.35 } as DelayParams },
    { name: 'Long', params: { time: 0.5, feedback: 0.6, wet: 0.4 } as DelayParams },
  ],
  distortion: [
    { name: 'Soft Clip', params: { amount: 0.2, wet: 0.8, distortionType: 'soft' } as DistortionParams },
    { name: 'Overdrive', params: { amount: 0.5, wet: 0.7, distortionType: 'overdrive' } as DistortionParams },
    { name: 'Fuzz', params: { amount: 0.8, wet: 0.6, distortionType: 'fuzz' } as DistortionParams },
  ],
  filter: [
    { name: 'Low Pass', params: { frequency: 2000, resonance: 1, filterType: 'lowpass', lfoEnabled: false, lfoRate: 2, lfoDepth: 0.3 } as FilterParams },
    { name: 'High Pass', params: { frequency: 300, resonance: 1, filterType: 'highpass', lfoEnabled: false, lfoRate: 2, lfoDepth: 0.3 } as FilterParams },
    { name: 'Wah LFO', params: { frequency: 1000, resonance: 4, filterType: 'bandpass', lfoEnabled: true, lfoRate: 3, lfoDepth: 0.6 } as FilterParams },
  ],
};

// ─── Horizontal Slider ───────────────────────────────────────────────────────

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

function HSlider({ value, onChange, min = 0, max = 1, label, displayValue, color = '#a855f7', width = 80 }: HSliderProps) {
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

function EQ3Card({ effect, trackId }: { effect: TrackEffect & { type: 'eq3' }; trackId: string }) {
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

function EQCurve({ low, mid, high }: { low: number; mid: number; high: number }) {
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

function CompressorCard({ effect, trackId }: { effect: TrackEffect & { type: 'compressor' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
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

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-2 justify-center">
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-60} max={0} defaultValue={-24} label="Thresh" unit="dB" size={28} step={1} />
        <Knob value={p.ratio} onChange={(v) => update({ ratio: v })} min={1} max={20} defaultValue={4} label="Ratio" size={28} step={0.5} />
        <Knob value={p.attack} onChange={(v) => update({ attack: v })} min={0.001} max={0.1} defaultValue={0.02} label="Attack" size={28} step={0.001} />
        <Knob value={p.release} onChange={(v) => update({ release: v })} min={0.01} max={1} defaultValue={0.2} label="Release" size={28} step={0.01} />
      </div>
      <Knob value={p.knee} onChange={(v) => update({ knee: v })} min={0} max={40} defaultValue={6} label="Knee" size={24} step={1} />
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

function ReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'reverb' }; trackId: string }) {
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

function DelayCard({ effect, trackId }: { effect: TrackEffect & { type: 'delay' }; trackId: string }) {
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

function DistortionCard({ effect, trackId }: { effect: TrackEffect & { type: 'distortion' }; trackId: string }) {
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

function FilterCard({ effect, trackId }: { effect: TrackEffect & { type: 'filter' }; trackId: string }) {
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

const EFFECT_COLORS: Record<TrackEffectType, string> = {
  eq3: '#22c55e',
  compressor: '#f59e0b',
  reverb: '#8b5cf6',
  delay: '#f59e0b',
  distortion: '#ef4444',
  filter: '#06b6d4',
};

function EffectDevice({
  effect, track, index, onDragStart, onDragOver, isDragOver,
}: {
  effect: TrackEffect;
  track: Track;
  index: number;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  isDragOver: boolean;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const removeTrackEffect = useProjectStore((s) => s.removeTrackEffect);
  const [collapsed, setCollapsed] = useState(false);
  const color = EFFECT_COLORS[effect.type];
  const presets = EFFECT_PRESETS[effect.type];

  const applyPreset = (presetIdx: number) => {
    const preset = presets[presetIdx];
    if (!preset) return;
    updateTrackEffect(track.id, effect.id, { params: preset.params } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(track.id, effect.id, preset.params, effect.type);
    effectsEngine.rebuildChain(track.id, track.effects ?? []);
    // Wire Tone.js effect chain into the TrackNode audio graph
    const engine = getAudioEngine();
    const trackNode = engine.getOrCreateTrackNode(track.id);
    if (trackNode) {
      trackNode.spliceEffects(
        effectsEngine.getInputNode(track.id),
        effectsEngine.getOutputNode(track.id),
      );
    }
  };

  return (
    <div
      className={`flex flex-col min-w-[170px] max-w-[200px] rounded-lg border shrink-0 transition-all ${
        isDragOver ? 'border-l-2 border-l-violet-500' : 'border-white/10'
      } ${!effect.enabled ? 'opacity-40' : ''}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      onMouseOver={() => onDragOver(index)}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-1 px-1.5 py-1 rounded-t-lg cursor-pointer select-none"
        style={{ backgroundColor: `${color}15` }}
      >
        <div
          className="cursor-grab active:cursor-grabbing opacity-40 hover:opacity-80"
          onMouseDown={(e) => { e.stopPropagation(); onDragStart(index); }}
        >
          <GripVertical className="h-3 w-3 text-white/40" />
        </div>

        <button onClick={() => setCollapsed(!collapsed)} className="text-white/40 hover:text-white/60">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <span className="text-[10px] font-medium flex-1 truncate capitalize" style={{ color }}>
          {effect.type}
        </span>

        {/* Preset selector */}
        <select
          className="bg-transparent text-white/40 text-[8px] border-none outline-none cursor-pointer max-w-[60px]"
          onChange={(e) => { if (e.target.value !== '') applyPreset(parseInt(e.target.value)); e.target.value = ''; }}
          value=""
          onClick={(e) => e.stopPropagation()}
        >
          <option value="" className="bg-[#1a1a2e]">Presets</option>
          {presets.map((preset, i) => (
            <option key={i} value={i} className="bg-[#1a1a2e]">{preset.name}</option>
          ))}
        </select>

        {/* Enable/bypass toggle */}
        <button
          className={`h-4 w-4 flex items-center justify-center ${effect.enabled ? 'text-green-400' : 'text-white/20'}`}
          onClick={(e) => {
            e.stopPropagation();
            updateTrackEffect(track.id, effect.id, { enabled: !effect.enabled } as Partial<TrackEffect>);
          }}
        >
          <Power className="h-3 w-3" />
        </button>

        {/* Delete */}
        <button
          className="h-4 w-4 flex items-center justify-center text-white/20 hover:text-red-400"
          onClick={(e) => { e.stopPropagation(); removeTrackEffect(track.id, effect.id); }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="overflow-y-auto max-h-[220px]">
          {effect.type === 'eq3' && <EQ3Card effect={effect} trackId={track.id} />}
          {effect.type === 'compressor' && <CompressorCard effect={effect} trackId={track.id} />}
          {effect.type === 'reverb' && <ReverbCard effect={effect} trackId={track.id} />}
          {effect.type === 'delay' && <DelayCard effect={effect} trackId={track.id} />}
          {effect.type === 'distortion' && <DistortionCard effect={effect} trackId={track.id} />}
          {effect.type === 'filter' && <FilterCard effect={effect} trackId={track.id} />}
        </div>
      )}
    </div>
  );
}

// ─── Add Effect Button ───────────────────────────────────────────────────────

function AddEffectButton({ trackId }: { trackId: string }) {
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const [open, setOpen] = useState(false);

  const effectTypes: { type: TrackEffectType; label: string; icon: string }[] = [
    { type: 'eq3', label: 'EQ Three', icon: '📊' },
    { type: 'compressor', label: 'Compressor', icon: '🔧' },
    { type: 'reverb', label: 'Reverb', icon: '🌊' },
    { type: 'delay', label: 'Delay', icon: '🔁' },
    { type: 'distortion', label: 'Distortion', icon: '⚡' },
    { type: 'filter', label: 'Filter', icon: '🎛' },
  ];

  return (
    <div className="relative shrink-0">
      <button
        className="flex flex-col items-center justify-center w-12 h-full min-h-[80px] border border-dashed border-white/10 rounded-lg hover:border-white/20 hover:bg-white/5 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Plus className="h-4 w-4 text-white/30" />
        <span className="text-[8px] text-white/20 mt-1">Add</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-[#1a1a36] border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
          {effectTypes.map(({ type, label, icon }) => (
            <button
              key={type}
              className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 flex items-center gap-2"
              onClick={() => { addTrackEffect(trackId, type); setOpen(false); }}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main EffectChain Component ──────────────────────────────────────────────

export function EffectChain() {
  const project = useProjectStore((s) => s.project);
  const reorderTrackEffect = useProjectStore((s) => s.reorderTrackEffect);
  const openTrackId = useUIStore((s) => s.openEffectChainTrackId);
  const effectChainHeight = useUIStore((s) => s.effectChainHeight);
  const setEffectChainHeight = useUIStore((s) => s.setEffectChainHeight);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);

  const track = project?.tracks.find((t) => t.id === openTrackId) ?? null;

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const dragOverIdxRef = useRef<number | null>(null);

  // Rebuild effect chain when effects change
  const effectsKey = track?.effects?.map((e) => `${e.id}:${e.enabled}`).join(',') ?? '';
  useEffect(() => {
    if (!track) return;
    effectsEngine.rebuildChain(track.id, track.effects ?? []);
    // Wire rebuilt Tone.js chain into TrackNode audio graph
    const engine = getAudioEngine();
    const trackNode = engine.getOrCreateTrackNode(track.id);
    if (trackNode) {
      trackNode.spliceEffects(
        effectsEngine.getInputNode(track.id),
        effectsEngine.getOutputNode(track.id),
      );
    }
  }, [track?.id, effectsKey, track?.effects?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize handle
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = effectChainHeight;
    const onMouseMove = (ev: MouseEvent) => setEffectChainHeight(startH + (startY - ev.clientY));
    const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [effectChainHeight, setEffectChainHeight]);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
    dragIdxRef.current = idx;

    const handleMouseUp = () => {
      const fromIdx = dragIdxRef.current;
      const toIdx = dragOverIdxRef.current;
      if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx && track) {
        reorderTrackEffect(track.id, fromIdx, toIdx);
      }
      setDragIdx(null);
      setDragOverIdx(null);
      dragIdxRef.current = null;
      dragOverIdxRef.current = null;
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!track) return null;

  const effects = track.effects ?? [];

  return (
    <div
      className="border-t border-[#1a1a1a] bg-[#0e0e24] flex flex-col select-none shrink-0"
      style={{ height: effectChainHeight }}
    >
      {/* Resize handle */}
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0e0e24] border-b border-white/5 shrink-0">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: track.color }} />
        <span className="text-[11px] text-white/70 font-medium">{track.displayName}</span>
        <span className="text-[9px] text-white/30 ml-1">
          — {effects.length} effect{effects.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setOpenEffectChainTrackId(null)}
          className="ml-auto text-xs text-zinc-400 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      {/* Effect devices row */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-start gap-2 p-3">
        {effects.map((effect, idx) => (
          <EffectDevice
            key={effect.id}
            effect={effect}
            track={track}
            index={idx}
            onDragStart={handleDragStart}
            onDragOver={(i) => { setDragOverIdx(i); dragOverIdxRef.current = i; }}
            isDragOver={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
          />
        ))}
        <AddEffectButton trackId={track.id} />
      </div>
    </div>
  );
}

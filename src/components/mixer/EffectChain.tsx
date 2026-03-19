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
  ParametricEQParams,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
  ChorusParams,
  FlangerParams,
  PhaserParams,
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
  parametricEq: [
    {
      name: 'Simple',
      params: {
        mode: 'simple',
        bands: [
          { id: 'simple-low', enabled: true, type: 'lowshelf', frequency: 250, gain: 0, q: 0.7 },
          { id: 'simple-mid', enabled: true, type: 'peaking', frequency: 1000, gain: 0, q: 1 },
          { id: 'simple-high', enabled: true, type: 'highshelf', frequency: 4000, gain: 0, q: 0.7 },
          { id: 'simple-extra', enabled: false, type: 'highpass', frequency: 20, gain: 0, q: 0.7 },
        ],
      } as ParametricEQParams,
    },
    {
      name: 'Vocal Air',
      params: {
        mode: 'parametric',
        bands: [
          { id: 'vocal-cut', enabled: true, type: 'highpass', frequency: 90, gain: 0, q: 0.7 },
          { id: 'vocal-box', enabled: true, type: 'peaking', frequency: 320, gain: -3, q: 1.2 },
          { id: 'vocal-pres', enabled: true, type: 'peaking', frequency: 3500, gain: 2.5, q: 1.1 },
          { id: 'vocal-air', enabled: true, type: 'highshelf', frequency: 10000, gain: 4, q: 0.7 },
        ],
      } as ParametricEQParams,
    },
    {
      name: 'Bass Tight',
      params: {
        mode: 'parametric',
        bands: [
          { id: 'bass-rumble', enabled: true, type: 'highpass', frequency: 35, gain: 0, q: 0.8 },
          { id: 'bass-weight', enabled: true, type: 'peaking', frequency: 90, gain: 3, q: 1.1 },
          { id: 'bass-mud', enabled: true, type: 'peaking', frequency: 260, gain: -2.5, q: 1.4 },
          { id: 'bass-top', enabled: true, type: 'lowpass', frequency: 9000, gain: 0, q: 0.8 },
        ],
      } as ParametricEQParams,
    },
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
  chorus: [
    { name: 'Subtle', params: { frequency: 1.5, delayTime: 3.5, depth: 0.4, feedback: 0, wet: 0.3 } as ChorusParams },
    { name: 'Classic', params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 } as ChorusParams },
    { name: 'Deep', params: { frequency: 0.8, delayTime: 8, depth: 0.9, feedback: 0.3, wet: 0.6 } as ChorusParams },
    { name: 'Vibrato', params: { frequency: 5, delayTime: 2, depth: 1, feedback: 0, wet: 1 } as ChorusParams },
  ],
  flanger: [
    { name: 'Subtle', params: { frequency: 0.3, delayTime: 2, depth: 0.4, feedback: 0.3, wet: 0.4 } as FlangerParams },
    { name: 'Classic', params: { frequency: 0.5, delayTime: 3, depth: 0.7, feedback: 0.5, wet: 0.5 } as FlangerParams },
    { name: 'Jet', params: { frequency: 0.2, delayTime: 5, depth: 0.9, feedback: 0.8, wet: 0.6 } as FlangerParams },
    { name: 'Metallic', params: { frequency: 1, delayTime: 1.5, depth: 0.5, feedback: -0.7, wet: 0.5 } as FlangerParams },
  ],
  phaser: [
    { name: 'Subtle', params: { frequency: 0.3, octaves: 2, stages: 4, Q: 5, baseFrequency: 400, wet: 0.4 } as PhaserParams },
    { name: 'Classic', params: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 } as PhaserParams },
    { name: 'Deep', params: { frequency: 0.2, octaves: 5, stages: 12, Q: 15, baseFrequency: 200, wet: 0.6 } as PhaserParams },
    { name: 'Fast', params: { frequency: 4, octaves: 2, stages: 6, Q: 8, baseFrequency: 500, wet: 0.5 } as PhaserParams },
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

import {
  EQ3Card,
  ParametricEQCard,
  CompressorCard,
  ReverbCard,
  DelayCard,
  DistortionCard,
  FilterCard,
  ChorusCard,
  FlangerCard,
  PhaserCard,
  EFFECT_COLORS,
} from './EffectCards';


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
          {effect.type === 'parametricEq' && <ParametricEQCard effect={effect} trackId={track.id} />}
          {effect.type === 'compressor' && <CompressorCard effect={effect} trackId={track.id} />}
          {effect.type === 'reverb' && <ReverbCard effect={effect} trackId={track.id} />}
          {effect.type === 'delay' && <DelayCard effect={effect} trackId={track.id} />}
          {effect.type === 'distortion' && <DistortionCard effect={effect} trackId={track.id} />}
          {effect.type === 'filter' && <FilterCard effect={effect} trackId={track.id} />}
          {effect.type === 'chorus' && <ChorusCard effect={effect} trackId={track.id} />}
          {effect.type === 'flanger' && <FlangerCard effect={effect} trackId={track.id} />}
          {effect.type === 'phaser' && <PhaserCard effect={effect} trackId={track.id} />}
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
    { type: 'parametricEq', label: 'Parametric EQ', icon: '🎚️' },
    { type: 'eq3', label: 'EQ Three', icon: '📊' },
    { type: 'compressor', label: 'Compressor', icon: '🔧' },
    { type: 'reverb', label: 'Reverb', icon: '🌊' },
    { type: 'delay', label: 'Delay', icon: '🔁' },
    { type: 'distortion', label: 'Distortion', icon: '⚡' },
    { type: 'filter', label: 'Filter', icon: '🎛' },
    { type: 'chorus', label: 'Chorus', icon: '🎵' },
    { type: 'flanger', label: 'Flanger', icon: '🌀' },
    { type: 'phaser', label: 'Phaser', icon: '🔮' },
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
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);

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
      onMouseDownCapture={() => setHistoryFocusScope('mixer')}
      onFocusCapture={() => setHistoryFocusScope('mixer')}
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

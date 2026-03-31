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
  ConvolverParams,
  GateParams,
  DeEsserParams,
  TransientShaperParams,
  LimiterParams,
  SaturationParams,
  StereoImagerParams,
  AlgorithmicReverbParams,
  NoiseGateReductionParams,
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
  convolver: [
    { name: 'Small Room', params: { irType: 'smallRoom', wet: 0.3, preDelay: 0 } as ConvolverParams },
    { name: 'Large Hall', params: { irType: 'largeHall', wet: 0.35, preDelay: 0 } as ConvolverParams },
    { name: 'Plate', params: { irType: 'plate', wet: 0.4, preDelay: 5 } as ConvolverParams },
    { name: 'Spring', params: { irType: 'spring', wet: 0.3, preDelay: 0 } as ConvolverParams },
  ],
  gate: [
    { name: 'Soft Gate', params: { threshold: -40, range: -30, attack: 0.001, hold: 0.01, release: 0.05, hysteresis: 4, mode: 'gate', sidechainHpf: 0, sidechainLpf: 0 } as GateParams },
    { name: 'Tight Gate', params: { threshold: -30, range: -80, attack: 0.0005, hold: 0.005, release: 0.02, hysteresis: 6, mode: 'gate', sidechainHpf: 0, sidechainLpf: 0 } as GateParams },
    { name: 'Drum Gate', params: { threshold: -25, range: -60, attack: 0.0001, hold: 0.02, release: 0.08, hysteresis: 8, mode: 'gate', sidechainHpf: 80, sidechainLpf: 0 } as GateParams },
    { name: 'Expander', params: { threshold: -35, range: -20, attack: 0.005, hold: 0.01, release: 0.1, hysteresis: 3, mode: 'expander', sidechainHpf: 0, sidechainLpf: 0 } as GateParams },
  ],
  deesser: [
    { name: 'Gentle', params: { frequency: 7000, bandwidth: 2, threshold: -15, mode: 'split', listen: false, range: 6 } as DeEsserParams },
    { name: 'Vocal', params: { frequency: 6500, bandwidth: 2.5, threshold: -20, mode: 'split', listen: false, range: 10 } as DeEsserParams },
    { name: 'Aggressive', params: { frequency: 8000, bandwidth: 3, threshold: -25, mode: 'wideband', listen: false, range: 15 } as DeEsserParams },
  ],
  transientShaper: [
    { name: 'Punchy', params: { attack: 50, sustain: -20, mix: 1, output: 0 } as TransientShaperParams },
    { name: 'Soft', params: { attack: -40, sustain: 20, mix: 1, output: 0 } as TransientShaperParams },
    { name: 'Tight', params: { attack: 0, sustain: -60, mix: 1, output: 0 } as TransientShaperParams },
    { name: 'Full', params: { attack: 30, sustain: 40, mix: 1, output: 0 } as TransientShaperParams },
  ],
  limiter: [
    { name: 'Transparent', params: { ceiling: -0.3, release: 0.1, lookahead: 0.005, gain: 0, style: 'transparent' } as LimiterParams },
    { name: 'Loud', params: { ceiling: -0.1, release: 0.05, lookahead: 0.003, gain: 6, style: 'aggressive' } as LimiterParams },
    { name: 'Broadcast', params: { ceiling: -1.0, release: 0.2, lookahead: 0.01, gain: 3, style: 'warm' } as LimiterParams },
    { name: 'Mastering', params: { ceiling: -0.3, release: 0.15, lookahead: 0.005, gain: 2, style: 'transparent' } as LimiterParams },
  ],
  saturation: [
    { name: 'Tape Warmth', params: { drive: 0.25, saturationType: 'tape', harmonicMix: 0, inputGain: 0, outputGain: 0, mix: 0.4 } as SaturationParams },
    { name: 'Tube Glow', params: { drive: 0.35, saturationType: 'tube', harmonicMix: 0.3, inputGain: 0, outputGain: -2, mix: 0.5 } as SaturationParams },
    { name: 'Console Drive', params: { drive: 0.2, saturationType: 'transistor', harmonicMix: 0.1, inputGain: 3, outputGain: -3, mix: 0.6 } as SaturationParams },
    { name: 'Crunch', params: { drive: 0.7, saturationType: 'hard', harmonicMix: -0.5, inputGain: 0, outputGain: -4, mix: 0.5 } as SaturationParams },
  ],
  stereoImager: [
    { name: 'Default', params: { width: 1, midGain: 0, sideGain: 0, monoFreq: 0, pan: 0 } as StereoImagerParams },
    { name: 'Wide', params: { width: 1.5, midGain: 0, sideGain: 2, monoFreq: 0, pan: 0 } as StereoImagerParams },
    { name: 'Mono Bass', params: { width: 1.2, midGain: 0, sideGain: 0, monoFreq: 200, pan: 0 } as StereoImagerParams },
    { name: 'Narrow', params: { width: 0.5, midGain: 2, sideGain: -3, monoFreq: 0, pan: 0 } as StereoImagerParams },
  ],
  algorithmicReverb: [
    { name: 'Small Room', params: { reverbType: 'room', decay: 0.8, preDelay: 5, damping: 0.5, size: 0.3, modRate: 0.2, modDepth: 0.1, erLevel: 3, lowCut: 100, highCut: 10000, mix: 0.2 } as AlgorithmicReverbParams },
    { name: 'Large Hall', params: { reverbType: 'hall', decay: 4, preDelay: 30, damping: 0.3, size: 0.8, modRate: 0.3, modDepth: 0.2, erLevel: 0, lowCut: 60, highCut: 14000, mix: 0.3 } as AlgorithmicReverbParams },
    { name: 'Plate', params: { reverbType: 'plate', decay: 1.8, preDelay: 10, damping: 0.2, size: 0.5, modRate: 0.4, modDepth: 0.15, erLevel: -3, lowCut: 200, highCut: 16000, mix: 0.35 } as AlgorithmicReverbParams },
    { name: 'Dark Chamber', params: { reverbType: 'chamber', decay: 2.2, preDelay: 15, damping: 0.7, size: 0.5, modRate: 0.2, modDepth: 0.1, erLevel: 2, lowCut: 80, highCut: 6000, mix: 0.25 } as AlgorithmicReverbParams },
  ],
  noiseReduction: [
    { name: 'Light', params: { amount: 0.3, threshold: -55, mode: 'smooth', hfEmphasis: 0.3, mix: 1 } as NoiseGateReductionParams },
    { name: 'Medium', params: { amount: 0.5, threshold: -50, mode: 'smooth', hfEmphasis: 0.5, mix: 1 } as NoiseGateReductionParams },
    { name: 'Heavy', params: { amount: 0.8, threshold: -40, mode: 'fast', hfEmphasis: 0.7, mix: 1 } as NoiseGateReductionParams },
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
  ConvolverCard,
  GateCard,
  DeEsserCard,
  TransientShaperCard,
  LimiterCard,
  SaturationCard,
  StereoImagerCard,
  AlgorithmicReverbCard,
  NoiseReductionCard,
  EFFECT_COLORS,
} from './EffectCards';


// ─── Effect type display names ──────────────────────────────────────────────
const EFFECT_DISPLAY_NAMES: Record<TrackEffectType, string> = {
  eq3: 'EQ Three',
  parametricEq: 'Parametric EQ',
  compressor: 'Compressor',
  reverb: 'Reverb',
  delay: 'Delay',
  distortion: 'Distortion',
  filter: 'Filter',
  chorus: 'Chorus',
  flanger: 'Flanger',
  phaser: 'Phaser',
  convolver: 'Convolver',
  gate: 'Gate',
  deesser: 'De-esser',
  transientShaper: 'Transient',
  limiter: 'Limiter',
  saturation: 'Saturation',
  stereoImager: 'Stereo Imager',
  algorithmicReverb: 'Algo Reverb',
  noiseReduction: 'Noise Reduce',
};

// ─── More menu icon ─────────────────────────────────────────────────────────
const MoreVertical = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
);

function EffectDevice({
  effect, track, index, onDragStart, onDragOver, isDragOver, fullWidth = false,
}: {
  effect: TrackEffect;
  track: Track;
  index: number;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  isDragOver: boolean;
  fullWidth?: boolean;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const removeTrackEffect = useProjectStore((s) => s.removeTrackEffect);
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const reorderTrackEffect = useProjectStore((s) => s.reorderTrackEffect);
  const [collapsed, setCollapsed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const color = EFFECT_COLORS[effect.type];
  const presets = EFFECT_PRESETS[effect.type];
  const effects = track.effects ?? [];
  const menuRef = useRef<HTMLDivElement>(null);

  // Close presets on outside click
  useEffect(() => {
    if (!showPresets) return;
    const close = () => setShowPresets(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showPresets]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const applyPreset = (presetIdx: number) => {
    const preset = presets[presetIdx];
    if (!preset) return;
    updateTrackEffect(track.id, effect.id, { params: preset.params } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(track.id, effect.id, preset.params, effect.type);
    effectsEngine.rebuildChain(track.id, track.effects ?? [], track.effectsBypassed ?? false);
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
      className={`flex flex-col transition-all ${
        fullWidth
          ? 'w-full h-full'
          : `min-w-[180px] max-w-[240px] rounded-lg shrink-0 ${isDragOver ? 'ring-1 ring-violet-500' : ''}`
      } ${!effect.enabled ? 'opacity-40' : ''}`}
      style={fullWidth ? undefined : {
        backgroundColor: `color-mix(in srgb, ${color} 6%, #181828)`,
        border: `1px solid ${color}22`,
      }}
      onMouseOver={fullWidth ? undefined : () => onDragOver(index)}
    >
      {/* ── Device header bar ── */}
      <div
        className={`flex items-center select-none shrink-0 ${
          fullWidth
            ? 'gap-2 px-4 py-1.5'
            : 'gap-1.5 px-2 py-1.5 rounded-t-lg'
        }`}
        style={{
          background: `${color}0a`,
          borderBottom: `1px solid ${color}15`,
        }}
      >
        {/* Drag handle (compact view only) */}
        {!fullWidth && (
          <div
            className="cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70 transition-opacity"
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(index); }}
          >
            <GripVertical className="h-3 w-3 text-white/50" />
          </div>
        )}

        {/* Effect name */}
        <button
          onClick={() => !fullWidth && setCollapsed(!collapsed)}
          className={`font-semibold flex-1 truncate text-left transition-colors ${
            fullWidth ? 'text-[12px]' : 'text-[10px]'
          }`}
          style={{ color: `${color}dd` }}
        >
          {EFFECT_DISPLAY_NAMES[effect.type] ?? effect.type}
        </button>

        {/* Preset selector — custom dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-0.5 text-[9px] text-white/40 hover:text-white/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowPresets(!showPresets); }}
          >
            Presets
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {showPresets && (
            <div
              className="absolute right-0 top-full mt-1 bg-daw-surface-2 border border-white/10 rounded shadow-xl z-50 py-1 min-w-[100px]"
              onClick={(e) => e.stopPropagation()}
            >
              {presets.map((preset, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-1 text-[10px] text-white/60 hover:bg-white/10 hover:text-white/80"
                  onClick={() => { applyPreset(i); setShowPresets(false); }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bypass toggle */}
        <button
          className={`h-5 w-5 flex items-center justify-center transition-colors rounded ${effect.enabled ? 'text-green-400 hover:text-green-300' : 'text-white/20 hover:text-white/40'}`}
          onClick={(e) => {
            e.stopPropagation();
            updateTrackEffect(track.id, effect.id, { enabled: !effect.enabled } as Partial<TrackEffect>);
          }}
          title={effect.enabled ? 'Bypass' : 'Enable'}
        >
          <Power className="h-3 w-3" />
        </button>

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            className="h-4 w-4 flex items-center justify-center text-white/20 hover:text-white/50"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          >
            <MoreVertical className="h-3 w-3" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a1a36] border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
              <button
                className="w-full text-left px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/10"
                onClick={() => { addTrackEffect(track.id, effect.type); setShowMenu(false); }}
              >
                Duplicate
              </button>
              {index > 0 && (
                <button
                  className="w-full text-left px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/10"
                  onClick={() => { reorderTrackEffect(track.id, index, index - 1); setShowMenu(false); }}
                >
                  Move Left
                </button>
              )}
              {index < effects.length - 1 && (
                <button
                  className="w-full text-left px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/10"
                  onClick={() => { reorderTrackEffect(track.id, index, index + 1); setShowMenu(false); }}
                >
                  Move Right
                </button>
              )}
              <div className="border-t border-white/5 my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-[10px] text-red-400/70 hover:bg-white/10"
                onClick={() => { removeTrackEffect(track.id, effect.id); setShowMenu(false); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div
        className={fullWidth ? 'flex-1 overflow-y-auto' : 'overflow-hidden transition-[max-height] duration-200 ease-in-out'}
        style={fullWidth ? undefined : { maxHeight: collapsed ? '0px' : '280px' }}
      >
        <div className={fullWidth ? 'h-full flex flex-col justify-center' : 'overflow-y-auto max-h-[280px]'}>
          <EffectCardBody effect={effect} trackId={track.id} />
        </div>
      </div>
    </div>
  );
}

/** Renders the correct card component for a given effect type */
function EffectCardBody({ effect, trackId }: { effect: TrackEffect; trackId: string }) {
  switch (effect.type) {
    case 'eq3': return <EQ3Card effect={effect} trackId={trackId} />;
    case 'parametricEq': return <ParametricEQCard effect={effect} trackId={trackId} />;
    case 'compressor': return <CompressorCard effect={effect} trackId={trackId} />;
    case 'reverb': return <ReverbCard effect={effect} trackId={trackId} />;
    case 'delay': return <DelayCard effect={effect} trackId={trackId} />;
    case 'distortion': return <DistortionCard effect={effect} trackId={trackId} />;
    case 'filter': return <FilterCard effect={effect} trackId={trackId} />;
    case 'chorus': return <ChorusCard effect={effect} trackId={trackId} />;
    case 'flanger': return <FlangerCard effect={effect} trackId={trackId} />;
    case 'phaser': return <PhaserCard effect={effect} trackId={trackId} />;
    case 'convolver': return <ConvolverCard effect={effect} trackId={trackId} />;
    case 'gate': return <GateCard effect={effect} trackId={trackId} />;
    case 'deesser': return <DeEsserCard effect={effect} trackId={trackId} />;
    case 'transientShaper': return <TransientShaperCard effect={effect} trackId={trackId} />;
    case 'limiter': return <LimiterCard effect={effect} trackId={trackId} />;
    case 'saturation': return <SaturationCard effect={effect} trackId={trackId} />;
    case 'stereoImager': return <StereoImagerCard effect={effect} trackId={trackId} />;
    case 'algorithmicReverb': return <AlgorithmicReverbCard effect={effect} trackId={trackId} />;
    case 'noiseReduction': return <NoiseReductionCard effect={effect} trackId={trackId} />;
    default: return null;
  }
}

// ─── Add Effect Button ───────────────────────────────────────────────────────

function AddEffectButton({ trackId }: { trackId: string }) {
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);

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
    { type: 'convolver', label: 'Convolution Reverb', icon: '🏛️' },
    { type: 'gate', label: 'Gate / Expander', icon: '🚪' },
    { type: 'deesser', label: 'De-esser', icon: '🎤' },
    { type: 'transientShaper', label: 'Transient Shaper', icon: '⚡' },
    { type: 'limiter', label: 'Limiter', icon: '🧱' },
    { type: 'saturation', label: 'Saturation', icon: '🔥' },
    { type: 'stereoImager', label: 'Stereo Imager', icon: '🔊' },
    { type: 'algorithmicReverb', label: 'Algorithmic Reverb', icon: '🏔️' },
    { type: 'noiseReduction', label: 'Noise Reduction', icon: '🔇' },
  ];

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
    }
    setOpen(!open);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
        onClick={(e) => { e.stopPropagation(); handleToggle(); }}
      >
        <Plus className="h-3 w-3" />
        <span className="text-[9px]">Add</span>
      </button>

      {open && menuPos && (
        <div
          className="fixed bg-[#1a1a36] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[170px] max-h-[400px] overflow-y-auto"
          style={{ left: menuPos.left, bottom: menuPos.bottom, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
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
    effectsEngine.rebuildChain(track.id, track.effects ?? [], track.effectsBypassed ?? false);
    // Wire rebuilt Tone.js chain into TrackNode audio graph
    const engine = getAudioEngine();
    const trackNode = engine.getOrCreateTrackNode(track.id);
    if (trackNode) {
      trackNode.spliceEffects(
        effectsEngine.getInputNode(track.id),
        effectsEngine.getOutputNode(track.id),
      );
    }
  }, [track?.id, effectsKey, track?.effects?.length, track?.effectsBypassed]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Selected effect (local state — Ableton-style single-device view) ──
  const [selectedEffectIdx, setSelectedEffectIdx] = useState(0);

  // Auto-select last effect when a new one is added
  const prevEffectsLenRef = useRef(0);
  useEffect(() => {
    const len = track?.effects?.length ?? 0;
    if (len > prevEffectsLenRef.current && len > 0) {
      setSelectedEffectIdx(len - 1);
    }
    prevEffectsLenRef.current = len;
  }, [track?.effects?.length]);

  if (!track) return null;

  const effects = track.effects ?? [];
  const clampedIdx = Math.min(selectedEffectIdx, effects.length - 1);
  const selectedEffect = effects[clampedIdx] ?? null;
  const selectedColor = selectedEffect ? EFFECT_COLORS[selectedEffect.type] : '#555';

  return (
    <div
      className="border-t border-[#1a1a1a] bg-daw-bg flex flex-col select-none shrink-0"
      style={{ height: effectChainHeight }}
      onMouseDownCapture={() => setHistoryFocusScope('mixer')}
      onFocusCapture={() => setHistoryFocusScope('mixer')}
    >
      {/* ── Resize handle ── */}
      <div
        className="h-[2px] w-full cursor-ns-resize bg-white/[0.06] hover:bg-daw-accent transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      {/* ── Full-width selected effect view ── */}
      <div className={`flex-1 overflow-y-auto relative transition-all duration-200 ease-in-out ${track.effectsBypassed ? 'opacity-45 grayscale' : 'opacity-100 grayscale-0'}`}>
        {selectedEffect ? (
          <div className="h-full">
            {/* Device header — integrated into the full-width view */}
            <EffectDevice
              effect={selectedEffect}
              track={track}
              index={clampedIdx}
              onDragStart={() => {}}
              onDragOver={() => {}}
              isDragOver={false}
              fullWidth
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            No effects — click + to add one
          </div>
        )}
        {/* Bypass watermark overlay */}
        {track.effectsBypassed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200">
            <span className="text-white/[0.06] text-4xl font-bold uppercase tracking-[0.3em] select-none">
              Bypass
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom tab strip — Ableton-style device chain ── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-daw-bg">
        {/* Track info + controls */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-white/[0.04]">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: track.color }} />
          <span className="text-[10px] text-white/50 font-medium">{track.displayName}</span>
          <span className="text-[9px] text-white/20">
            {effects.length} fx
          </span>
          {track.effectsBypassed && (
            <span className="rounded bg-orange-500/20 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-widest text-orange-200">
              Bypassed
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setOpenEffectChainTrackId(null)}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Effect tabs row */}
        <div className="flex items-stretch gap-0 overflow-x-auto px-1 py-1">
          {effects.map((effect, idx) => {
            const c = EFFECT_COLORS[effect.type];
            const isSelected = idx === clampedIdx;
            return (
              <button
                key={effect.id}
                onClick={() => setSelectedEffectIdx(idx)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-all border-r border-white/[0.08] last:border-r-0 ${
                  isSelected
                    ? 'text-white/90 bg-white/[0.06]'
                    : 'text-white/40 hover:text-white/65 hover:bg-white/[0.03]'
                } ${!effect.enabled ? 'opacity-40' : ''}`}
                style={isSelected ? {
                  borderBottom: `2px solid ${c}`,
                } : { borderBottom: '2px solid transparent' }}
              >
                <div
                  className="w-[5px] h-[5px] rounded-full shrink-0"
                  style={{ backgroundColor: c, opacity: isSelected ? 1 : 0.4 }}
                />
                <span className="truncate max-w-[80px]">
                  {EFFECT_DISPLAY_NAMES[effect.type] ?? effect.type}
                </span>
              </button>
            );
          })}
          <AddEffectButton trackId={track.id} />
        </div>
      </div>
    </div>
  );
}

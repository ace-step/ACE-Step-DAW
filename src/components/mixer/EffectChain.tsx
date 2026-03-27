import { useCallback, useEffect, useRef, useState } from 'react';

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
};

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
  EFFECT_COLORS,
} from './EffectCards';

// ─── Effect Display Names ────────────────────────────────────────────────────

const EFFECT_DISPLAY_NAMES: Record<string, string> = {
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
};

// ─── Categorized Effect Browser ──────────────────────────────────────────────

/** Build a category entry deriving label from EFFECT_DISPLAY_NAMES to avoid duplication. */
function categoryEntry(type: TrackEffectType) {
  return { type, label: EFFECT_DISPLAY_NAMES[type] ?? type };
}

interface EffectCategory {
  name: string;
  effects: { type: TrackEffectType; label: string }[];
}

const EFFECT_CATEGORIES: EffectCategory[] = [
  { name: 'EQ', effects: [categoryEntry('parametricEq'), categoryEntry('eq3')] },
  { name: 'Dynamics', effects: [categoryEntry('compressor')] },
  { name: 'Time', effects: [categoryEntry('reverb'), categoryEntry('delay'), categoryEntry('convolver')] },
  { name: 'Modulation', effects: [categoryEntry('chorus'), categoryEntry('flanger'), categoryEntry('phaser')] },
  { name: 'Distortion', effects: [categoryEntry('distortion')] },
  { name: 'Filter', effects: [categoryEntry('filter')] },
];

// ─── Signal Flow Wire ────────────────────────────────────────────────────────

function SignalWire({ bypassed }: { bypassed?: boolean }) {
  return (
    <div
      className="flex items-center shrink-0 self-stretch"
      data-testid="signal-wire"
      aria-hidden="true"
    >
      <svg width="24" height="40" viewBox="0 0 24 40" className="shrink-0">
        <line
          x1="0" y1="20" x2="24" y2="20"
          stroke={bypassed ? '#555' : '#4A5FFF'}
          strokeWidth="2"
          strokeDasharray={bypassed ? '3 2' : 'none'}
        />
        {/* Signal direction arrow */}
        <polygon
          points="18,16 24,20 18,24"
          fill={bypassed ? '#555' : '#4A5FFF'}
          opacity={bypassed ? 0.5 : 0.7}
        />
      </svg>
    </div>
  );
}

// ─── Signal Terminal (Input / Output) ────────────────────────────────────────

function SignalTerminal({ label, side }: { label: string; side: 'input' | 'output' }) {
  return (
    <div
      className="flex flex-col items-center justify-center shrink-0 gap-1 px-2"
      data-testid={`signal-terminal-${side}`}
    >
      <div className={`w-2.5 h-2.5 rounded-full border-2 ${
        side === 'input' ? 'border-green-500 bg-green-500/20' : 'border-blue-500 bg-blue-500/20'
      }`} />
      <span className="text-[8px] uppercase tracking-widest text-white/30 font-semibold">{label}</span>
    </div>
  );
}

// ─── Drop Zone Indicator ─────────────────────────────────────────────────────

function DropZoneIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="flex items-stretch shrink-0 self-stretch"
      data-testid="drop-zone-indicator"
    >
      <div className="w-0.5 bg-violet-500 rounded-full mx-1 shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
    </div>
  );
}

// ─── Effect Device Panel ─────────────────────────────────────────────────────

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
    <>
      {/* Drop zone before this device */}
      <DropZoneIndicator active={isDragOver} />

      <div
        data-testid={`effect-device-${index}`}
        data-effect-id={effect.id}
        data-effect-type={effect.type}
        className={`flex flex-col min-w-[180px] max-w-[210px] rounded-md shrink-0 transition-all overflow-hidden ${
          !effect.enabled ? 'opacity-40 grayscale-[30%]' : ''
        }`}
        style={{ backgroundColor: '#1a1a2e' }}
        onMouseOver={() => onDragOver(index)}
      >
        {/* Colored accent strip -- Ableton-style top border */}
        <div
          className="h-[3px] w-full shrink-0"
          style={{ backgroundColor: effect.enabled ? color : '#444' }}
        />

        {/* Title bar */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 cursor-pointer select-none border-b border-white/5"
          style={{ backgroundColor: `${color}08` }}
        >
          {/* Drag handle */}
          <div
            className="cursor-grab active:cursor-grabbing opacity-40 hover:opacity-80 shrink-0"
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(index); }}
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5 text-white/40" />
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/40 hover:text-white/60 shrink-0"
            aria-label={collapsed ? 'Expand device' : 'Collapse device'}
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {/* Device name */}
          <span className="text-[11px] font-semibold flex-1 truncate" style={{ color: effect.enabled ? color : '#888' }}>
            {EFFECT_DISPLAY_NAMES[effect.type] ?? effect.type}
          </span>

          {/* Preset selector */}
          <select
            className="bg-transparent text-white/40 text-[9px] border-none outline-none cursor-pointer max-w-[60px] shrink-0"
            onChange={(e) => { if (e.target.value !== '') applyPreset(parseInt(e.target.value)); e.target.value = ''; }}
            value=""
            onClick={(e) => e.stopPropagation()}
            aria-label={`${EFFECT_DISPLAY_NAMES[effect.type]} presets`}
          >
            <option value="" className="bg-[#1a1a2e]">Presets</option>
            {presets.map((preset, i) => (
              <option key={i} value={i} className="bg-[#1a1a2e]">{preset.name}</option>
            ))}
          </select>

          {/* Power / bypass toggle */}
          <button
            data-testid={`effect-bypass-${index}`}
            className={`h-5 w-5 flex items-center justify-center rounded-sm transition-colors shrink-0 ${
              effect.enabled
                ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20'
                : 'text-white/20 bg-white/5 hover:bg-white/10'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              updateTrackEffect(track.id, effect.id, { enabled: !effect.enabled } as Partial<TrackEffect>);
            }}
            aria-label={effect.enabled ? `Bypass ${EFFECT_DISPLAY_NAMES[effect.type]}` : `Enable ${EFFECT_DISPLAY_NAMES[effect.type]}`}
            title={effect.enabled ? 'Bypass' : 'Enable'}
          >
            <Power className="h-3 w-3" />
          </button>

          {/* Delete */}
          <button
            data-testid={`effect-remove-${index}`}
            className="h-5 w-5 flex items-center justify-center rounded-sm text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); removeTrackEffect(track.id, effect.id); }}
            aria-label={`Remove ${EFFECT_DISPLAY_NAMES[effect.type]}`}
            title="Remove device"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* Device body -- parameter cards */}
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
            {effect.type === 'convolver' && <ConvolverCard effect={effect} trackId={track.id} />}
          </div>
        )}

        {/* Chain position footer */}
        <div className="flex items-center justify-between px-2 py-0.5 border-t border-white/5 bg-white/[0.02]">
          <span className="text-[8px] text-white/20 font-mono tabular-nums">
            {index + 1}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Add Effect Button (Categorized + Searchable) ────────────────────────────

function AddEffectButton({ trackId }: { trackId: string }) {
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const lowerSearch = search.toLowerCase();
  const filteredCategories = EFFECT_CATEGORIES.map((cat) => ({
    ...cat,
    effects: cat.effects.filter((e) =>
      e.label.toLowerCase().includes(lowerSearch) ||
      cat.name.toLowerCase().includes(lowerSearch)
    ),
  })).filter((cat) => cat.effects.length > 0);

  return (
    <div className="relative shrink-0 self-stretch flex items-center" ref={dropdownRef}>
      <button
        data-testid="add-effect-button"
        className="flex flex-col items-center justify-center w-14 h-full min-h-[80px] border border-dashed border-white/10 rounded-md hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors gap-1"
        onClick={() => setOpen(!open)}
        aria-label="Add effect device"
        title="Add effect device"
      >
        <Plus className="h-5 w-5 text-white/30" />
        <span className="text-[9px] text-white/25 font-medium">Add</span>
      </button>

      {open && (
        <div
          data-testid="add-effect-dropdown"
          className="absolute left-0 top-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-2xl z-50 min-w-[200px]"
        >
          {/* Search input */}
          <div className="px-2 pt-2 pb-1">
            <input
              ref={searchRef}
              data-testid="effect-search-input"
              type="text"
              placeholder="Search effects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-violet-500/50"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                  setSearch('');
                }
              }}
            />
          </div>

          {/* Categorized list */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {filteredCategories.map((cat) => (
              <div key={cat.name}>
                <div className="px-3 py-1 text-[9px] text-white/30 uppercase tracking-widest font-semibold border-t border-white/5 first:border-t-0">
                  {cat.name}
                </div>
                {cat.effects.map(({ type, label }) => {
                  const c = EFFECT_COLORS[type];
                  return (
                    <button
                      key={type}
                      data-testid={`add-effect-${type}`}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 flex items-center gap-2 transition-colors"
                      onClick={() => {
                        addTrackEffect(trackId, type);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-white/25 text-center">
                No effects match "{search}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main EffectChain Component ──────────────────────────────────────────────

export function EffectChain() {
  const project = useProjectStore((s) => s.project);
  const reorderTrackEffect = useProjectStore((s) => s.reorderTrackEffect);
  const toggleTrackEffectsBypass = useProjectStore((s) => s.toggleTrackEffectsBypass);
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

  if (!track) return null;

  const effects = track.effects ?? [];
  const isBypassed = track.effectsBypassed ?? false;

  return (
    <div
      data-testid="effect-chain-panel"
      className="border-t border-[#1a1a1a] bg-[#0d0d1e] flex flex-col select-none shrink-0"
      style={{ height: effectChainHeight }}
      onMouseDownCapture={() => setHistoryFocusScope('mixer')}
      onFocusCapture={() => setHistoryFocusScope('mixer')}
    >
      {/* Resize handle */}
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#333] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
        data-testid="effect-chain-resize-handle"
      />

      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-[#111128] border-b border-white/5 shrink-0"
        data-testid="effect-chain-header"
      >
        {/* Track color dot */}
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: track.color }} />

        {/* Track name */}
        <span className="text-[11px] text-white/80 font-semibold">{track.displayName}</span>

        {/* Separator */}
        <div className="w-px h-3 bg-white/10" />

        {/* Chain label */}
        <span className="text-[10px] text-white/30">
          Device Chain
        </span>

        {/* Effect count */}
        <span className="text-[10px] text-white/20 font-mono tabular-nums">
          ({effects.length})
        </span>

        {/* Global bypass badge */}
        {isBypassed && (
          <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-orange-300">
            Bypassed
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bypass all toggle */}
        <button
          data-testid="effect-chain-bypass-all"
          onClick={() => toggleTrackEffectsBypass(track.id)}
          className={`text-[9px] font-semibold px-2 py-0.5 rounded transition-colors ${
            isBypassed
              ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
              : 'bg-white/5 text-white/40 hover:bg-white/10'
          }`}
          title={isBypassed ? 'Enable all effects' : 'Bypass all effects'}
        >
          FX {isBypassed ? 'OFF' : 'ON'}
        </button>

        {/* Close button */}
        <button
          data-testid="effect-chain-close"
          onClick={() => setOpenEffectChainTrackId(null)}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200 transition-colors"
          aria-label="Close effect chain"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>

      {/* Device chain row with signal routing */}
      <div
        className={`flex-1 overflow-x-auto overflow-y-hidden flex items-center px-3 py-2 transition-opacity ${
          isBypassed ? 'opacity-45' : 'opacity-100'
        }`}
        data-testid="effect-chain-devices"
      >
        {/* Input terminal */}
        <SignalTerminal label="In" side="input" />

        {/* Wire from input to first device (or output) */}
        <SignalWire bypassed={isBypassed} />

        {/* Devices with routing wires between them */}
        {effects.map((effect, idx) => (
          <div key={effect.id} className="contents">
            <EffectDevice
              effect={effect}
              track={track}
              index={idx}
              onDragStart={handleDragStart}
              onDragOver={(i) => { setDragOverIdx(i); dragOverIdxRef.current = i; }}
              isDragOver={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
            />

            {/* Wire after device */}
            <SignalWire bypassed={isBypassed || !effect.enabled} />
          </div>
        ))}

        {/* Add effect button */}
        <AddEffectButton trackId={track.id} />

        {/* Wire to output */}
        <SignalWire bypassed={isBypassed} />

        {/* Output terminal */}
        <SignalTerminal label="Out" side="output" />
      </div>

      {/* Empty state */}
      {effects.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '80px' }}>
          <span className="text-[11px] text-white/15">
            No effects -- click + to add a device
          </span>
        </div>
      )}
    </div>
  );
}

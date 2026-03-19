/**
 * MidiEffectChain.tsx — MIDI FX rack panel: Scale Lock, Arpeggiator, Chord Generator.
 * Modelled after EffectChain.tsx for audio effects.
 */
import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type {
  MidiEffect,
  MidiEffectType,
  ArpeggiatorParams,
  ChordGenParams,
  ScaleLockParams,
  Track,
} from '../../types/project';

type MidiEffectStoreActions = {
  updateMidiEffect: (trackId: string, effectId: string, updates: Partial<MidiEffect>) => void;
  toggleMidiEffect: (trackId: string, effectId: string) => void;
  reorderMidiEffect: (trackId: string, fromIndex: number, toIndex: number) => void;
};

// ─── Inline icons ────────────────────────────────────────────────────────────

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

// ─── Colors ──────────────────────────────────────────────────────────────────

const MIDI_EFFECT_COLORS: Record<MidiEffectType, string> = {
  'scale-lock': '#10b981',   // emerald
  'arpeggiator': '#f59e0b',  // amber
  'chord-gen': '#8b5cf6',    // violet
};

// ─── Note names helper ───────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Scale Lock Card ─────────────────────────────────────────────────────────

function ScaleLockCard({ effect, trackId }: { effect: MidiEffect & { type: 'scale-lock' }; trackId: string }) {
  const updateMidiEffect = useProjectStore((s) => (s as MidiEffectStoreActions).updateMidiEffect);
  const params = effect.params as ScaleLockParams;

  const setParam = (key: keyof ScaleLockParams, value: ScaleLockParams[keyof ScaleLockParams]) => {
    updateMidiEffect(trackId, effect.id, { params: { ...params, [key]: value } } as Partial<MidiEffect>);
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-10">Root</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.root}
          onChange={(e) => setParam('root', parseInt(e.target.value))}
        >
          {NOTE_NAMES.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-10">Scale</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.scale}
          onChange={(e) => setParam('scale', e.target.value as ScaleLockParams['scale'])}
        >
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="pentatonic">Pentatonic</option>
          <option value="blues">Blues</option>
          <option value="chromatic">Chromatic</option>
        </select>
      </div>
    </div>
  );
}

// ─── Arpeggiator Card ────────────────────────────────────────────────────────

function ArpeggiatorCard({ effect, trackId }: { effect: MidiEffect & { type: 'arpeggiator' }; trackId: string }) {
  const updateMidiEffect = useProjectStore((s) => (s as MidiEffectStoreActions).updateMidiEffect);
  const params = effect.params as ArpeggiatorParams;

  const setParam = (key: keyof ArpeggiatorParams, value: ArpeggiatorParams[keyof ArpeggiatorParams]) => {
    updateMidiEffect(trackId, effect.id, { params: { ...params, [key]: value } } as Partial<MidiEffect>);
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-12">Rate</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.rate}
          onChange={(e) => setParam('rate', e.target.value as ArpeggiatorParams['rate'])}
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-12">Pattern</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.pattern}
          onChange={(e) => setParam('pattern', e.target.value as ArpeggiatorParams['pattern'])}
        >
          <option value="up">Up</option>
          <option value="down">Down</option>
          <option value="up-down">Up-Down</option>
          <option value="random">Random</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-12">Octaves</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.octaves}
          onChange={(e) => setParam('octaves', parseInt(e.target.value))}
        >
          {[1, 2, 3, 4].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Chord Generator Card ────────────────────────────────────────────────────

function ChordGenCard({ effect, trackId }: { effect: MidiEffect & { type: 'chord-gen' }; trackId: string }) {
  const updateMidiEffect = useProjectStore((s) => (s as MidiEffectStoreActions).updateMidiEffect);
  const params = effect.params as ChordGenParams;

  const setParam = (key: keyof ChordGenParams, value: ChordGenParams[keyof ChordGenParams]) => {
    updateMidiEffect(trackId, effect.id, { params: { ...params, [key]: value } } as Partial<MidiEffect>);
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-12">Type</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.chordType}
          onChange={(e) => setParam('chordType', e.target.value as ChordGenParams['chordType'])}
        >
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="diminished">Diminished</option>
          <option value="augmented">Augmented</option>
          <option value="sus2">Sus2</option>
          <option value="sus4">Sus4</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-white/50 w-12">Inversion</label>
        <select
          className="bg-[#1a1a2e] text-[10px] text-white/80 border border-white/10 rounded px-1 py-0.5 flex-1"
          value={params.inversion}
          onChange={(e) => setParam('inversion', parseInt(e.target.value))}
        >
          <option value={0}>Root</option>
          <option value={1}>1st</option>
          <option value={2}>2nd</option>
        </select>
      </div>
    </div>
  );
}

// ─── MIDI Effect Device ──────────────────────────────────────────────────────

function MidiEffectDevice({
  effect, track, index, onDragStart, onDragOver, isDragOver,
}: {
  effect: MidiEffect;
  track: Track;
  index: number;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  isDragOver: boolean;
}) {
  const toggleMidiEffect = useProjectStore((s) => (s as MidiEffectStoreActions).toggleMidiEffect);
  const removeMidiEffect = useProjectStore((s) => s.removeMidiEffect);
  const [collapsed, setCollapsed] = useState(false);
  const color = MIDI_EFFECT_COLORS[effect.type];

  const displayName: Record<MidiEffectType, string> = {
    'scale-lock': 'Scale Lock',
    'arpeggiator': 'Arpeggiator',
    'chord-gen': 'Chord Gen',
  };

  return (
    <div
      className={`flex flex-col min-w-[170px] max-w-[200px] rounded-lg border shrink-0 transition-all ${
        isDragOver ? 'border-l-2 border-l-violet-500' : 'border-white/10'
      } ${!effect.enabled ? 'opacity-40' : ''}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      onMouseOver={() => onDragOver(index)}
      data-midi-effect-id={effect.id}
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

        <span className="text-[10px] font-medium flex-1 truncate" style={{ color }}>
          {displayName[effect.type]}
        </span>

        {/* Enable/bypass toggle */}
        <button
          className={`h-4 w-4 flex items-center justify-center ${effect.enabled ? 'text-green-400' : 'text-white/20'}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleMidiEffect(track.id, effect.id);
          }}
        >
          <Power className="h-3 w-3" />
        </button>

        {/* Delete */}
        <button
          className="h-4 w-4 flex items-center justify-center text-white/20 hover:text-red-400"
          onClick={(e) => { e.stopPropagation(); removeMidiEffect(track.id, effect.id); }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="overflow-y-auto max-h-[220px]">
          {effect.type === 'scale-lock' && <ScaleLockCard effect={effect as MidiEffect & { type: 'scale-lock' }} trackId={track.id} />}
          {effect.type === 'arpeggiator' && <ArpeggiatorCard effect={effect as MidiEffect & { type: 'arpeggiator' }} trackId={track.id} />}
          {effect.type === 'chord-gen' && <ChordGenCard effect={effect as MidiEffect & { type: 'chord-gen' }} trackId={track.id} />}
        </div>
      )}
    </div>
  );
}

// ─── Add MIDI Effect Button ──────────────────────────────────────────────────

function AddMidiEffectButton({ trackId }: { trackId: string }) {
  const addMidiEffect = useProjectStore((s) => s.addMidiEffect);
  const [open, setOpen] = useState(false);

  const effectTypes: { type: MidiEffectType; label: string; desc: string }[] = [
    { type: 'scale-lock', label: 'Scale Lock', desc: 'Constrain to scale' },
    { type: 'arpeggiator', label: 'Arpeggiator', desc: 'Rhythmic patterns' },
    { type: 'chord-gen', label: 'Chord Generator', desc: 'Auto-voicings' },
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
        <div className="absolute left-0 top-full mt-1 bg-[#1a1a36] border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
          {effectTypes.map(({ type, label, desc }) => (
            <button
              key={type}
              className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 flex flex-col"
              onClick={() => { addMidiEffect(trackId, type); setOpen(false); }}
            >
              <span className="font-medium" style={{ color: MIDI_EFFECT_COLORS[type] }}>{label}</span>
              <span className="text-[9px] text-white/40">{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main MidiEffectChain Component ──────────────────────────────────────────

export function MidiEffectChain() {
  const project = useProjectStore((s) => s.project);
  const reorderMidiEffect = useProjectStore((s) => (s as MidiEffectStoreActions).reorderMidiEffect);
  const openTrackId = useUIStore((s) => s.openEffectChainTrackId);
  const effectChainHeight = useUIStore((s) => s.effectChainHeight);
  const setEffectChainHeight = useUIStore((s) => s.setEffectChainHeight);
  const setOpenEffectChainTrackId = useUIStore((s) => s.setOpenEffectChainTrackId);

  const track = project?.tracks.find((t) => t.id === openTrackId) ?? null;

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const dragOverIdxRef = useRef<number | null>(null);

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
        reorderMidiEffect(track.id, fromIdx, toIdx);
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

  const effects = track.midiEffects ?? [];

  return (
    <div
      className="border-t border-[#1a1a1a] bg-[#0e0e24] flex flex-col select-none shrink-0"
      style={{ height: effectChainHeight }}
      data-testid="midi-effect-chain"
    >
      {/* Resize handle */}
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-emerald-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0e0e24] border-b border-white/5 shrink-0">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: track.color }} />
        <span className="text-[11px] text-white/70 font-medium">{track.displayName}</span>
        <span className="text-[9px] text-emerald-400/60 ml-1 font-medium">MIDI FX</span>
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

      {/* MIDI Effect devices row */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-start gap-2 p-3">
        {effects.map((effect, idx) => (
          <MidiEffectDevice
            key={effect.id}
            effect={effect}
            track={track}
            index={idx}
            onDragStart={handleDragStart}
            onDragOver={(i) => { setDragOverIdx(i); dragOverIdxRef.current = i; }}
            isDragOver={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
          />
        ))}
        <AddMidiEffectButton trackId={track.id} />
      </div>
    </div>
  );
}

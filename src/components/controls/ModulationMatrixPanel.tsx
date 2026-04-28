/**
 * ModulationMatrixPanel — UI for configuring modulation routing slots.
 *
 * Displays source → destination → amount rows for each modulation slot,
 * with LFO controls, macro knobs, and bipolar toggles.
 * Follows the existing SmartControlsPanel design language.
 */

import { useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { Knob } from '../ui/Knob';
import type {
  Track,
  ModulationSettings,
  ModulationSlot,
  ModulationSource,
  ModulationDestination,
  ModulationLfo,
  InstrumentWaveform,
} from '../../types/project';
import { DEFAULT_MODULATION_SETTINGS } from '../../types/project';

// ─── Constants ──────────────────────────────────────────────────────────

const MAX_SLOTS = 8;

const SOURCE_OPTIONS: { value: ModulationSource; label: string; group: string; supported: boolean }[] = [
  { value: 'lfo1', label: 'LFO 1', group: 'LFO', supported: true },
  { value: 'lfo2', label: 'LFO 2', group: 'LFO', supported: true },
  { value: 'ampEnv', label: 'Amp Env (coming soon)', group: 'Envelope', supported: false },
  { value: 'filterEnv', label: 'Filter Env (coming soon)', group: 'Envelope', supported: false },
  { value: 'modEnv', label: 'Mod Env (coming soon)', group: 'Envelope', supported: false },
  { value: 'velocity', label: 'Velocity (coming soon)', group: 'MIDI', supported: false },
  { value: 'modWheel', label: 'Mod Wheel (coming soon)', group: 'MIDI', supported: false },
  { value: 'macro1', label: 'Macro 1', group: 'Macro', supported: true },
  { value: 'macro2', label: 'Macro 2', group: 'Macro', supported: true },
  { value: 'macro3', label: 'Macro 3', group: 'Macro', supported: true },
  { value: 'macro4', label: 'Macro 4', group: 'Macro', supported: true },
];

const DESTINATION_OPTIONS: { value: ModulationDestination; label: string; supported: boolean }[] = [
  { value: 'pitch', label: 'Pitch', supported: true },
  { value: 'filterCutoff', label: 'Filter Cutoff', supported: true },
  { value: 'filterResonance', label: 'Filter Resonance', supported: true },
  { value: 'amp', label: 'Amplitude', supported: true },
  { value: 'pan', label: 'Pan', supported: true },
  { value: 'oscLevel', label: 'Osc Level (coming soon)', supported: false },
  { value: 'lfo1Rate', label: 'LFO 1 Rate (coming soon)', supported: false },
  { value: 'lfo2Rate', label: 'LFO 2 Rate (coming soon)', supported: false },
  { value: 'fmIndex', label: 'FM Index (coming soon)', supported: false },
  { value: 'wtPosition', label: 'WT Position (coming soon)', supported: false },
];

const LFO_WAVEFORMS: { value: InstrumentWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'square', label: 'Sq' },
  { value: 'sawtooth', label: 'Saw' },
];

// ─── Sub-Components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium mb-1">
      {children}
    </div>
  );
}

function LfoSection({
  lfo,
  label,
  onChange,
}: {
  lfo: ModulationLfo;
  label: string;
  onChange: (updates: Partial<ModulationLfo>) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-zinc-400 uppercase tracking-wider w-8 shrink-0">{label}</span>
      <select
        value={lfo.waveform}
        onChange={(e) => onChange({ waveform: e.target.value as InstrumentWaveform })}
        className="rounded bg-[var(--daw-surface-2,#2a2a2a)] border border-[var(--daw-border,#444)] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-[var(--daw-accent,#4A5FFF)]"
        aria-label={`${label} waveform`}
        data-testid={`${label.toLowerCase().replace(' ', '-')}-waveform`}
      >
        {LFO_WAVEFORMS.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
      </select>
      <Knob
        value={lfo.rateHz}
        min={0.01}
        max={50}
        defaultValue={1}
        step={0.01}
        onChange={(v) => onChange({ rateHz: v })}
        label="Rate"
        unit="Hz"
        variant="sm"
        formatValue={(v) => v < 1 ? `${(1000 / v).toFixed(0)}ms` : `${v.toFixed(1)}Hz`}
      />
      <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={lfo.retrigger}
          onChange={(e) => onChange({ retrigger: e.target.checked })}
          className="accent-[var(--daw-accent,#4A5FFF)] w-3 h-3"
          aria-label={`${label} retrigger`}
        />
        Retrig
      </label>
    </div>
  );
}

function SlotRow({
  slot,
  index,
  onUpdate,
  onRemove,
}: {
  slot: ModulationSlot;
  index: number;
  onUpdate: (index: number, updates: Partial<ModulationSlot>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 py-1 group"
      data-testid={`mod-slot-${index}`}
    >
      <span className="text-[10px] text-zinc-500 font-mono w-4 shrink-0 text-right">
        {index + 1}
      </span>
      <select
        value={slot.source}
        onChange={(e) => onUpdate(index, { source: e.target.value as ModulationSource })}
        className="flex-1 min-w-0 rounded bg-[var(--daw-surface-2,#2a2a2a)] border border-[var(--daw-border,#444)] px-1.5 py-1 text-[11px] text-zinc-200 outline-none focus:border-[var(--daw-accent,#4A5FFF)]"
        aria-label={`Slot ${index + 1} source`}
        data-testid={`mod-slot-${index}-source`}
      >
        {SOURCE_OPTIONS.map((s) => (
          <option key={s.value} value={s.value} disabled={!s.supported}>{s.label}</option>
        ))}
      </select>
      <span className="text-[10px] text-zinc-500">→</span>
      <select
        value={slot.destination}
        onChange={(e) => onUpdate(index, { destination: e.target.value as ModulationDestination })}
        className="flex-1 min-w-0 rounded bg-[var(--daw-surface-2,#2a2a2a)] border border-[var(--daw-border,#444)] px-1.5 py-1 text-[11px] text-zinc-200 outline-none focus:border-[var(--daw-accent,#4A5FFF)]"
        aria-label={`Slot ${index + 1} destination`}
        data-testid={`mod-slot-${index}-dest`}
      >
        {DESTINATION_OPTIONS.map((d) => (
          <option key={d.value} value={d.value} disabled={!d.supported}>{d.label}</option>
        ))}
      </select>
      <div className="flex items-center gap-1 w-[120px] shrink-0">
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Math.round(slot.amount * 100)}
          onChange={(e) => onUpdate(index, { amount: Number(e.target.value) / 100 })}
          className="flex-1 h-1 accent-[var(--daw-accent,#4A5FFF)]"
          aria-label={`Slot ${index + 1} amount`}
          data-testid={`mod-slot-${index}-amount`}
        />
        <span className="text-[10px] text-zinc-300 font-mono w-10 text-right tabular-nums">
          {slot.amount >= 0 ? '+' : ''}{Math.round(slot.amount * 100)}%
        </span>
      </div>
      <button
        onClick={() => onUpdate(index, { bipolar: !slot.bipolar })}
        className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
          slot.bipolar
            ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
            : 'bg-[var(--daw-surface-2,#2a2a2a)] text-zinc-500 border border-[var(--daw-border,#444)]'
        }`}
        title={slot.bipolar ? 'Bipolar: -1 to +1' : 'Unipolar: 0 to +1'}
        aria-label={`Slot ${index + 1} ${slot.bipolar ? 'bipolar' : 'unipolar'}`}
        data-testid={`mod-slot-${index}-bipolar`}
      >
        {slot.bipolar ? '±' : '+'}
      </button>
      <button
        onClick={() => onRemove(index)}
        className="text-zinc-600 hover:text-red-400 text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={`Remove slot ${index + 1}`}
        data-testid={`mod-slot-${index}-remove`}
      >
        ×
      </button>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────

interface ModulationMatrixPanelProps {
  trackId: string;
}

export function ModulationMatrixPanel({ trackId }: ModulationMatrixPanelProps) {
  const track = useProjectStore((s) =>
    s.project?.tracks.find((t) => t.id === trackId),
  );
  const updateModulation = useProjectStore((s) => s.updateModulation);

  const modSettings: ModulationSettings = useMemo(() => {
    if (track?.instrument?.kind !== 'subtractive') return DEFAULT_MODULATION_SETTINGS;
    return track.instrument.settings.modulation ?? DEFAULT_MODULATION_SETTINGS;
  }, [track]);

  const handleLfo1Change = useCallback(
    (updates: Partial<ModulationLfo>) => {
      updateModulation(trackId, { lfo1: { ...modSettings.lfo1, ...updates } });
    },
    [trackId, modSettings.lfo1, updateModulation],
  );

  const handleLfo2Change = useCallback(
    (updates: Partial<ModulationLfo>) => {
      updateModulation(trackId, { lfo2: { ...modSettings.lfo2, ...updates } });
    },
    [trackId, modSettings.lfo2, updateModulation],
  );

  const handleSlotUpdate = useCallback(
    (index: number, updates: Partial<ModulationSlot>) => {
      const newSlots = [...modSettings.slots];
      newSlots[index] = { ...newSlots[index], ...updates };
      updateModulation(trackId, { slots: newSlots });
    },
    [trackId, modSettings.slots, updateModulation],
  );

  const handleSlotRemove = useCallback(
    (index: number) => {
      const newSlots = modSettings.slots.filter((_, i) => i !== index);
      updateModulation(trackId, { slots: newSlots });
    },
    [trackId, modSettings.slots, updateModulation],
  );

  const handleAddSlot = useCallback(() => {
    if (modSettings.slots.length >= MAX_SLOTS) return;
    const newSlot: ModulationSlot = {
      source: 'lfo1',
      destination: 'filterCutoff',
      amount: 0.5,
      bipolar: true,
    };
    updateModulation(trackId, { slots: [...modSettings.slots, newSlot] });
  }, [trackId, modSettings.slots, updateModulation]);

  const handleMacroChange = useCallback(
    (macroIndex: number, value: number) => {
      const newMacros = [...modSettings.macros] as [number, number, number, number];
      newMacros[macroIndex] = value;
      updateModulation(trackId, { macros: newMacros });
    },
    [trackId, modSettings.macros, updateModulation],
  );

  // Don't render for non-subtractive instruments
  if (!track || track.instrument?.kind !== 'subtractive') {
    return (
      <div className="px-4 py-3 text-[11px] text-zinc-500 italic">
        Modulation matrix is available for subtractive instruments only.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-4 py-3"
      data-testid="modulation-matrix-panel"
    >
      {/* LFO Section */}
      <div>
        <SectionLabel>LFO Sources</SectionLabel>
        <div className="flex flex-col gap-2 mt-1">
          <LfoSection lfo={modSettings.lfo1} label="LFO 1" onChange={handleLfo1Change} />
          <LfoSection lfo={modSettings.lfo2} label="LFO 2" onChange={handleLfo2Change} />
        </div>
      </div>

      {/* Macro Knobs */}
      <div>
        <SectionLabel>Macro Knobs</SectionLabel>
        <div className="flex items-center gap-4 mt-1">
          {modSettings.macros.map((value, i) => (
            <Knob
              key={i}
              value={value}
              min={0}
              max={1}
              defaultValue={0}
              step={0.01}
              onChange={(v) => handleMacroChange(i, v)}
              label={`M${i + 1}`}
              variant="sm"
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          ))}
        </div>
      </div>

      {/* Routing Slots */}
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Routing Slots</SectionLabel>
          <span className="text-[10px] text-zinc-500">
            {modSettings.slots.length}/{MAX_SLOTS}
          </span>
        </div>

        {modSettings.slots.length === 0 ? (
          <div className="text-[11px] text-zinc-500 italic py-2">
            No modulation routes. Click + to add one.
          </div>
        ) : (
          <div className="flex flex-col mt-1">
            {/* Header row */}
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--daw-border,#333)]">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider w-4">#</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex-1">Source</span>
              <span className="text-[9px] text-zinc-500 w-3" />
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex-1">Dest</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider w-[120px]">Amount</span>
              <span className="text-[9px] text-zinc-500 w-6" />
              <span className="w-4" />
            </div>
            {modSettings.slots.map((slot, i) => (
              <SlotRow
                key={i}
                slot={slot}
                index={i}
                onUpdate={handleSlotUpdate}
                onRemove={handleSlotRemove}
              />
            ))}
          </div>
        )}

        <button
          onClick={handleAddSlot}
          disabled={modSettings.slots.length >= MAX_SLOTS}
          className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-[var(--daw-border,#444)] px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-[var(--daw-accent,#4A5FFF)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Add modulation slot"
          data-testid="mod-add-slot"
        >
          <span className="text-sm leading-none">+</span>
          Add Route
        </button>
      </div>
    </div>
  );
}

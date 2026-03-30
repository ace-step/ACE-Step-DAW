import { useCallback } from 'react';
import type {
  ModulationSettings,
  ModulationSlot,
  ModulationSource,
  ModulationDestination,
} from '../../types/project';
import { DEFAULT_MODULATION_SETTINGS } from '../../types/project';

const SOURCE_LABELS: Record<ModulationSource, string> = {
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  ampEnv: 'Amp Env',
  filterEnv: 'Filter Env',
  modEnv: 'Mod Env',
  velocity: 'Velocity',
  modWheel: 'Mod Wheel',
  macro1: 'Macro 1',
  macro2: 'Macro 2',
  macro3: 'Macro 3',
  macro4: 'Macro 4',
};

const DESTINATION_LABELS: Record<ModulationDestination, string> = {
  pitch: 'Pitch',
  filterCutoff: 'Filter Cutoff',
  filterResonance: 'Filter Res',
  amp: 'Amplitude',
  pan: 'Pan',
  oscLevel: 'Osc Level',
  lfo1Rate: 'LFO1 Rate',
  lfo2Rate: 'LFO2 Rate',
  fmIndex: 'FM Index',
  wtPosition: 'WT Position',
};

// Supported sources for initial release (LFOs + macros)
const AVAILABLE_SOURCES: ModulationSource[] = [
  'lfo1', 'lfo2', 'macro1', 'macro2', 'macro3', 'macro4',
];

const AVAILABLE_DESTINATIONS: ModulationDestination[] = [
  'pitch', 'filterCutoff', 'filterResonance', 'amp', 'pan', 'oscLevel',
];

interface ModulationMatrixProps {
  modulation: ModulationSettings | undefined;
  onChange: (modulation: Partial<ModulationSettings>) => void;
}

export function ModulationMatrix({ modulation, onChange }: ModulationMatrixProps) {
  const mod = modulation ?? DEFAULT_MODULATION_SETTINGS;
  const slots = mod.slots;

  const addSlot = useCallback(() => {
    if (slots.length >= 8) return;
    const newSlot: ModulationSlot = {
      source: 'lfo1',
      destination: 'filterCutoff',
      amount: 0.5,
      bipolar: true,
    };
    onChange({ slots: [...slots, newSlot] });
  }, [slots, onChange]);

  const removeSlot = useCallback((index: number) => {
    onChange({ slots: slots.filter((_, i) => i !== index) });
  }, [slots, onChange]);

  const updateSlot = useCallback((index: number, updates: Partial<ModulationSlot>) => {
    onChange({
      slots: slots.map((s, i) => i === index ? { ...s, ...updates } : s),
    });
  }, [slots, onChange]);

  const updateMacro = useCallback((index: 0 | 1 | 2 | 3, value: number) => {
    const macros = [...mod.macros] as [number, number, number, number];
    macros[index] = value;
    onChange({ macros });
  }, [mod.macros, onChange]);

  return (
    <div className="bg-[#111] border border-[#333] rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
          Modulation Matrix
        </span>
        {slots.length < 8 && (
          <button
            onClick={addSlot}
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            + Add Slot
          </button>
        )}
      </div>

      {/* LFO Controls */}
      <div className="flex gap-3">
        {([0, 1] as const).map((lfoIdx) => {
          const lfo = lfoIdx === 0 ? mod.lfo1 : mod.lfo2;
          return (
            <div key={lfoIdx} className="flex-1 bg-[#0a0a0a] rounded p-2 space-y-1">
              <span className="text-[9px] text-zinc-500 font-medium">LFO {lfoIdx + 1}</span>
              <div className="flex gap-2 items-center">
                <select
                  value={lfo.waveform}
                  onChange={(e) => {
                    const key = lfoIdx === 0 ? 'lfo1' : 'lfo2';
                    onChange({ [key]: { ...lfo, waveform: e.target.value } });
                  }}
                  className="bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 text-[10px] text-zinc-300 w-16"
                >
                  <option value="sine">Sine</option>
                  <option value="triangle">Tri</option>
                  <option value="square">Sqr</option>
                  <option value="sawtooth">Saw</option>
                </select>
                <label className="text-[9px] text-zinc-500">Rate</label>
                <input
                  type="range"
                  min={0.01}
                  max={20}
                  step={0.01}
                  value={lfo.rateHz}
                  onChange={(e) => {
                    const key = lfoIdx === 0 ? 'lfo1' : 'lfo2';
                    onChange({ [key]: { ...lfo, rateHz: parseFloat(e.target.value) } });
                  }}
                  className="flex-1 h-1 accent-blue-500"
                />
                <span className="text-[9px] text-zinc-400 w-10 text-right">
                  {lfo.rateHz.toFixed(1)}Hz
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modulation Slots */}
      {slots.length === 0 ? (
        <div className="text-[10px] text-zinc-600 text-center py-2">
          No modulation slots. Click + Add Slot to create a routing.
        </div>
      ) : (
        <div className="space-y-1">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2 bg-[#0a0a0a] rounded px-2 py-1.5">
              <select
                value={slot.source}
                onChange={(e) => updateSlot(i, { source: e.target.value as ModulationSource })}
                className="bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 text-[10px] text-zinc-300 w-20"
              >
                {AVAILABLE_SOURCES.map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
              <span className="text-[9px] text-zinc-500">&rarr;</span>
              <select
                value={slot.destination}
                onChange={(e) => updateSlot(i, { destination: e.target.value as ModulationDestination })}
                className="bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 text-[10px] text-zinc-300 w-24"
              >
                {AVAILABLE_DESTINATIONS.map((d) => (
                  <option key={d} value={d}>{DESTINATION_LABELS[d]}</option>
                ))}
              </select>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={slot.amount}
                onChange={(e) => updateSlot(i, { amount: parseFloat(e.target.value) })}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-[9px] text-zinc-400 w-8 text-right">
                {(slot.amount * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => removeSlot(i)}
                className="text-zinc-500 hover:text-red-400 text-[10px]"
                aria-label={`Remove modulation slot ${i + 1}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Macro Knobs */}
      <div className="flex gap-2">
        {([0, 1, 2, 3] as const).map((idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[8px] text-zinc-500">M{idx + 1}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mod.macros[idx]}
              onChange={(e) => updateMacro(idx, parseFloat(e.target.value))}
              className="w-full h-1 accent-purple-500"
              style={{ writingMode: 'vertical-lr' as never, height: '40px', width: '16px' }}
            />
            <span className="text-[8px] text-zinc-400">{(mod.macros[idx] * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

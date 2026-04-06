import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type {
  PhysicalModelingSettings,
  PhysicalExciterType,
  PhysicalModelingPresetName,
} from '../../types/project';
import { PHYSICAL_MODELING_PRESETS } from '../../engine/PhysicalModelingEngine';

const EXCITER_OPTIONS: { value: PhysicalExciterType; label: string; description: string }[] = [
  { value: 'pluck', label: 'Pluck', description: 'Noise burst — guitar, harp' },
  { value: 'bow', label: 'Bow', description: 'Continuous friction — bowed strings' },
  { value: 'hammer', label: 'Hammer', description: 'Percussive strike — marimba, kalimba' },
];

const PRESET_OPTIONS: { value: PhysicalModelingPresetName; label: string }[] = [
  { value: 'acousticGuitar', label: 'Acoustic Guitar' },
  { value: 'harp', label: 'Harp' },
  { value: 'kalimba', label: 'Kalimba' },
  { value: 'marimba', label: 'Marimba' },
  { value: 'steelDrum', label: 'Steel Drum' },
  { value: 'bowedString', label: 'Bowed String' },
  { value: 'custom', label: 'Custom' },
];

interface PhysicalModelingEditorProps {
  trackId: string;
}

function KnobSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</label>
        <span className="text-[10px] text-zinc-500 tabular-nums">
          {value.toFixed(step < 1 ? 2 : 0)}{unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-daw-accent cursor-pointer"
        aria-label={label}
        data-testid={testId}
      />
    </div>
  );
}

export function PhysicalModelingEditor({ trackId }: PhysicalModelingEditorProps) {
  const track = useProjectStore((s) => s.project?.tracks.find((t) => t.id === trackId));
  const setTrackInstrument = useProjectStore((s) => s.setTrackInstrument);

  const instrument = track?.instrument;
  const isPhysical = instrument?.kind === 'physical';
  const settings = isPhysical ? instrument.settings : null;

  const updateSettings = useCallback(
    (updates: Partial<PhysicalModelingSettings>) => {
      if (!instrument || instrument.kind !== 'physical') return;
      setTrackInstrument(trackId, {
        ...instrument,
        settings: { ...instrument.settings, ...updates, presetName: 'custom' as const },
      });
    },
    [trackId, instrument, setTrackInstrument],
  );

  const handlePresetChange = useCallback(
    (presetName: PhysicalModelingPresetName) => {
      if (presetName === 'custom') {
        updateSettings({ presetName: 'custom' });
        return;
      }
      const preset = PHYSICAL_MODELING_PRESETS[presetName];
      if (!instrument || instrument.kind !== 'physical') return;
      setTrackInstrument(trackId, {
        ...instrument,
        settings: { ...preset },
      });
    },
    [trackId, instrument, setTrackInstrument, updateSettings],
  );

  const handleExciterChange = useCallback(
    (exciter: PhysicalExciterType) => updateSettings({ exciter }),
    [updateSettings],
  );

  if (!isPhysical || !settings) return null;

  return (
    <div
      className="border-t border-[#333] bg-[#1a1a1a] px-4 py-3"
      data-testid="physical-modeling-editor"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Physical Modeling</div>
          <div className="text-xs font-medium text-zinc-200">Karplus-Strong Synthesis</div>
        </div>
        <select
          value={settings.presetName}
          onChange={(e) => handlePresetChange(e.target.value as PhysicalModelingPresetName)}
          className="rounded bg-[#2a2a2a] border border-[#444] px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
          aria-label="Physical modeling preset"
          data-testid="physical-preset-select"
        >
          {PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Exciter Type */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">Exciter</div>
        <div className="flex gap-1.5">
          {EXCITER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleExciterChange(opt.value)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                settings.exciter === opt.value
                  ? 'bg-daw-accent/20 text-daw-accent border border-daw-accent/50'
                  : 'bg-[#2a2a2a] text-zinc-400 hover:bg-[#343434] border border-transparent'
              }`}
              title={opt.description}
              data-testid={`exciter-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* String Parameters */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
        <KnobSlider
          label="Damping"
          value={settings.damping}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSettings({ damping: v })}
          testId="physical-damping"
        />
        <KnobSlider
          label="Brightness"
          value={settings.brightness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSettings({ brightness: v })}
          testId="physical-brightness"
        />
        <KnobSlider
          label="Pluck Position"
          value={settings.pluckPosition}
          min={0.05}
          max={0.95}
          step={0.01}
          onChange={(v) => updateSettings({ pluckPosition: v })}
          testId="physical-pluck-position"
        />
        <KnobSlider
          label="Body Size"
          value={settings.bodySize}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSettings({ bodySize: v })}
          testId="physical-body-size"
        />
        <KnobSlider
          label="String Tension"
          value={settings.stringTension}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSettings({ stringTension: v })}
          testId="physical-tension"
        />
        <KnobSlider
          label="Gain"
          value={settings.gain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSettings({ gain: v })}
          testId="physical-gain"
        />
      </div>

      {/* Envelope */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <KnobSlider
          label="Attack"
          value={settings.attack}
          min={0.001}
          max={0.5}
          step={0.001}
          unit="s"
          onChange={(v) => updateSettings({ attack: v })}
          testId="physical-attack"
        />
        <KnobSlider
          label="Release"
          value={settings.release}
          min={0.01}
          max={2}
          step={0.01}
          unit="s"
          onChange={(v) => updateSettings({ release: v })}
          testId="physical-release"
        />
      </div>
    </div>
  );
}

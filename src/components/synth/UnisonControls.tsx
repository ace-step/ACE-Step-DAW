import { useCallback } from 'react';
import type { UnisonSettings } from '../../types/project';

interface UnisonControlsProps {
  settings: UnisonSettings;
  onChange: (updates: Partial<UnisonSettings>) => void;
}

function KnobSlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <label className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 h-1 accent-blue-500 cursor-pointer"
        aria-label={label}
      />
      <span className="text-[10px] text-zinc-300 font-mono">{displayValue}</span>
    </div>
  );
}

export function UnisonControls({ settings, onChange }: UnisonControlsProps) {
  const onVoicesChange = useCallback(
    (v: number) => onChange({ voices: Math.round(v) }),
    [onChange],
  );
  const onDetuneChange = useCallback(
    (v: number) => onChange({ detune: v }),
    [onChange],
  );
  const onSpreadChange = useCallback(
    (v: number) => onChange({ spread: v }),
    [onChange],
  );

  return (
    <div data-testid="unison-controls" className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
        Unison
      </div>
      <div className="flex gap-4 items-start">
        <KnobSlider
          label="Voices"
          value={settings.voices}
          min={1}
          max={8}
          step={1}
          displayValue={String(settings.voices)}
          onChange={onVoicesChange}
        />
        <KnobSlider
          label="Detune"
          value={settings.detune}
          min={0}
          max={100}
          step={1}
          displayValue={`${settings.detune} ct`}
          onChange={onDetuneChange}
        />
        <KnobSlider
          label="Spread"
          value={settings.spread}
          min={0}
          max={1}
          step={0.01}
          displayValue={`${Math.round(settings.spread * 100)}%`}
          onChange={onSpreadChange}
        />
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { FilterEnvelope } from '../../types/project';
import { Knob } from '../ui/Knob';
import { drawEnvelopeCurve } from './drawEnvelopeCurve';
import { DEFAULT_FILTER_ENVELOPE } from './filterEnvelopeDefaults';

interface FilterEnvelopeEditorProps {
  envelope: FilterEnvelope;
  onChange: (updates: Partial<FilterEnvelope>) => void;
}

export { DEFAULT_FILTER_ENVELOPE };

export function FilterEnvelopeEditor({ envelope, onChange }: FilterEnvelopeEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    drawEnvelopeCurve(ctx, rect.width, rect.height, envelope, '#FF954A', 'rgba(255, 149, 74, 0.15)');
  }, [envelope]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Filter Envelope</div>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Filter envelope editor"
        className="w-full h-20 rounded bg-[#1a1a1a] border border-[#333]"
      />
      <div className="flex items-center justify-around gap-1">
        <Knob
          value={envelope.attack}
          min={0.001}
          max={5}
          defaultValue={DEFAULT_FILTER_ENVELOPE.attack}
          onChange={(v) => onChange({ attack: v })}
          label="ATK"
          unit="s"
          size={28}
        />
        <Knob
          value={envelope.decay}
          min={0.001}
          max={5}
          defaultValue={DEFAULT_FILTER_ENVELOPE.decay}
          onChange={(v) => onChange({ decay: v })}
          label="DEC"
          unit="s"
          size={28}
        />
        <Knob
          value={envelope.sustain}
          min={0}
          max={1}
          defaultValue={DEFAULT_FILTER_ENVELOPE.sustain}
          onChange={(v) => onChange({ sustain: v })}
          label="SUS"
          size={28}
        />
        <Knob
          value={envelope.release}
          min={0.001}
          max={10}
          defaultValue={DEFAULT_FILTER_ENVELOPE.release}
          onChange={(v) => onChange({ release: v })}
          label="REL"
          unit="s"
          size={28}
        />
        <Knob
          value={envelope.baseFrequency}
          min={20}
          max={20000}
          defaultValue={DEFAULT_FILTER_ENVELOPE.baseFrequency}
          onChange={(v) => onChange({ baseFrequency: v })}
          label="FREQ"
          unit="Hz"
          size={28}
        />
        <Knob
          value={envelope.octaves}
          min={0}
          max={8}
          defaultValue={DEFAULT_FILTER_ENVELOPE.octaves}
          onChange={(v) => onChange({ octaves: v })}
          label="OCT"
          size={28}
        />
      </div>
    </div>
  );
}

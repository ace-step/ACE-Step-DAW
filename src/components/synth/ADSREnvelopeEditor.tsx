import { useEffect, useRef } from 'react';
import type { SynthEnvelope } from '../../types/project';
import { Knob } from '../ui/Knob';
import { drawEnvelopeCurve } from './drawEnvelopeCurve';

interface ADSREnvelopeEditorProps {
  envelope: SynthEnvelope;
  onChange: (updates: Partial<SynthEnvelope>) => void;
}

export function ADSREnvelopeEditor({ envelope, onChange }: ADSREnvelopeEditorProps) {
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
    drawEnvelopeCurve(ctx, rect.width, rect.height, envelope, '#4A5FFF', 'rgba(74, 95, 255, 0.15)');
  }, [envelope]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Envelope</div>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="ADSR envelope editor"
        className="w-full h-20 rounded bg-[#1a1a1a] border border-[#333]"
      />
      <div className="flex items-center justify-around gap-1">
        <Knob
          value={envelope.attack}
          min={0.001}
          max={5}
          defaultValue={0.005}
          onChange={(v) => onChange({ attack: v })}
          label="ATK"
          unit="s"
          size={28}
        />
        <Knob
          value={envelope.decay}
          min={0.001}
          max={5}
          defaultValue={0.1}
          onChange={(v) => onChange({ decay: v })}
          label="DEC"
          unit="s"
          size={28}
        />
        <Knob
          value={envelope.sustain}
          min={0}
          max={1}
          defaultValue={0.7}
          onChange={(v) => onChange({ sustain: v })}
          label="SUS"
          size={28}
        />
        <Knob
          value={envelope.release}
          min={0.001}
          max={10}
          defaultValue={0.3}
          onChange={(v) => onChange({ release: v })}
          label="REL"
          unit="s"
          size={28}
        />
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { SynthEnvelope } from '../../types/project';
import { Knob } from '../ui/Knob';

interface ADSREnvelopeEditorProps {
  envelope: SynthEnvelope;
  onChange: (updates: Partial<SynthEnvelope>) => void;
}

/**
 * Draw the ADSR envelope curve on a canvas.
 * X-axis: time progression (attack -> decay -> sustain hold -> release).
 * Y-axis: amplitude (0 at bottom, 1 at top).
 */
function drawEnvelope(ctx: CanvasRenderingContext2D, w: number, h: number, env: SynthEnvelope) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  const pad = 4;
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  // Normalize time segments
  const totalTime = env.attack + env.decay + 0.3 + env.release; // 0.3s sustain hold segment
  const ax = pad + (env.attack / totalTime) * iw;
  const dx = ax + (env.decay / totalTime) * iw;
  const sx = dx + (0.3 / totalTime) * iw;
  const rx = sx + (env.release / totalTime) * iw;

  const bottom = pad + ih;
  const top = pad;
  const sustainY = pad + ih * (1 - env.sustain);

  // Background grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (ih * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + iw, y);
    ctx.stroke();
  }

  // Envelope curve
  ctx.beginPath();
  ctx.moveTo(pad, bottom);
  // Attack: rise to peak
  ctx.lineTo(ax, top);
  // Decay: fall to sustain
  ctx.lineTo(dx, sustainY);
  // Sustain: hold
  ctx.lineTo(sx, sustainY);
  // Release: fall to zero
  ctx.lineTo(rx, bottom);

  // Fill under curve
  ctx.lineTo(pad, bottom);
  ctx.fillStyle = 'rgba(74, 95, 255, 0.15)';
  ctx.fill();

  // Stroke the curve
  ctx.beginPath();
  ctx.moveTo(pad, bottom);
  ctx.lineTo(ax, top);
  ctx.lineTo(dx, sustainY);
  ctx.lineTo(sx, sustainY);
  ctx.lineTo(rx, bottom);
  ctx.strokeStyle = '#4A5FFF';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Control points
  const points = [
    { x: ax, y: top },
    { x: dx, y: sustainY },
    { x: sx, y: sustainY },
    { x: rx, y: bottom },
  ];
  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#4A5FFF';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
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
    drawEnvelope(ctx, rect.width, rect.height, envelope);
  }, [envelope]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Envelope</div>
      <canvas
        ref={canvasRef}
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

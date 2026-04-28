import { useEffect, useRef } from 'react';
import type { SynthLfo, LfoShape } from '../../types/project';
import { Knob } from '../ui/Knob';

interface LFODisplayProps {
  lfo: SynthLfo;
  onChange: (updates: Partial<SynthLfo>) => void;
}

const LFO_SHAPES: { shape: LfoShape; label: string }[] = [
  { shape: 'sine', label: 'SIN' },
  { shape: 'square', label: 'SQR' },
  { shape: 'triangle', label: 'TRI' },
  { shape: 'sawtooth', label: 'SAW' },
];

function lfoWaveform(shape: LfoShape, t: number): number {
  // t is 0..1 representing one cycle
  switch (shape) {
    case 'sine':
      return Math.sin(t * Math.PI * 2);
    case 'square':
      return t < 0.5 ? 1 : -1;
    case 'triangle':
      return t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : -4 + t * 4;
    case 'sawtooth':
      return t < 0.5 ? t * 2 : t * 2 - 2;
    default:
      return 0;
  }
}

function drawLFO(ctx: CanvasRenderingContext2D, w: number, h: number, lfo: SynthLfo) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  const pad = 4;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const midY = pad + ih / 2;

  // Background grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(pad, midY);
  ctx.lineTo(pad + iw, midY);
  ctx.stroke();

  // Draw 2 full cycles of the waveform
  const cycles = 2;
  const steps = 200;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * cycles;
    const phase = t % 1;
    const value = lfoWaveform(lfo.shape, phase) * lfo.depth;
    const x = pad + (i / steps) * iw;
    const y = midY - value * (ih / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#22C55E';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill under the curve
  ctx.lineTo(pad + iw, midY);
  ctx.lineTo(pad, midY);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
  ctx.fill();

  ctx.restore();
}

export function LFODisplay({ lfo, onChange }: LFODisplayProps) {
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
    drawLFO(ctx, rect.width, rect.height, lfo);
  }, [lfo]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">LFO</div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="LFO waveform display"
        className="w-full h-16 rounded bg-[#1a1a1a] border border-[#333]"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {LFO_SHAPES.map(({ shape, label }) => (
            <button
              key={shape}
              onClick={() => onChange({ shape })}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                lfo.shape === shape
                  ? 'bg-green-600 text-white'
                  : 'bg-[#2a2a2a] text-zinc-400 hover:bg-[#3a3a3a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Knob
            value={lfo.rate}
            min={0.01}
            max={50}
            defaultValue={1}
            onChange={(v) => onChange({ rate: v })}
            label="Rate"
            unit="Hz"
            size={28}
          />
          <Knob
            value={lfo.depth}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => onChange({ depth: v })}
            label="Depth"
            size={28}
          />
        </div>
      </div>
    </div>
  );
}

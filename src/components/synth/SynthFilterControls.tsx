import { useEffect, useRef } from 'react';
import type { SynthFilter, SynthFilterType } from '../../types/project';
import { Knob } from '../ui/Knob';

interface SynthFilterControlsProps {
  filter: SynthFilter;
  onChange: (updates: Partial<SynthFilter>) => void;
}

const FILTER_TYPES: { type: SynthFilterType; label: string }[] = [
  { type: 'lowpass', label: 'LP' },
  { type: 'highpass', label: 'HP' },
  { type: 'bandpass', label: 'BP' },
];

/**
 * Draw a simplified frequency response curve for the current filter settings.
 */
function drawFrequencyResponse(ctx: CanvasRenderingContext2D, w: number, h: number, filter: SynthFilter) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  const pad = 4;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const midY = pad + ih / 2;

  // Background grid lines
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (ih * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + iw, y);
    ctx.stroke();
  }

  // Frequency axis markers (log scale: 20Hz to 20kHz)
  const freqToX = (freq: number) => {
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    return pad + ((Math.log10(freq) - logMin) / (logMax - logMin)) * iw;
  };

  // Draw response curve
  ctx.beginPath();
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const logFreq = Math.log10(20) + t * (Math.log10(20000) - Math.log10(20));
    const freq = Math.pow(10, logFreq);
    const x = pad + t * iw;

    // Simplified filter response modeling
    const ratio = freq / filter.frequency;
    let gain: number;
    const resonancePeak = Math.max(0, (filter.Q - 1) / 30); // normalized resonance bump

    if (filter.type === 'lowpass') {
      gain = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
      if (ratio > 0.7 && ratio < 1.3) gain += resonancePeak * Math.exp(-Math.pow(ratio - 1, 2) * 20);
    } else if (filter.type === 'highpass') {
      gain = 1 / Math.sqrt(1 + Math.pow(1 / ratio, 4));
      if (ratio > 0.7 && ratio < 1.3) gain += resonancePeak * Math.exp(-Math.pow(ratio - 1, 2) * 20);
    } else {
      // bandpass
      gain = 1 / Math.sqrt(1 + Math.pow((ratio - 1 / ratio) * (1 / (filter.Q / 5 + 0.1)), 2));
    }

    const y = pad + ih * (1 - Math.min(1, gain));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // Fill under curve
  ctx.lineTo(pad + iw, pad + ih);
  ctx.lineTo(pad, pad + ih);
  ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
  ctx.fill();

  // Stroke curve
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const freq = Math.pow(10, Math.log10(20) + t * (Math.log10(20000) - Math.log10(20)));
    const x = pad + t * iw;
    const ratio = freq / filter.frequency;
    let gain: number;
    const resonancePeak = Math.max(0, (filter.Q - 1) / 30);

    if (filter.type === 'lowpass') {
      gain = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
      if (ratio > 0.7 && ratio < 1.3) gain += resonancePeak * Math.exp(-Math.pow(ratio - 1, 2) * 20);
    } else if (filter.type === 'highpass') {
      gain = 1 / Math.sqrt(1 + Math.pow(1 / ratio, 4));
      if (ratio > 0.7 && ratio < 1.3) gain += resonancePeak * Math.exp(-Math.pow(ratio - 1, 2) * 20);
    } else {
      gain = 1 / Math.sqrt(1 + Math.pow((ratio - 1 / ratio) * (1 / (filter.Q / 5 + 0.1)), 2));
    }

    const y = pad + ih * (1 - Math.min(1, gain));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#FF8C00';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cutoff frequency indicator line
  const cutoffX = freqToX(filter.frequency);
  ctx.beginPath();
  ctx.moveTo(cutoffX, pad);
  ctx.lineTo(cutoffX, pad + ih);
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

export function SynthFilterControls({ filter, onChange }: SynthFilterControlsProps) {
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
    drawFrequencyResponse(ctx, rect.width, rect.height, filter);
  }, [filter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Filter</div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Synth filter response curve"
        className="w-full h-20 rounded bg-[#1a1a1a] border border-[#333]"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {FILTER_TYPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => onChange({ type })}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                filter.type === type
                  ? 'bg-orange-600 text-white'
                  : 'bg-[#2a2a2a] text-zinc-400 hover:bg-[#3a3a3a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Knob
            value={filter.frequency}
            min={20}
            max={20000}
            defaultValue={1000}
            onChange={(v) => onChange({ frequency: v })}
            label="Freq"
            unit="Hz"
            size={28}
            step={1}
          />
          <Knob
            value={filter.Q}
            min={0.1}
            max={30}
            defaultValue={1}
            onChange={(v) => onChange({ Q: v })}
            label="Res"
            size={28}
          />
        </div>
      </div>
    </div>
  );
}

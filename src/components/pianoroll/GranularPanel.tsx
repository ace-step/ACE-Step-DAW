/**
 * GranularPanel — Granular synthesis parameter editor.
 *
 * Displays source waveform with grain position indicator,
 * and provides controls for all granular synthesis parameters.
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import type { GranularSettings, GrainEnvelopeShape, Track } from '../../types/project';
import { Knob } from '../ui/Knob';
import { DEFAULT_GRANULAR_SETTINGS, granularEngine } from '../../engine/GranularEngine';

interface GranularPanelProps {
  track: Track;
  onConfigChange: (config: Partial<GranularSettings>) => void;
  onClear: () => void;
  onLoadSample: () => void;
}

const ENVELOPE_SHAPES: { value: GrainEnvelopeShape; label: string }[] = [
  { value: 'hann', label: 'Hann' },
  { value: 'triangle', label: 'Tri' },
  { value: 'trapezoid', label: 'Trap' },
  { value: 'tukey', label: 'Tukey' },
];

function formatMs(v: number): string {
  return `${Math.round(v)}ms`;
}

function formatHz(v: number): string {
  return `${v.toFixed(1)}/s`;
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatSemitones(v: number): string {
  return `±${v.toFixed(1)}st`;
}

// ── Waveform Canvas ──────────────────────────────────────────────────────────

function GrainWaveform({
  audioBuffer,
  position,
  positionScatter,
  grainSize,
  freeze,
}: {
  audioBuffer: AudioBuffer | null;
  position: number;
  positionScatter: number;
  grainSize: number;
  freeze: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    if (!audioBuffer) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Drop audio file or click Load', w / 2, h / 2);
      return;
    }

    // Draw waveform
    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    ctx.strokeStyle = '#4A5FFF44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * data.length);
      let min = 0;
      let max = 0;
      for (let j = 0; j < step; j++) {
        const sample = data[idx + j] ?? 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const yMin = ((1 - max) / 2) * h;
      const yMax = ((1 - min) / 2) * h;
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();

    // Draw grain position indicator
    const posX = position * w;
    const scatterWidth = positionScatter * w;
    const grainWidth = Math.max(2, (grainSize / 1000) * (w / (audioBuffer.duration || 1)));

    // Scatter range
    ctx.fillStyle = 'rgba(74, 95, 255, 0.08)';
    ctx.fillRect(posX - scatterWidth, 0, scatterWidth * 2, h);

    // Grain position line
    ctx.strokeStyle = freeze ? '#f59e0b' : '#4A5FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, h);
    ctx.stroke();

    // Grain size indicator
    ctx.fillStyle = freeze ? 'rgba(245, 158, 11, 0.2)' : 'rgba(74, 95, 255, 0.15)';
    ctx.fillRect(posX - grainWidth / 2, 0, grainWidth, h);
  }, [audioBuffer, position, positionScatter, grainSize, freeze]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Granular synthesis waveform"
      className="w-full h-20 rounded border border-daw-border"
    />
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function GranularPanel({ track, onConfigChange, onClear, onLoadSample }: GranularPanelProps) {
  const config = track.granularConfig;
  const hasSource = !!config?.audioKey;

  // Load the audio buffer asynchronously for waveform display
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  useEffect(() => {
    if (!hasSource) {
      setAudioBuffer(null);
      return;
    }
    let cancelled = false;
    granularEngine
      .getTrackBuffer(track)
      .then((buf) => {
        if (!cancelled) setAudioBuffer(buf);
      })
      .catch(() => {
        if (!cancelled) setAudioBuffer(null);
      });
    return () => { cancelled = true; };
  }, [track.id, hasSource, config?.audioKey]);

  const handleChange = useCallback(
    (key: keyof GranularSettings, value: number | boolean | string) => {
      onConfigChange({ [key]: value });
    },
    [onConfigChange],
  );

  if (!hasSource) {
    return (
      <div className="rounded-xl border border-daw-border bg-daw-surface-2 px-4 py-6 shrink-0" data-testid="granular-panel">
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 mb-3">
            Granular Synthesis
          </div>
          <p className="text-[10px] text-zinc-500 mb-3">
            Load an audio file to use as granular source
          </p>
          <button
            onClick={onLoadSample}
            data-testid="granular-load-btn"
            className="px-3 py-1.5 rounded text-[10px] font-medium bg-daw-accent/15 text-daw-accent hover:bg-daw-accent/25 transition-colors"
          >
            Load Sample
          </button>
        </div>
      </div>
    );
  }

  const settings = config!;

  return (
    <div className="rounded-xl border border-daw-border bg-daw-surface-2 px-3 py-3 shrink-0 space-y-3" data-testid="granular-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Granular
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleChange('freeze', !settings.freeze)}
            data-testid="granular-freeze-btn"
            className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-colors ${
              settings.freeze
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                : 'bg-white/5 text-zinc-500 hover:bg-white/8'
            }`}
          >
            {settings.freeze ? 'Frozen' : 'Freeze'}
          </button>
          <button
            onClick={onLoadSample}
            data-testid="granular-load-btn"
            className="px-2 py-0.5 rounded text-[9px] font-medium bg-white/5 text-zinc-400 hover:bg-white/8 transition-colors"
          >
            Load
          </button>
          <button
            onClick={onClear}
            data-testid="granular-clear-btn"
            className="px-2 py-0.5 rounded text-[9px] font-medium bg-white/5 text-zinc-400 hover:bg-red-500/15 hover:text-red-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Waveform with grain position */}
      <GrainWaveform
        audioBuffer={audioBuffer}
        position={settings.position}
        positionScatter={settings.positionScatter}
        grainSize={settings.grainSize}
        freeze={settings.freeze}
      />

      {/* Position + Scatter Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center">
          <Knob
            value={settings.position}
            min={0}
            max={1}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.position}
            onChange={(v) => handleChange('position', v)}
            label="Position"
            step={0.001}
            variant="md"
            formatValue={formatPercent}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.positionScatter}
            min={0}
            max={1}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.positionScatter}
            onChange={(v) => handleChange('positionScatter', v)}
            label="Scatter"
            step={0.001}
            variant="md"
            formatValue={formatPercent}
          />
        </div>
      </div>

      {/* Core grain parameters */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center">
          <Knob
            value={settings.grainSize}
            min={1}
            max={500}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.grainSize}
            onChange={(v) => handleChange('grainSize', v)}
            label="Size"
            unit="ms"
            step={1}
            variant="sm"
            formatValue={formatMs}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.density}
            min={1}
            max={100}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.density}
            onChange={(v) => handleChange('density', v)}
            label="Density"
            step={1}
            variant="sm"
            formatValue={formatHz}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.pitchScatter}
            min={0}
            max={24}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.pitchScatter}
            onChange={(v) => handleChange('pitchScatter', v)}
            label="Pitch Rnd"
            step={0.1}
            variant="sm"
            formatValue={formatSemitones}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.spread}
            min={0}
            max={1}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.spread}
            onChange={(v) => handleChange('spread', v)}
            label="Spread"
            step={0.01}
            variant="sm"
            formatValue={formatPercent}
          />
        </div>
      </div>

      {/* Grain envelope */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Grain Envelope
          </span>
          <div className="flex gap-0.5">
            {ENVELOPE_SHAPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleChange('envelopeShape', value)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors ${
                  settings.envelopeShape === value
                    ? 'bg-daw-accent/20 text-daw-accent'
                    : 'bg-white/3 text-zinc-600 hover:bg-white/6 hover:text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center">
            <Knob
              value={settings.grainAttack}
              min={0}
              max={0.5}
              defaultValue={DEFAULT_GRANULAR_SETTINGS.grainAttack}
              onChange={(v) => handleChange('grainAttack', v)}
              label="Attack"
              step={0.01}
              variant="sm"
              formatValue={formatPercent}
            />
          </div>
          <div className="flex flex-col items-center">
            <Knob
              value={settings.grainRelease}
              min={0}
              max={0.5}
              defaultValue={DEFAULT_GRANULAR_SETTINGS.grainRelease}
              onChange={(v) => handleChange('grainRelease', v)}
              label="Release"
              step={0.01}
              variant="sm"
              formatValue={formatPercent}
            />
          </div>
        </div>
      </div>

      {/* Amplitude envelope + gain */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center">
          <Knob
            value={settings.attack}
            min={0.001}
            max={2}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.attack}
            onChange={(v) => handleChange('attack', v)}
            label="Amp Atk"
            unit="s"
            step={0.001}
            variant="sm"
            formatValue={(v) => `${v.toFixed(3)}s`}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.release}
            min={0.01}
            max={5}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.release}
            onChange={(v) => handleChange('release', v)}
            label="Amp Rel"
            unit="s"
            step={0.01}
            variant="sm"
            formatValue={(v) => `${v.toFixed(2)}s`}
          />
        </div>
        <div className="flex flex-col items-center">
          <Knob
            value={settings.gain}
            min={0}
            max={1}
            defaultValue={DEFAULT_GRANULAR_SETTINGS.gain}
            onChange={(v) => handleChange('gain', v)}
            label="Gain"
            step={0.01}
            variant="sm"
            formatValue={formatPercent}
          />
        </div>
      </div>

      {/* Root note */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] text-zinc-500">Root Note</span>
        <input
          type="number"
          value={settings.rootNote}
          min={0}
          max={127}
          data-testid="granular-root-note"
          onChange={(e) => handleChange('rootNote', Math.max(0, Math.min(127, parseInt(e.target.value) || 60)))}
          className="w-12 px-1.5 py-0.5 rounded font-mono text-[10px] text-zinc-200 bg-white/5 border border-daw-border text-center focus:outline-none focus:ring-1 focus:ring-daw-accent/50"
        />
      </div>
    </div>
  );
}

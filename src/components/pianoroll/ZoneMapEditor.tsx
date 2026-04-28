import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { createDefaultZone, validateZones } from '../../utils/sampleZones';
import { useSfzImport } from '../../hooks/useSfzImport';
import { midiNoteToName } from './PianoRollConstants';
import type { SampleZone, Track } from '../../types/project';

/** MIDI note range for display (C-1 to G9). */
const TOTAL_KEYS = 128;
const ZONE_COLORS = [
  'rgba(59,130,246,0.55)',  // blue
  'rgba(16,185,129,0.55)',  // green
  'rgba(245,158,11,0.55)',  // amber
  'rgba(239,68,68,0.55)',   // red
  'rgba(168,85,247,0.55)',  // purple
  'rgba(6,182,212,0.55)',   // cyan
  'rgba(236,72,153,0.55)',  // pink
  'rgba(132,204,22,0.55)',  // lime
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface ZoneMapEditorProps {
  track: Track;
  onLoadSampleForZone: (zoneId: string) => void;
}

export function ZoneMapEditor({ track, onLoadSampleForZone }: ZoneMapEditorProps) {
  const zones = track.samplerConfig?.zones ?? [];
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const addSampleZone = useProjectStore((s) => s.addSampleZone);
  const removeSampleZone = useProjectStore((s) => s.removeSampleZone);
  const updateSampleZone = useProjectStore((s) => s.updateSampleZone);
  const { importSfzFile } = useSfzImport();

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const errors = useMemo(() => validateZones(zones), [zones]);

  const handleAddZone = useCallback(() => {
    if (!track.samplerConfig) return;
    const zone = createDefaultZone(track.samplerConfig.audioKey, {
      rootNote: track.samplerConfig.rootNote,
    });
    addSampleZone(track.id, zone);
    setSelectedZoneId(zone.id);
  }, [track, addSampleZone]);

  const handleRemoveZone = useCallback(
    (zoneId: string) => {
      removeSampleZone(track.id, zoneId);
      if (selectedZoneId === zoneId) setSelectedZoneId(null);
    },
    [track.id, removeSampleZone, selectedZoneId],
  );

  const handleUpdateZone = useCallback(
    (zoneId: string, partial: Partial<SampleZone>) => {
      updateSampleZone(track.id, zoneId, partial);
    },
    [track.id, updateSampleZone],
  );

  if (!track.samplerConfig) return null;

  return (
    <div className="border-t border-[var(--daw-border,#1f2536)]">
      {/* Header toggle */}
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 hover:text-zinc-200 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label="Toggle zone map editor"
      >
        <span>Multi-Sample Zones ({zones.length})</span>
        <span className="text-[9px]">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Zone grid visualization */}
          <ZoneGrid
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
          />

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              className="px-2 py-1 rounded text-[10px] bg-[var(--daw-accent,#3b82f6)]/15 text-[var(--daw-accent,#3b82f6)] hover:bg-[var(--daw-accent,#3b82f6)]/25 transition-colors"
              onClick={handleAddZone}
              aria-label="Add new sample zone"
            >
              + Add Zone
            </button>
            <button
              className="px-2 py-1 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
              onClick={() => void importSfzFile(track.id)}
              aria-label="Import SFZ mapping file"
            >
              Import SFZ
            </button>
            {selectedZone && (
              <>
                <button
                  className="px-2 py-1 rounded text-[10px] bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors"
                  onClick={() => onLoadSampleForZone(selectedZone.id)}
                  aria-label="Load sample for selected zone"
                >
                  Load Sample
                </button>
                <button
                  className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                  onClick={() => handleRemoveZone(selectedZone.id)}
                  aria-label="Remove selected zone"
                >
                  Remove
                </button>
              </>
            )}
          </div>

          {/* Zone detail editor */}
          {selectedZone && (
            <ZoneDetailEditor
              zone={selectedZone}
              onChange={(partial) => handleUpdateZone(selectedZone.id, partial)}
            />
          )}

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="text-[10px] text-red-400 space-y-0.5">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact key/velocity grid showing all zones as colored rectangles. */
function ZoneGrid({
  zones,
  selectedZoneId,
  onSelectZone,
}: {
  zones: SampleZone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const GRID_WIDTH = 384;
  const GRID_HEIGHT = 80;
  const KEY_WIDTH = GRID_WIDTH / TOTAL_KEYS;
  const VEL_SCALE = GRID_HEIGHT / 128;

  // Draw the grid
  const drawGrid = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = GRID_WIDTH * dpr;
      canvas.height = GRID_HEIGHT * dpr;
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#0a0f1a';
      ctx.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);

      // Octave markers
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let note = 0; note < 128; note += 12) {
        const x = note * KEY_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GRID_HEIGHT);
        ctx.stroke();
      }

      // Draw zones as rectangles
      zones.forEach((zone, i) => {
        const x = zone.lowKey * KEY_WIDTH;
        const w = (zone.highKey - zone.lowKey + 1) * KEY_WIDTH;
        const y = (127 - zone.highVelocity) * VEL_SCALE;
        const h = (zone.highVelocity - zone.lowVelocity + 1) * VEL_SCALE;
        const color = ZONE_COLORS[i % ZONE_COLORS.length];

        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        // Border
        const isSelected = zone.id === selectedZoneId;
        ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = isSelected ? 1.5 : 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        // Root note indicator
        const rootX = zone.rootNote * KEY_WIDTH;
        if (rootX >= x && rootX <= x + w) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(rootX - 0.5, y, 1, h);
        }

        // Zone label
        if (w > 30) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = '8px Inter, sans-serif';
          ctx.textBaseline = 'top';
          const label = zone.sampleName || `Zone ${i + 1}`;
          ctx.fillText(label, x + 2, y + 2, w - 4);
        }
      });
    },
    [zones, selectedZoneId, KEY_WIDTH, VEL_SCALE],
  );

  // Click handler to select zone
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = GRID_WIDTH / rect.width;
      const scaleY = GRID_HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const clickedKey = Math.floor(x / KEY_WIDTH);
      const clickedVel = 127 - Math.floor(y / VEL_SCALE);

      // Find topmost zone at click position
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        if (
          clickedKey >= z.lowKey &&
          clickedKey <= z.highKey &&
          clickedVel >= z.lowVelocity &&
          clickedVel <= z.highVelocity
        ) {
          onSelectZone(z.id);
          return;
        }
      }
      // Deselect on miss-click
      onSelectZone(null);
    },
    [zones, onSelectZone, KEY_WIDTH, VEL_SCALE],
  );

  // Keyboard navigation: arrow keys cycle through zones
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (zones.length === 0) return;
      const currentIdx = zones.findIndex((z) => z.id === selectedZoneId);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIdx + 1) % zones.length;
        onSelectZone(zones[next].id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIdx <= 0 ? zones.length - 1 : currentIdx - 1;
        onSelectZone(zones[prev].id);
      } else if (e.key === 'Escape') {
        onSelectZone(null);
      }
    },
    [zones, selectedZoneId, onSelectZone],
  );

  // Redraw when zones or selection change
  useEffect(() => {
    if (canvasRef.current) {
      drawGrid(canvasRef.current);
    }
  }, [drawGrid]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-sm cursor-crosshair focus:outline-none focus:ring-1 focus:ring-[var(--daw-accent,#3b82f6)]/50"
        style={{ height: `${GRID_HEIGHT}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label={`Sample zone map grid with ${zones.length} zone${zones.length !== 1 ? 's' : ''}. Use arrow keys to navigate.`}
      />
      {zones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-zinc-500">Click "+ Add Zone" or "Import SFZ" to create zones</span>
        </div>
      )}
      {/* Axis labels */}
      <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5">
        <span>C-1</span>
        <span>C2</span>
        <span>C4</span>
        <span>C6</span>
        <span>G9</span>
      </div>
    </div>
  );
}

/** Detail editor for a single selected zone. */
function ZoneDetailEditor({
  zone,
  onChange,
}: {
  zone: SampleZone;
  onChange: (partial: Partial<SampleZone>) => void;
}) {
  return (
    <div className="rounded border border-white/8 bg-white/[0.03] px-2.5 py-2 space-y-2" data-zone-id={zone.id}>
      <div className="text-[10px] font-semibold text-zinc-300 truncate">
        {zone.sampleName || 'Zone'} — {midiNoteToName(zone.rootNote)}
      </div>

      {/* Key range */}
      <div className="grid grid-cols-2 gap-2">
        <ZoneNumberInput
          label="Low Key"
          value={zone.lowKey}
          min={0}
          max={127}
          suffix={midiNoteToName(zone.lowKey)}
          onChange={(v) => onChange({ lowKey: v })}
        />
        <ZoneNumberInput
          label="High Key"
          value={zone.highKey}
          min={0}
          max={127}
          suffix={midiNoteToName(zone.highKey)}
          onChange={(v) => onChange({ highKey: v })}
        />
      </div>

      {/* Velocity range */}
      <div className="grid grid-cols-2 gap-2">
        <ZoneNumberInput
          label="Low Vel"
          value={zone.lowVelocity}
          min={0}
          max={127}
          onChange={(v) => onChange({ lowVelocity: v })}
        />
        <ZoneNumberInput
          label="High Vel"
          value={zone.highVelocity}
          min={0}
          max={127}
          onChange={(v) => onChange({ highVelocity: v })}
        />
      </div>

      {/* Root note and tuning */}
      <div className="grid grid-cols-3 gap-2">
        <ZoneNumberInput
          label="Root"
          value={zone.rootNote}
          min={0}
          max={127}
          suffix={midiNoteToName(zone.rootNote)}
          onChange={(v) => onChange({ rootNote: v })}
        />
        <ZoneNumberInput
          label="Tune (ct)"
          value={zone.tuneOffset}
          min={-1200}
          max={1200}
          step={10}
          onChange={(v) => onChange({ tuneOffset: v })}
        />
        <ZoneNumberInput
          label="XFade"
          value={zone.crossfadeWidth}
          min={0}
          max={12}
          onChange={(v) => onChange({ crossfadeWidth: v })}
        />
      </div>

      {/* Volume and pan */}
      <div className="grid grid-cols-2 gap-2">
        <ZoneRangeInput
          label="Volume"
          value={zone.volume}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange({ volume: v })}
        />
        <ZoneRangeInput
          label="Pan"
          value={zone.pan}
          min={-1}
          max={1}
          step={0.01}
          format={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
          onChange={(v) => onChange({ pan: v })}
        />
      </div>
    </div>
  );
}

/** Compact number input with label. */
function ZoneNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-[10px] text-zinc-400 flex items-center gap-1">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-12 bg-[#111] border border-[#333] rounded px-1 py-0.5 text-[10px] text-zinc-200 font-mono"
        aria-label={label}
      />
      {suffix && <span className="text-zinc-500 font-mono text-[9px]">{suffix}</span>}
    </label>
  );
}

/** Compact range slider with label and value display. */
function ZoneRangeInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-[10px] text-zinc-400 flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-zinc-500 font-mono text-[9px]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-[var(--daw-accent,#3b82f6)]"
        aria-label={label}
      />
    </label>
  );
}

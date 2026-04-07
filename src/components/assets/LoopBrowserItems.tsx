/**
 * LoopBrowserItems.tsx — Individual loop item components for the Loop Browser.
 * Extracted from LoopBrowser.tsx to keep components under 600 lines.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoopDefinition } from '../../engine/LoopLibrary';
import { getLoopDuration, formatDuration } from '../../engine/LoopLibrary';
import type { AssetClip } from '../../types/project';

export function MiniWaveform({ data, color, height = 32 }: { data: number[] | null; color: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    const centerY = h / 2;
    const amp = (h / 2) * 0.85;
    const step = w / data.length;

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(i * step, centerY - data[i] * amp);
    }
    for (let i = data.length - 1; i >= 0; i--) {
      ctx.lineTo(i * step, centerY + data[i] * amp);
    }
    ctx.closePath();
    ctx.fillStyle = color + '40';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const px = i * step;
      const py = centerY - data[i] * amp;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color + '80';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [data, color, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Loop waveform preview"
      className="w-full"
      style={{ height }}
    />
  );
}

// ─── SVG Mini Waveform for Assets ───────────────────────────────────────────

export function SvgMiniWaveform({ peaks, color }: { peaks: number[] | null; color: string }) {
  if (!peaks || peaks.length === 0) return <div className="w-full h-full bg-white/5 rounded" />;
  const w = 60;
  const h = 20;
  const step = w / peaks.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rounded bg-white/5">
      {peaks.map((p, i) => {
        const barH = Math.max(p * (h - 2), 0.5);
        return (
          <rect
            key={i}
            x={i * step}
            y={(h - barH) / 2}
            width={Math.max(step * 0.7, 0.5)}
            height={barH}
            fill={color}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Preset Loop Item Component ─────────────────────────────────────────────

export function PresetLoopItem({
  def,
  isPreviewing,
  onPreview,
  onDragStart,
}: {
  def: LoopDefinition;
  isPreviewing: boolean;
  onPreview: (def: LoopDefinition) => void;
  onDragStart: (e: React.DragEvent, def: LoopDefinition) => void;
}) {
  const duration = getLoopDuration(def);
  const categoryColor = def.category === 'Drums' ? 'bg-orange-500/20 text-orange-300'
    : def.category === 'Bass' ? 'bg-blue-500/20 text-blue-300'
    : def.category === 'Keys' ? 'bg-green-500/20 text-green-300'
    : 'bg-purple-500/20 text-purple-300';

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab transition-colors ${
        isPreviewing ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, def)}
    >
      <button
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
          isPreviewing
            ? 'bg-violet-500 text-white'
            : 'bg-white/5 text-white/40 group-hover:text-white/70 group-hover:bg-white/10'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onPreview(def);
        }}
      >
        {isPreviewing ? (
          <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12"/></svg>
        ) : (
          <svg className="h-2.5 w-2.5 fill-current ml-0.5" viewBox="0 0 16 16"><polygon points="3,2 14,8 3,14"/></svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/80 truncate">{def.name}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] px-1 py-0 rounded ${categoryColor}`}>
            {def.category}
          </span>
          <span className="text-[10px] text-white/30 px-1 py-0 rounded bg-white/5">
            {def.bpm}
          </span>
          {def.key && (
            <span className="text-[10px] text-white/30 px-1 py-0 rounded bg-white/5">
              {def.key}
            </span>
          )}
          <span className="text-[10px] text-white/20">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      <svg className="h-3 w-3 stroke-current text-white/10 group-hover:text-white/25 shrink-0" viewBox="0 0 16 16" fill="none" strokeWidth="1.5"><line x1="6" y1="4" x2="6" y2="12"/><line x1="10" y1="4" x2="10" y2="12"/></svg>
    </div>
  );
}

// ─── Asset Loop Item Component ──────────────────────────────────────────────

export function AssetLoopItem({
  asset,
  isPreviewing,
  onPreview,
  onStar,
  onDelete,
  onDragStart,
}: {
  asset: AssetClip;
  isPreviewing: boolean;
  onPreview: (asset: AssetClip) => void;
  onStar: (e: React.MouseEvent, assetId: string) => void;
  onDelete: (e: React.MouseEvent, assetId: string) => void;
  onDragStart: (e: React.DragEvent, asset: AssetClip) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab transition-colors ${
        isPreviewing ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, asset)}
    >
      <button
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
          isPreviewing
            ? 'bg-violet-500 text-white'
            : 'bg-white/5 text-white/40 group-hover:text-white/70 group-hover:bg-white/10'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onPreview(asset);
        }}
      >
        {isPreviewing ? (
          <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12"/></svg>
        ) : (
          <svg className="h-2.5 w-2.5 fill-current ml-0.5" viewBox="0 0 16 16"><polygon points="3,2 14,8 3,14"/></svg>
        )}
      </button>

      <div className="shrink-0">
        <SvgMiniWaveform peaks={asset.waveformPeaks} color="#6b7280" />
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1">
          <span className={`shrink-0 text-[8px] px-1 py-px rounded font-medium ${
            asset.source === 'uploaded'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-violet-500/20 text-violet-400'
          }`}>
            {asset.source === 'uploaded' ? 'IMP' : 'AI'}
          </span>
          <span className="text-[10px] text-white/70 truncate">
            {asset.prompt || asset.trackDisplayName}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-white/40 truncate">{asset.trackDisplayName}</span>
          <span className="text-[10px] text-white/20">{fmtDuration(asset.duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => onStar(e, asset.id)}
          className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
            asset.starred
              ? 'text-yellow-400 hover:text-yellow-300'
              : 'text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100'
          }`}
          title={asset.starred ? 'Remove star' : 'Star'}
        >
          {asset.starred ? '★' : '☆'}
        </button>
        <button
          onClick={(e) => onDelete(e, asset.id)}
          className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Main Loop Browser Component ────────────────────────────────────────────

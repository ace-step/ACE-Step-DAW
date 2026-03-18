import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import {
  LOOP_DEFINITIONS,
  LoopCategory,
  LoopDefinition,
  loadLoop,
  getLoopDuration,
  formatDuration,
} from '../../engine/LoopLibrary';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type { AssetClip } from '../../types/project';
import * as Tone from 'tone';

// ─── Constants ──────────────────────────────────────────────────────────────

type Tab = 'presets' | 'myLoops';
type AssetFilter = 'all' | 'starred' | 'generated' | 'uploaded';

const CATEGORIES: Array<'All' | LoopCategory> = ['All', 'Drums', 'Bass', 'Keys', 'Synth'];

const CATEGORY_COLORS: Record<string, string> = {
  All: 'text-white/70 bg-white/10 hover:bg-white/15',
  Drums: 'text-orange-300 bg-orange-500/15 hover:bg-orange-500/25',
  Bass: 'text-blue-300 bg-blue-500/15 hover:bg-blue-500/25',
  Keys: 'text-green-300 bg-green-500/15 hover:bg-green-500/25',
  Synth: 'text-purple-300 bg-purple-500/15 hover:bg-purple-500/25',
};

const CATEGORY_ACTIVE_COLORS: Record<string, string> = {
  All: 'text-white bg-white/20',
  Drums: 'text-orange-200 bg-orange-500/30',
  Bass: 'text-blue-200 bg-blue-500/30',
  Keys: 'text-green-200 bg-green-500/30',
  Synth: 'text-purple-200 bg-purple-500/30',
};

// ─── Preview Player Singleton ───────────────────────────────────────────────

let previewPlayer: Tone.Player | null = null;
let previewGain: Tone.Gain | null = null;

function stopPreview() {
  try { previewPlayer?.stop(); } catch { /* not started */ }
  previewPlayer?.dispose();
  previewPlayer = null;
}

async function playPreview(audioBuffer: AudioBuffer) {
  await Tone.start();
  stopPreview();
  if (!previewGain) {
    previewGain = new Tone.Gain(0.8).toDestination();
  }
  const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
  previewPlayer = new Tone.Player(toneBuffer);
  previewPlayer.connect(previewGain);
  previewPlayer.start();
}

// ─── Mini Waveform Component ────────────────────────────────────────────────

function MiniWaveform({ data, color, height = 32 }: { data: number[] | null; color: string; height?: number }) {
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
      className="w-full"
      style={{ height }}
    />
  );
}

// ─── SVG Mini Waveform for Assets ───────────────────────────────────────────

function SvgMiniWaveform({ peaks, color }: { peaks: number[] | null; color: string }) {
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

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Preset Loop Item Component ─────────────────────────────────────────────

function PresetLoopItem({
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
          <span className={`text-[9px] px-1 py-0 rounded ${categoryColor}`}>
            {def.category}
          </span>
          <span className="text-[9px] text-white/30 px-1 py-0 rounded bg-white/5">
            {def.bpm}
          </span>
          {def.key && (
            <span className="text-[9px] text-white/30 px-1 py-0 rounded bg-white/5">
              {def.key}
            </span>
          )}
          <span className="text-[9px] text-white/20">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      <svg className="h-3 w-3 stroke-current text-white/10 group-hover:text-white/25 shrink-0" viewBox="0 0 16 16" fill="none" strokeWidth="1.5"><line x1="6" y1="4" x2="6" y2="12"/><line x1="10" y1="4" x2="10" y2="12"/></svg>
    </div>
  );
}

// ─── Asset Loop Item Component ──────────────────────────────────────────────

function AssetLoopItem({
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
          <span className="text-[9px] text-white/40 truncate">{asset.trackDisplayName}</span>
          <span className="text-[9px] text-white/20">{fmtDuration(asset.duration)}</span>
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

export function LoopBrowser() {
  const isOpen = useUIStore((s) => s.loopBrowserOpen);
  const category = useUIStore((s) => s.loopBrowserCategory);
  const search = useUIStore((s) => s.loopBrowserSearch);
  const previewingId = useUIStore((s) => s.previewingLoopId);
  const setCategory = useUIStore((s) => s.setLoopBrowserCategory);
  const setSearch = useUIStore((s) => s.setLoopBrowserSearch);
  const setPreviewingId = useUIStore((s) => s.setPreviewingLoopId);
  const toggleBrowser = useUIStore((s) => s.toggleLoopBrowser);

  const project = useProjectStore((s) => s.project);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const toggleAssetStar = useProjectStore((s) => s.toggleAssetStar);

  const [activeTab, setActiveTab] = useState<Tab>('presets');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [previewWaveform, setPreviewWaveform] = useState<number[] | null>(null);
  const [width, setWidth] = useState(240);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Presets filtering ──
  const filteredPresets = LOOP_DEFINITIONS.filter((def) => {
    const matchesCategory = category === 'All' || def.category === category;
    const matchesSearch = search === '' || def.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // ── Assets filtering ──
  const allAssets = useMemo<AssetClip[]>(() => project?.assets ?? [], [project?.assets]);

  const filteredAssets = useMemo(() => {
    let list = allAssets;
    if (assetFilter === 'starred') list = list.filter((a) => a.starred);
    else if (assetFilter === 'generated') list = list.filter((a) => a.source !== 'uploaded');
    else if (assetFilter === 'uploaded') list = list.filter((a) => a.source === 'uploaded');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        (a.prompt ?? '').toLowerCase().includes(q) ||
        (a.trackDisplayName ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allAssets, assetFilter, search]);

  // ── Preview handlers ──
  const handlePresetPreview = useCallback(async (def: LoopDefinition) => {
    if (previewingId === def.id) {
      stopPreview();
      setPreviewingId(null);
      setPreviewWaveform(null);
      return;
    }
    try {
      const { audioBuffer, waveformData } = await loadLoop(def);
      await playPreview(audioBuffer);
      setPreviewingId(def.id);
      setPreviewWaveform(waveformData);
    } catch (err) {
      console.error('Failed to preview loop:', err);
    }
  }, [previewingId, setPreviewingId]);

  const handleAssetPreview = useCallback(async (asset: AssetClip) => {
    if (previewingId === asset.id) {
      stopPreview();
      setPreviewingId(null);
      setPreviewWaveform(null);
      return;
    }
    try {
      const audioKey = asset.isolatedAudioKey ?? asset.cumulativeMixKey;
      if (!audioKey) return;
      const blob = await loadAudioBlobByKey(audioKey);
      if (!blob) return;
      const engine = getAudioEngine();
      await engine.resume();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
      await playPreview(audioBuffer);
      setPreviewingId(asset.id);
      setPreviewWaveform(asset.waveformPeaks);
    } catch (err) {
      console.error('Failed to preview asset:', err);
    }
  }, [previewingId, setPreviewingId]);

  // ── Stop preview on close ──
  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      setPreviewingId(null);
      setPreviewWaveform(null);
    }
  }, [isOpen, setPreviewingId]);

  // ── Drag handlers ──
  const handlePresetDragStart = useCallback((e: React.DragEvent, def: LoopDefinition) => {
    e.dataTransfer.setData('application/x-loop-id', def.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleAssetDragStart = useCallback((e: React.DragEvent, asset: AssetClip) => {
    e.dataTransfer.setData('application/x-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // ── Asset actions ──
  const handleStar = useCallback((e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    toggleAssetStar(assetId);
  }, [toggleAssetStar]);

  const handleDelete = useCallback((e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    removeAsset(assetId);
  }, [removeAsset]);

  // ── Resize ──
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = resizeRef.current.startX - e.clientX;
      setWidth(Math.max(180, Math.min(400, resizeRef.current.startWidth + dx)));
    };
    const handleMouseUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!isOpen) return null;

  const previewingPresetDef = activeTab === 'presets' && previewingId
    ? LOOP_DEFINITIONS.find(d => d.id === previewingId)
    : null;

  const assetFilters: { id: AssetFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'starred', label: '\u2605' },
    { id: 'generated', label: 'AI' },
    { id: 'uploaded', label: 'Imported' },
  ];

  return (
    <div
      className="relative flex flex-col bg-[#111126] border-l border-white/10 shrink-0 select-none"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-white/5 bg-[#0e0e22] shrink-0">
        <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">Loop Library</span>
        <button
          className="text-white/30 hover:text-white/60 transition-colors"
          onClick={toggleBrowser}
        >
          <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 16 16" fill="none" strokeWidth="2"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-white/5 shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 stroke-current text-white/30" viewBox="0 0 16 16" fill="none" strokeWidth="1.5"><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="13" y2="13"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loops..."
            className="w-full h-7 pl-7 pr-2 text-xs bg-white/5 border border-white/5 rounded-md text-white/80 placeholder:text-white/20 outline-none focus:border-violet-500/40 transition-colors"
          />
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
            activeTab === 'presets'
              ? 'text-violet-300 border-b-2 border-violet-500'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          Presets
        </button>
        <button
          onClick={() => setActiveTab('myLoops')}
          className={`flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
            activeTab === 'myLoops'
              ? 'text-violet-300 border-b-2 border-violet-500'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          My Loops
          {allAssets.length > 0 && (
            <span className="ml-1 text-[9px] text-white/20">{allAssets.length}</span>
          )}
        </button>
      </div>

      {/* ── Presets Tab ── */}
      {activeTab === 'presets' && (
        <>
          {/* Category pills */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-white/5 overflow-x-auto shrink-0">
            {CATEGORIES.map((cat) => {
              const isActive = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? (CATEGORY_ACTIVE_COLORS[cat] ?? CATEGORY_ACTIVE_COLORS.All)
                      : (CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.All)
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Preset loop list */}
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {filteredPresets.length === 0 ? (
              <div className="text-center text-white/20 text-xs py-8">
                No loops found
              </div>
            ) : (
              filteredPresets.map((def) => (
                <PresetLoopItem
                  key={def.id}
                  def={def}
                  isPreviewing={previewingId === def.id}
                  onPreview={handlePresetPreview}
                  onDragStart={handlePresetDragStart}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* ── My Loops Tab ── */}
      {activeTab === 'myLoops' && (
        <>
          {/* Filter pills */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-white/5 flex-wrap shrink-0">
            {assetFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setAssetFilter(f.id)}
                className={`px-2 py-0.5 text-[10px] rounded-full font-medium transition-colors ${
                  assetFilter === f.id
                    ? 'bg-violet-500/30 text-violet-200'
                    : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-[9px] text-white/20 self-center ml-auto">{filteredAssets.length} items</span>
          </div>

          {/* Asset list */}
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-white/20 text-xs gap-1">
                <span>No loops yet</span>
                <span className="text-[9px] text-white/10">Generate or import audio to see it here</span>
              </div>
            ) : (
              filteredAssets.map((asset) => (
                <AssetLoopItem
                  key={asset.id}
                  asset={asset}
                  isPreviewing={previewingId === asset.id}
                  onPreview={handleAssetPreview}
                  onStar={handleStar}
                  onDelete={handleDelete}
                  onDragStart={handleAssetDragStart}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Preview section */}
      {previewingPresetDef && (
        <div className="border-t border-white/5 px-2 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/50 truncate">{previewingPresetDef.name}</span>
            <button
              className="text-white/30 hover:text-white/60"
              onClick={() => {
                stopPreview();
                setPreviewingId(null);
                setPreviewWaveform(null);
              }}
            >
              <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12"/></svg>
            </button>
          </div>
          <MiniWaveform
            data={previewWaveform}
            color="#8b5cf6"
            height={28}
          />
        </div>
      )}

      {/* Resize handle (left edge) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors"
        onMouseDown={(e) => {
          resizeRef.current = { startX: e.clientX, startWidth: width };
          document.body.style.cursor = 'ew-resize';
          document.body.style.userSelect = 'none';
        }}
      />
    </div>
  );
}

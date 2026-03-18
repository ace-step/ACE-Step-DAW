import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import {
  LOOP_DEFINITIONS,
  LoopCategory,
  LoopDefinition,
  loadLoop,
  getLoopDuration,
  formatDuration,
} from '../../engine/LoopLibrary';
import * as Tone from 'tone';

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── Loop Item Component ────────────────────────────────────────────────────

function LoopItem({
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

  const [previewWaveform, setPreviewWaveform] = useState<number[] | null>(null);
  const [width, setWidth] = useState(240);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const filteredLoops = LOOP_DEFINITIONS.filter((def) => {
    const matchesCategory = category === 'All' || def.category === category;
    const matchesSearch = search === '' || def.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handlePreview = useCallback(async (def: LoopDefinition) => {
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

  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      setPreviewingId(null);
      setPreviewWaveform(null);
    }
  }, [isOpen, setPreviewingId]);

  const handleDragStart = useCallback((e: React.DragEvent, def: LoopDefinition) => {
    e.dataTransfer.setData('application/x-loop-id', def.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
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

  const previewingDef = previewingId ? LOOP_DEFINITIONS.find(d => d.id === previewingId) : null;

  return (
    <div
      className="relative flex flex-col bg-[#111126] border-r border-white/10 shrink-0 select-none"
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

      {/* Loop list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredLoops.length === 0 ? (
          <div className="text-center text-white/20 text-xs py-8">
            No loops found
          </div>
        ) : (
          filteredLoops.map((def) => (
            <LoopItem
              key={def.id}
              def={def}
              isPreviewing={previewingId === def.id}
              onPreview={handlePreview}
              onDragStart={handleDragStart}
            />
          ))
        )}
      </div>

      {/* Preview section */}
      {previewingDef && (
        <div className="border-t border-white/5 px-2 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/50 truncate">{previewingDef.name}</span>
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

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors"
        onMouseDown={(e) => {
          resizeRef.current = { startX: e.clientX, startWidth: width };
          document.body.style.cursor = 'ew-resize';
          document.body.style.userSelect = 'none';
        }}
      />
    </div>
  );
}

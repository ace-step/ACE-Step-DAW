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
import { setDragPayload, clearDragPayload } from '../../utils/dragPayload';
import { createDebugLogger } from '../../utils/debugLogger';

const log = createDebugLogger('loop-browser');

/** 1x1 transparent GIF used to hide the native drag ghost. */
const TRANSPARENT_IMG = new Image();
TRANSPARENT_IMG.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ─── Constants ──────────────────────────────────────────────────────────────

type Tab = 'presets' | 'myLoops';
type AssetFilter = 'all' | 'starred' | 'generated' | 'uploaded';

const CATEGORIES: Array<'All' | LoopCategory> = ['All', 'Drums', 'Bass', 'Keys', 'Synth', 'FX', 'Vocals'];

const CATEGORY_COLORS: Record<string, string> = {
  All: 'text-white/70 bg-white/10 hover:bg-white/15',
  Drums: 'text-orange-300 bg-orange-500/15 hover:bg-orange-500/25',
  Bass: 'text-blue-300 bg-blue-500/15 hover:bg-blue-500/25',
  Keys: 'text-green-300 bg-green-500/15 hover:bg-green-500/25',
  Synth: 'text-purple-300 bg-purple-500/15 hover:bg-purple-500/25',
  FX: 'text-red-300 bg-red-500/15 hover:bg-red-500/25',
  Vocals: 'text-pink-300 bg-pink-500/15 hover:bg-pink-500/25',
};

const CATEGORY_ACTIVE_COLORS: Record<string, string> = {
  All: 'text-white bg-white/20',
  Drums: 'text-orange-200 bg-orange-500/30',
  Bass: 'text-blue-200 bg-blue-500/30',
  Keys: 'text-green-200 bg-green-500/30',
  Synth: 'text-purple-200 bg-purple-500/30',
  FX: 'text-red-200 bg-red-500/30',
  Vocals: 'text-pink-200 bg-pink-500/30',
};

// ─── Preview Player Singleton ───────────────────────────────────────────────
//
// Native Web Audio preview — no Tone.js dependency. We keep a single
// `AudioBufferSourceNode` + lazily-created persistent `GainNode`
// wired to the engine's AudioContext destination. The source node
// is one-shot by WebAudio spec (cannot be restarted after stop()),
// so each preview allocates a fresh one.

let previewSource: AudioBufferSourceNode | null = null;
let previewGain: GainNode | null = null;

function stopPreview() {
  if (previewSource) {
    try { previewSource.stop(); } catch { /* not started */ }
    try { previewSource.disconnect(); } catch { /* already disconnected */ }
    previewSource = null;
  }
}

async function playPreview(audioBuffer: AudioBuffer) {
  const engine = getAudioEngine();
  await engine.resume();
  stopPreview();

  const ctx = engine.ctx;
  if (!previewGain) {
    previewGain = ctx.createGain();
    previewGain.gain.value = 0.8;
    previewGain.connect(ctx.destination);
  }
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(previewGain);
  source.start();
  previewSource = source;
  // Release the reference automatically when playback finishes so a
  // subsequent stopPreview() doesn't call stop() on a finished node.
  // Also disconnect the source and clear its handler so the graph
  // edge + closure are released immediately on end — matches the
  // synchronous cleanup path in `stopPreview()` (Copilot review on
  // PR #1725).
  source.onended = () => {
    try { source.disconnect(); } catch { /* already disconnected */ }
    source.onended = null;
    if (previewSource === source) previewSource = null;
  };
}

// ─── Mini Waveform Component ────────────────────────────────────────────────


import { MiniWaveform, SvgMiniWaveform, fmtDuration, PresetLoopItem, AssetLoopItem } from './LoopBrowserItems';


export function LoopBrowser() {
  const isOpen = useUIStore((s) => s.loopBrowserOpen);
  const category = useUIStore((s) => s.loopBrowserCategory);
  const search = useUIStore((s) => s.loopBrowserSearch);
  const previewingId = useUIStore((s) => s.previewingLoopId);
  const setCategory = useUIStore((s) => s.setLoopBrowserCategory);
  const setSearch = useUIStore((s) => s.setLoopBrowserSearch);
  const setPreviewingId = useUIStore((s) => s.setPreviewingLoopId);
  const toggleBrowser = useUIStore((s) => s.toggleLoopBrowser);
  const addRecentlyUsed = useUIStore((s) => s.addRecentlyUsedLoop);

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
      addRecentlyUsed(def.id);
    } catch (err) {
      log.error('Failed to preview loop:', err);
    }
  }, [previewingId, setPreviewingId, addRecentlyUsed]);

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
      log.error('Failed to preview asset:', err);
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

  // ── Clear drag payload on dragend ──
  useEffect(() => {
    const onDragEnd = () => clearDragPayload();
    window.addEventListener('dragend', onDragEnd);
    return () => window.removeEventListener('dragend', onDragEnd);
  }, []);

  // ── Drag handlers ──
  const handlePresetDragStart = useCallback((e: React.DragEvent, def: LoopDefinition) => {
    e.dataTransfer.setData('application/x-loop-id', def.id);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setDragImage(TRANSPARENT_IMG, 0, 0);
    setDragPayload({ type: 'loop', duration: getLoopDuration(def), name: def.name });
  }, []);

  const handleAssetDragStart = useCallback((e: React.DragEvent, asset: AssetClip) => {
    e.dataTransfer.setData('application/x-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setDragImage(TRANSPARENT_IMG, 0, 0);
    setDragPayload({ type: 'asset', duration: asset.duration, name: asset.prompt || asset.trackDisplayName });
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
      data-testid="loop-browser-panel"
      className="relative flex flex-col bg-[#111126] border-l border-white/10 shrink-0 select-none transition-[width,opacity] duration-150 ease-out overflow-hidden"
      style={{ width: isOpen ? width : 0, opacity: isOpen ? 1 : 0 }}
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
            <span className="ml-1 text-[10px] text-white/20">({allAssets.length})</span>
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
            <span className="text-[10px] text-white/20 self-center ml-auto">{filteredAssets.length} items</span>
          </div>

          {/* Asset list */}
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-white/20 text-xs gap-1">
                <span>No loops yet</span>
                <span className="text-[10px] text-white/10">Generate or import audio to see it here</span>
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

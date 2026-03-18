import { useState, useMemo, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { AssetClip } from '../../types/project';

type Filter = 'all' | 'starred' | 'generated' | 'uploaded';

function MiniWaveform({ peaks, color }: { peaks: number[] | null; color: string }) {
  if (!peaks || peaks.length === 0) return <div className="w-full h-full bg-[#333] rounded" />;
  const w = 60;
  const h = 20;
  const step = w / peaks.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rounded bg-[#252525]">
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

export function AssetsPanel() {
  const showLibrary = useUIStore((s) => s.showLibrary);
  const assetsPanelWidth = useUIStore((s) => s.assetsPanelWidth);
  const setAssetsPanelWidth = useUIStore((s) => s.setAssetsPanelWidth);
  const selectClip = useUIStore((s) => s.selectClip);
  const project = useProjectStore((s) => s.project);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const toggleAssetStar = useProjectStore((s) => s.toggleAssetStar);
  const getClipById = useProjectStore((s) => s.getClipById);

  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [searchText, setSearchText] = useState('');

  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startW: assetsPanelWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const delta = resizeDragRef.current.startX - ev.clientX;
      setAssetsPanelWidth(resizeDragRef.current.startW + delta);
    };
    const onMouseUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [assetsPanelWidth, setAssetsPanelWidth]);

  const allAssets = useMemo<AssetClip[]>(() => project?.assets ?? [], [project?.assets]);

  const filteredAssets = useMemo(() => {
    let list = allAssets;
    if (activeFilter === 'starred') list = list.filter((a) => a.starred);
    else if (activeFilter === 'generated') list = list.filter((a) => a.source !== 'uploaded');
    else if (activeFilter === 'uploaded') list = list.filter((a) => a.source === 'uploaded');

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((a) =>
        (a.prompt ?? '').toLowerCase().includes(q) ||
        (a.trackDisplayName ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allAssets, activeFilter, searchText]);

  const handleClick = useCallback((asset: AssetClip) => {
    const clip = getClipById(asset.clipId);
    if (clip) selectClip(asset.clipId, false);
  }, [selectClip, getClipById]);

  const handleStar = useCallback((e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    toggleAssetStar(assetId);
  }, [toggleAssetStar]);

  const handleDelete = useCallback((e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    removeAsset(assetId);
  }, [removeAsset]);

  if (!showLibrary || !project) return null;

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'starred', label: '★' },
    { id: 'generated', label: 'AI' },
    { id: 'uploaded', label: 'Imported' },
  ];

  return (
    <div className="bg-[#2a2a2a] border-l border-[#1a1a1a] flex flex-col shrink-0 relative" style={{ width: assetsPanelWidth }}>
      {/* Left-edge resize handle */}
      <div
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-daw-accent/30 transition-colors z-10"
        onMouseDown={onResizeMouseDown}
      />

      {/* Header */}
      <div className="flex items-center h-6 px-3 border-b border-[#3a3a3a] bg-[#333] shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-zinc-500 mr-1.5">
          <circle cx="5" cy="5" r="3.5" />
          <path d="M8 8l2.5 2.5" strokeLinecap="round" />
        </svg>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Library</span>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-[#3a3a3a]">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search loops..."
          className="w-full text-[11px] text-zinc-300 bg-[#222] border border-[#444] rounded px-2 py-1 outline-none placeholder:text-zinc-600 focus:border-daw-accent/50"
        />
      </div>

      {/* Filter keyword buttons */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-[#3a3a3a] flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              activeFilter === f.id
                ? 'bg-daw-accent text-white'
                : 'bg-[#3a3a3a] text-zinc-400 hover:bg-[#444] hover:text-zinc-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-[9px] text-zinc-600 self-center ml-auto">{filteredAssets.length} items</span>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredAssets.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[10px] text-zinc-600">
            No matching loops
          </div>
        ) : (
          <div className="py-0.5">
            {filteredAssets.map((asset) => {
              const clipStillOnTrack = !!getClipById(asset.clipId);
              return (
                <div
                  key={asset.id}
                  onClick={() => handleClick(asset)}
                  className={`w-full flex items-start gap-2 px-3 py-1.5 hover:bg-[#363636] transition-colors text-left group cursor-pointer border-b border-[#333] ${
                    !clipStillOnTrack ? 'opacity-50' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    <MiniWaveform peaks={asset.waveformPeaks} color="#6b7280" />
                  </div>

                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1">
                      <span className={`shrink-0 text-[8px] px-1 py-px rounded font-medium ${
                        asset.source === 'uploaded'
                          ? 'bg-amber-900/30 text-amber-400'
                          : 'bg-daw-accent/20 text-daw-accent'
                      }`}>
                        {asset.source === 'uploaded' ? '↑' : 'AI'}
                      </span>
                      <span className="text-[10px] text-zinc-300 truncate">
                        {asset.prompt || asset.trackDisplayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-zinc-500 truncate">{asset.trackDisplayName}</span>
                      <span className="text-[9px] text-zinc-600">·</span>
                      <span className="text-[9px] text-zinc-500">{fmtDuration(asset.duration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => handleStar(e, asset.id)}
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
                      onClick={(e) => handleDelete(e, asset.id)}
                      className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

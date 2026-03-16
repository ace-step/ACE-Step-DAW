import { useState, useMemo, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { Clip, Track } from '../../types/project';


type Tab = 'starred' | 'generated' | 'uploaded';

interface AssetEntry {
  clip: Clip;
  track: Track;
}

function MiniWaveform({ peaks, color }: { peaks: number[] | null; color: string }) {
  if (!peaks || peaks.length === 0) return <div className="w-full h-full bg-zinc-800 rounded-sm" />;
  const w = 60;
  const h = 20;
  const step = w / peaks.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rounded-sm bg-zinc-800/60">
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
  const showAssetsPanel = useUIStore((s) => s.showAssetsPanel);
  const assetsPanelWidth = useUIStore((s) => s.assetsPanelWidth);
  const setAssetsPanelWidth = useUIStore((s) => s.setAssetsPanelWidth);
  const selectClip = useUIStore((s) => s.selectClip);
  const project = useProjectStore((s) => s.project);
  const toggleClipStar = useProjectStore((s) => s.toggleClipStar);

  const [activeTab, setActiveTab] = useState<Tab>('starred');

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

  const allEntries = useMemo<AssetEntry[]>(() => {
    if (!project) return [];
    const entries: AssetEntry[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.generationStatus === 'ready') {
          entries.push({ clip, track });
        }
      }
    }
    return entries;
  }, [project]);

  const starredEntries = useMemo(() => allEntries.filter((e) => e.clip.starred), [allEntries]);
  const generatedEntries = useMemo(() => allEntries.filter((e) => e.clip.source !== 'uploaded'), [allEntries]);
  const uploadedEntries = useMemo(() => allEntries.filter((e) => e.clip.source === 'uploaded'), [allEntries]);

  const activeEntries = activeTab === 'starred' ? starredEntries
    : activeTab === 'generated' ? generatedEntries
    : uploadedEntries;

  const handleClick = useCallback((clipId: string) => {
    selectClip(clipId, false);
  }, [selectClip]);

  const handleStar = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    toggleClipStar(clipId);
  }, [toggleClipStar]);

  if (!showAssetsPanel || !project) return null;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'starred', label: 'Starred', count: starredEntries.length },
    { id: 'generated', label: 'Generated', count: generatedEntries.length },
    { id: 'uploaded', label: 'Uploaded', count: uploadedEntries.length },
  ];

  return (
    <div className="bg-daw-surface border-l border-daw-border flex flex-col shrink-0 relative" style={{ width: assetsPanelWidth }}>
      {/* Left-edge resize handle */}
      <div
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-indigo-500/40 transition-colors z-10"
        onMouseDown={onResizeMouseDown}
      />
      {/* Header */}
      <div className="flex items-center justify-between h-6 px-3 border-b border-daw-border shrink-0">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Assets</span>
      </div>
      {/* Tabs */}
      <div className="flex border-b border-daw-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-1 py-1.5 text-[10px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-indigo-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[9px] text-zinc-600">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeEntries.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[10px] text-zinc-600">
            {activeTab === 'starred' ? 'No starred clips yet' :
             activeTab === 'uploaded' ? 'No uploaded audio yet' :
             'No generated clips yet'}
          </div>
        ) : (
          <div className="py-1">
            {activeEntries.map(({ clip, track }) => (
              <button
                key={clip.id}
                onClick={() => handleClick(clip.id)}
                className="w-full flex items-start gap-2 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors text-left group"
              >
                <div className="shrink-0 mt-0.5">
                  <MiniWaveform peaks={clip.waveformPeaks} color={track.color} />
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1">
                    <span className={`shrink-0 text-[8px] px-1 py-px rounded ${
                      clip.source === 'uploaded'
                        ? 'bg-amber-900/40 text-amber-400'
                        : 'bg-violet-900/40 text-violet-400'
                    }`}>
                      {clip.source === 'uploaded' ? '↑' : 'AI'}
                    </span>
                    <span className="text-[10px] text-zinc-300 truncate">
                      {clip.prompt || track.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-zinc-600 truncate">{track.displayName}</span>
                    <span className="text-[9px] text-zinc-700">·</span>
                    <span className="text-[9px] text-zinc-600">{fmtDuration(clip.duration)}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => handleStar(e, clip.id)}
                  className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                    clip.starred
                      ? 'text-yellow-400 hover:text-yellow-300'
                      : 'text-zinc-700 hover:text-zinc-500 opacity-0 group-hover:opacity-100'
                  }`}
                  title={clip.starred ? 'Remove star' : 'Star this clip'}
                >
                  {clip.starred ? '★' : '☆'}
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import { regenerateClip } from '../../services/generationPipeline';
import { EDGE_HANDLE_PX } from './useClipDrag';

interface ClipVersionNavProps {
  clipId: string;
  activeVersionIdx: number;
  totalVersions: number;
  generationStatus: string;
  metaColor: string;
  hoveredResizeEdge: 'left' | 'right' | null;
}

export function ClipVersionNav({
  clipId,
  activeVersionIdx,
  totalVersions,
  generationStatus,
  metaColor,
  hoveredResizeEdge,
}: ClipVersionNavProps) {
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);

  if (totalVersions < 1) return null;

  return (
    <div
      className="absolute top-0 flex items-center gap-0.5 z-20 transition-opacity duration-100"
      style={{ right: EDGE_HANDLE_PX + 2, opacity: hoveredResizeEdge === 'right' ? 0 : 1 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setActiveVersion(clipId, activeVersionIdx - 1); }}
        disabled={activeVersionIdx <= 0}
        className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
        style={{ color: metaColor }}
        title="Previous version"
      >
        {'\u25C0'}
      </button>
      <span className="text-[8px] font-mono leading-4" style={{ color: metaColor }}>
        {activeVersionIdx + 1}/{totalVersions}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (activeVersionIdx < totalVersions - 1) {
            setActiveVersion(clipId, activeVersionIdx + 1);
          } else {
            regenerateClip(clipId);
          }
        }}
        disabled={generationStatus === 'generating' || generationStatus === 'queued'}
        className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
        style={{ color: metaColor }}
        title={activeVersionIdx >= totalVersions - 1 ? 'Generate new version' : 'Next version'}
      >
        {generationStatus === 'generating' || generationStatus === 'queued'
          ? <span className="inline-block w-2 h-2 border border-white/80 border-t-transparent rounded-full animate-spin" />
          : '\u25B6'}
      </button>
    </div>
  );
}

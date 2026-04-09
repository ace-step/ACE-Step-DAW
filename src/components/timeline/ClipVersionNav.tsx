import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import { EDGE_HANDLE_PX } from './useClipDrag';
import type { ClipGenerationParams } from '../../types/project';

interface ClipVersionNavProps {
  clipId: string;
  activeVersionIdx: number;
  totalVersions: number;
  generationStatus: string;
  metaColor: string;
  hoveredResizeEdge: 'left' | 'right' | null;
  /** Whether this clip is AI-generated and can be regenerated (even without versions yet). */
  canRegenerate?: boolean;
}

export function ClipVersionNav({
  clipId,
  activeVersionIdx,
  totalVersions,
  generationStatus,
  metaColor,
  hoveredResizeEdge,
  canRegenerate,
}: ClipVersionNavProps) {
  const setActiveVersion = useProjectStore((s) => s.setActiveVersion);

  // Show if there are versions OR if the clip can be regenerated
  if (totalVersions < 1 && !canRegenerate) return null;

  return (
    <div
      className="absolute top-0 flex items-center gap-0.5 z-20 transition-opacity duration-100"
      style={{ right: EDGE_HANDLE_PX + 2, opacity: hoveredResizeEdge === 'right' ? 0 : 1 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setActiveVersion(clipId, activeVersionIdx - 1); }}
        disabled={activeVersionIdx <= 0 || totalVersions <= 1}
        className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
        style={{ color: metaColor }}
        title="Previous version"
      >
        {'\u25C0'}
      </button>
      <span className="text-[8px] font-mono leading-4" style={{ color: metaColor }}>
        {totalVersions === 0 ? '1/1' : `${activeVersionIdx + 1}/${totalVersions}`}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (totalVersions > 0 && activeVersionIdx < totalVersions - 1) {
            setActiveVersion(clipId, activeVersionIdx + 1);
          } else {
            void import('../../services/generationPipeline').then(m => m.regenerateClip(clipId)).catch(err => console.error('Failed to regenerate clip', err));
          }
        }}
        disabled={generationStatus === 'generating' || generationStatus === 'queued'}
        className="text-[8px] disabled:opacity-30 px-0.5 leading-4 transition-opacity"
        style={{ color: metaColor }}
        title={totalVersions > 0 && activeVersionIdx < totalVersions - 1 ? 'Next version' : 'Generate new version'}
      >
        {generationStatus === 'generating' || generationStatus === 'queued'
          ? <span className="inline-block w-2 h-2 border border-white/80 border-t-transparent rounded-full animate-spin" />
          : '\u25B6'}
      </button>
    </div>
  );
}

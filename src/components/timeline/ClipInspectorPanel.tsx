/**
 * Clip Inspector Panel — displays metadata, audio metrics, tags,
 * and generation info for the currently selected clip(s).
 *
 * Appears as a bottom panel when toggled via keyboard shortcut (I)
 * or command palette.
 */
import { useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import type { Clip } from '../../types/project';

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, '0')}` : `${secs}s`;
}

function SourceBadge({ source }: { source?: 'generated' | 'uploaded' }) {
  if (!source) return null;
  const isGenerated = source === 'generated';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
        isGenerated
          ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
          : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
      }`}
    >
      {isGenerated ? '✦ Generated' : '↑ Uploaded'}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="text-[10px] text-zinc-200 font-mono">{value}</span>
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-zinc-700/50 text-zinc-300 border border-zinc-600/40">
      {tag}
    </span>
  );
}

// ─── Multi-selection summary ───────────────────────────────────────────────

function MultiClipSummary({ clips }: { clips: Clip[] }) {
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const generatedCount = clips.filter((c) => c.source === 'generated').length;
  const uploadedCount = clips.filter((c) => c.source === 'uploaded').length;

  return (
    <div className="p-3 space-y-2">
      <div className="text-[11px] font-medium text-zinc-200">
        {clips.length} clips selected
      </div>
      <MetaRow label="Total duration" value={formatTime(totalDuration)} />
      {generatedCount > 0 && <MetaRow label="Generated" value={generatedCount} />}
      {uploadedCount > 0 && <MetaRow label="Uploaded" value={uploadedCount} />}
    </div>
  );
}

// ─── Single clip detail ────────────────────────────────────────────────────

function ClipDetail({ clip }: { clip: Clip }) {
  const track = useProjectStore((s) =>
    s.project?.tracks.find((t) => t.clips.some((c) => c.id === clip.id)),
  );

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: clip.color ?? track?.color ?? '#71717a' }}
          />
          <span className="text-[11px] font-medium text-zinc-100 truncate">
            {track?.displayName ?? 'Unknown Track'}
          </span>
        </div>
        <SourceBadge source={clip.source} />
      </div>

      {/* Basic info */}
      <div className="space-y-0.5">
        <MetaRow label="Duration" value={formatTime(clip.duration)} />
        <MetaRow label="Start" value={formatTime(clip.startTime)} />
        <MetaRow label="Status" value={clip.generationStatus} />
        {clip.timeStretchRate !== undefined && clip.timeStretchRate !== 1 && (
          <MetaRow label="Speed" value={`${clip.timeStretchRate}x`} />
        )}
        {clip.pitchShift !== undefined && clip.pitchShift !== 0 && (
          <MetaRow label="Pitch shift" value={`${clip.pitchShift > 0 ? '+' : ''}${clip.pitchShift} st`} />
        )}
      </div>

      {/* Inferred metadata */}
      {clip.inferredMetas && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
            Analysis
          </div>
          <MetaRow label="BPM" value={clip.inferredMetas.bpm} />
          <MetaRow label="Key" value={clip.inferredMetas.keyScale} />
          <MetaRow label="Genre" value={clip.inferredMetas.genres} />
        </div>
      )}

      {/* Generation params */}
      {clip.generationParams && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
            Generation
          </div>
          {clip.generationParams.prompt && (
            <div className="text-[10px] text-zinc-300 bg-zinc-800/50 rounded px-2 py-1 break-words leading-relaxed">
              {clip.generationParams.prompt}
            </div>
          )}
          <MetaRow label="Seed" value={clip.generationParams.seed} />
          <MetaRow label="Steps" value={clip.generationParams.inferenceSteps} />
          <MetaRow label="Guidance" value={clip.generationParams.guidanceScale} />
          {clip.generationParams.negativePrompt && (
            <div className="mt-1">
              <span className="text-[9px] text-zinc-500">Negative: </span>
              <span className="text-[10px] text-zinc-400 italic">
                {clip.generationParams.negativePrompt}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Prompt (fallback if no generationParams) */}
      {!clip.generationParams && clip.prompt && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
            Prompt
          </div>
          <div className="text-[10px] text-zinc-300 bg-zinc-800/50 rounded px-2 py-1 break-words leading-relaxed">
            {clip.prompt}
          </div>
        </div>
      )}

      {/* Tags */}
      {clip.tags && clip.tags.length > 0 && (
        <div>
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {clip.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export function ClipInspectorPanel() {
  const show = useUIStore((s) => s.showClipInspector);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const setShow = useUIStore((s) => s.setShowClipInspector);
  const project = useProjectStore((s) => s.project);

  const selectedClips = useMemo(() => {
    if (!project || selectedClipIds.size === 0) return [];
    return project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => selectedClipIds.has(c.id));
  }, [project, selectedClipIds]);

  if (!show) return null;

  return (
    <div
      data-testid="clip-inspector-panel"
      className="border-t border-[var(--daw-border,#2a2a2e)] bg-[var(--daw-surface,#1a1a1e)] overflow-y-auto"
      style={{ maxHeight: 280 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--daw-border,#2a2a2e)]">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          Clip Inspector
        </span>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-[11px] leading-none px-1"
          aria-label="Close clip inspector"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      {selectedClips.length === 0 && (
        <div className="p-4 text-center text-[10px] text-zinc-500">
          Select a clip to inspect
        </div>
      )}
      {selectedClips.length === 1 && <ClipDetail clip={selectedClips[0]} />}
      {selectedClips.length > 1 && <MultiClipSummary clips={selectedClips} />}
    </div>
  );
}

/**
 * Clip Inspector Panel — displays metadata, audio metrics, tags,
 * and generation info for the currently selected clip(s).
 *
 * Appears as a bottom panel when toggled via keyboard shortcut (Shift+I)
 * or command palette.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getExistingAudioEngine } from '../../hooks/useAudioEngine';
import { computeAudioMetrics, formatLufs, formatDbLevel, formatDbRange } from '../../services/audioMetrics';
import type { Clip } from '../../types/project';
import type { AudioMetrics } from '../../types/clipInspector';

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const totalTenths = Math.round(seconds * 10);
  const mins = Math.floor(totalTenths / 600);
  const remainingTenths = totalTenths % 600;
  const wholeSeconds = Math.floor(remainingTenths / 10);
  const tenths = remainingTenths % 10;
  const secs = `${wholeSeconds}.${tenths}`;
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

function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-zinc-700/50 text-zinc-300 border border-zinc-600/40">
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 text-zinc-500 hover:text-zinc-200 transition-colors leading-none"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

function useAllProjectTags(): string[] {
  const tracks = useProjectStore((s) => s.project?.tracks);
  return useMemo(() => {
    if (!tracks) return [];
    const tagSet = new Set<string>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.tags) clip.tags.forEach((t) => tagSet.add(t));
      }
    }
    return Array.from(tagSet).sort();
  }, [tracks]);
}

function TagInput({ clipId, existingTags }: { clipId: string; existingTags: string[] }) {
  const [value, setValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addClipTag = useProjectStore((s) => s.addClipTag);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);
  const allTags = useAllProjectTags();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue('');
    setShowSuggestions(false);
  }, [clipId]);

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    const lower = value.toLowerCase();
    return allTags.filter(
      (t) => t.toLowerCase().includes(lower) && !existingTags.includes(t),
    );
  }, [value, allTags, existingTags]);

  const handleSubmit = useCallback(() => {
    if (isViewerMode) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    addClipTag(clipId, trimmed);
    setValue('');
    setShowSuggestions(false);
  }, [value, clipId, addClipTag, isViewerMode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setValue('');
    }
  }, [handleSubmit]);

  const handleSuggestionClick = useCallback((tag: string) => {
    if (isViewerMode) return;
    addClipTag(clipId, tag);
    setValue('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [clipId, addClipTag, isViewerMode]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setShowSuggestions(!isViewerMode); }}
        onKeyDown={handleKeyDown}
        onBlur={() => setShowSuggestions(false)}
        onFocus={() => { if (!isViewerMode && value.trim()) setShowSuggestions(true); }}
        placeholder="Add tag..."
        aria-label="Add tag"
        disabled={isViewerMode}
        title={isViewerMode ? 'Tags are read-only in viewer mode' : undefined}
        className="w-full px-1.5 py-0.5 text-[10px] bg-zinc-800/50 border border-zinc-700/50 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500/70"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-0.5 bg-zinc-800 border border-zinc-600/50 rounded shadow-lg max-h-24 overflow-y-auto">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              data-testid="tag-suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSuggestionClick(tag)}
              className="block w-full text-left px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700/50 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
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

// ─── Audio metrics hook ────────────────────────────────────────────────────

/** Module-level cache to avoid re-decoding audio on every selection change. Capped at 32 entries (FIFO eviction). */
const METRICS_CACHE_MAX = 32;
const metricsCache = new Map<string, AudioMetrics>();

function cachePut(key: string, value: AudioMetrics) {
  if (metricsCache.size >= METRICS_CACHE_MAX) {
    // Evict oldest entry (first key in insertion-order Map)
    const oldest = metricsCache.keys().next().value;
    if (oldest !== undefined) metricsCache.delete(oldest);
  }
  metricsCache.set(key, value);
}

function useClipAudioMetrics(clip: Clip): AudioMetrics | null {
  const [metrics, setMetrics] = useState<AudioMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;

    const audioKey = clip.cumulativeMixKey ?? clip.isolatedAudioKey;
    if (!audioKey || clip.generationStatus !== 'ready') {
      setMetrics(null);
      return;
    }

    // Return cached metrics immediately if available
    const cached = metricsCache.get(audioKey);
    if (cached) {
      setMetrics(cached);
      return;
    }

    setMetrics(null);

    // Only decode if audio engine already exists — don't create one just for the inspector
    const engine = getExistingAudioEngine();
    if (!engine) return;

    (async () => {
      try {
        const blob = await loadAudioBlobByKey(audioKey);
        if (cancelled || !blob) return;

        const audioBuffer = await engine.decodeAudioData(blob);
        if (cancelled) return;

        const result = computeAudioMetrics(audioBuffer);
        cachePut(audioKey, result);
        setMetrics(result);
      } catch {
        // Audio decode failures are non-critical — leave metrics null
      }
    })();

    return () => { cancelled = true; };
  }, [clip.id, clip.cumulativeMixKey, clip.isolatedAudioKey, clip.generationStatus]);

  return metrics;
}

function AudioMetricsSection({ metrics }: { metrics: AudioMetrics }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
        Audio Metrics
      </div>
      <MetaRow label="Loudness" value={formatLufs(metrics.lufs)} />
      <MetaRow label="Peak" value={formatDbLevel(metrics.peakDb)} />
      <MetaRow label="RMS" value={formatDbLevel(metrics.rmsDb)} />
      <MetaRow label="Dynamic range" value={formatDbRange(metrics.dynamicRangeDb)} />
      <MetaRow label="Sample rate" value={`${metrics.sampleRate} Hz`} />
      <MetaRow label="Channels" value={metrics.channelCount} />
    </div>
  );
}

// ─── Single clip detail ────────────────────────────────────────────────────

function ClipDetail({ clip }: { clip: Clip }) {
  const track = useProjectStore((s) =>
    s.project?.tracks.find((t) => t.id === clip.trackId),
  );
  const removeClipTag = useProjectStore((s) => s.removeClipTag);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);
  const audioMetrics = useClipAudioMetrics(clip);

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

      {/* Audio metrics */}
      {audioMetrics && <AudioMetricsSection metrics={audioMetrics} />}

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
      <div>
        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
          Tags
        </div>
        {clip.tags && clip.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {clip.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                onRemove={isViewerMode ? undefined : () => removeClipTag(clip.id, tag)}
              />
            ))}
          </div>
        )}
        <TagInput clipId={clip.id} existingTags={clip.tags ?? []} />
      </div>
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
      style={{ height: 280 }}
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

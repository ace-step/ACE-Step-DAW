import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { regenerateTimelineRegion } from '../../services/generationPipeline';

function fmt(s: number) {
  return `${s.toFixed(2)}s`;
}

export function RegionRegenerateModal() {
  const target = useUIStore((s) => s.regionRegenerateTarget);
  const setTarget = useUIStore((s) => s.setRegionRegenerateTarget);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const project = useProjectStore((s) => s.project);

  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');

  useEffect(() => {
    if (target && project) {
      setGlobalCaption(project.globalCaption ?? '');
      setPrompt('');
    }
  }, [target, project]);

  const onClose = useCallback(() => setTarget(null), [setTarget]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    if (!target || isGenerating) return;
    onClose();
    await regenerateTimelineRegion({
      startTime: target.startTime,
      endTime: target.endTime,
      trackIds: target.trackIds,
      prompt,
      globalCaption: globalCaption || undefined,
    });
  }, [target, prompt, globalCaption, isGenerating, onClose]);

  if (!target || !project) return null;

  const affectedTracks = project.tracks.filter((t) => target.trackIds.includes(t.id));
  const readyClipCount = affectedTracks.reduce((count, track) => {
    return count + track.clips.filter((c) => {
      const clipEnd = c.startTime + c.duration;
      const overlapStart = Math.max(target.startTime, c.startTime);
      const overlapEnd = Math.min(target.endTime, clipEnd);
      return overlapEnd > overlapStart && c.generationStatus === 'ready';
    }).length;
  }, 0);

  const totalDur = project.totalDuration;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[460px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Regenerate Region</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-violet-700/60 text-violet-200">
              AI Regen
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Region info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Selected region</p>
            <p className="text-[10px] text-zinc-400 font-mono">
              {fmt(target.startTime)} — {fmt(target.endTime)} ({fmt(target.endTime - target.startTime)} duration)
            </p>
            <p className="text-[10px] text-zinc-400">
              {affectedTracks.length} track{affectedTracks.length !== 1 ? 's' : ''}: {affectedTracks.map((t) => t.displayName ?? t.trackName).join(', ')}
            </p>
            <p className="text-[10px] text-zinc-400">
              {readyClipCount} clip{readyClipCount !== 1 ? 's' : ''} will be regenerated
            </p>
          </div>

          {/* Mini timeline diagram */}
          <div className="bg-[#222]/60 rounded px-3 pt-2 pb-3 border border-[#3a3a3a]">
            <span className="text-[10px] font-medium text-zinc-300 mb-2 block">Region preview</span>
            <div className="relative" style={{ height: '28px' }}>
              <div
                className="absolute inset-x-0 bg-[#333] rounded"
                style={{ top: '12px', height: '4px' }}
              />
              {/* Regeneration region */}
              <div
                className="absolute bg-violet-600/50 border border-violet-500/70 rounded"
                style={{
                  left: `${(target.startTime / totalDur) * 100}%`,
                  width: `${((target.endTime - target.startTime) / totalDur) * 100}%`,
                  top: '6px',
                  height: '16px',
                }}
              />
            </div>
            <div className="flex gap-4 mt-1">
              <span className="flex items-center gap-1 text-[8px] text-violet-400">
                <span className="inline-block w-3 h-2 rounded-sm bg-violet-600/50 border border-violet-500/60" />
                Regeneration region
              </span>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Prompt for this region
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how this section should sound…"
              rows={3}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {/* Global caption */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Global song description
              <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              placeholder="e.g. upbeat pop song…"
              rows={2}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          <p className="text-[9px] text-zinc-600">
            Only clips within the selected region will be regenerated. Original versions are preserved and can be restored.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[#333] hover:bg-[#444] text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || readyClipCount === 0}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              isGenerating || readyClipCount === 0
                ? 'bg-[#444] text-zinc-500 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {isGenerating ? 'Generating…' : `Regenerate ${readyClipCount} Clip${readyClipCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

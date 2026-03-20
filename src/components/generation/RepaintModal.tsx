import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateRepaintClip } from '../../services/generationPipeline';
import { DualRangeSlider } from '../ui/DualRangeSlider';

function fmt(s: number) {
  return `${s.toFixed(2)}s`;
}

export function RepaintModal() {
  const repaintClipId = useUIStore((s) => s.repaintClipId);
  const repaintRange = useUIStore((s) => s.repaintRange);
  const setRepaintModal = useUIStore((s) => s.setRepaintModal);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);

  const clip = repaintClipId ? getClipById(repaintClipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === repaintClipId)) ?? null;

  const clipStart = clip?.startTime ?? 0;
  const clipEnd = (clip?.startTime ?? 0) + (clip?.duration ?? 0);

  const [selStart, setSelStart] = useState(clipStart);
  const [selEnd, setSelEnd] = useState(clipEnd);
  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');

  // Initialise form when clip/range changes
  useEffect(() => {
    if (clip) {
      const rangeStart = repaintRange?.start ?? clip.startTime;
      const rangeEnd = repaintRange?.end ?? (clip.startTime + clip.duration);
      setSelStart(rangeStart);
      setSelEnd(rangeEnd);
      setPrompt(clip.prompt ?? '');
      setGlobalCaption(clip.globalCaption ?? project?.globalCaption ?? '');
    }
  }, [repaintClipId]);

  const onClose = useCallback(() => setRepaintModal(null), [setRepaintModal]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleRangeChange = useCallback((s: number, e: number) => {
    setSelStart(s);
    setSelEnd(e);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!repaintClipId || isGenerating) return;
    onClose();
    await generateRepaintClip({
      clipId: repaintClipId,
      repaintStart: selStart,
      repaintEnd: selEnd,
      prompt,
      globalCaption: globalCaption || undefined,
    });
  }, [repaintClipId, selStart, selEnd, prompt, globalCaption, isGenerating, onClose]);

  if (!repaintClipId || !clip || !track) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const totalDur = project?.totalDuration ?? clipEnd;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[460px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Repaint Selection</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-rose-700/60 text-rose-200">
              Repaint
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
          {/* Clip info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Target clip</p>
            <p className="text-[11px] font-medium text-zinc-200">
              {track.displayName ?? track.trackName}
            </p>
            <p className="text-[10px] text-zinc-400 font-mono">
              Clip: {fmt(clip.startTime)} — {fmt(clip.startTime + clip.duration)}
            </p>
            {!hasAudio && (
              <p className="text-[10px] text-rose-400 mt-1">
                No audio generated yet — generate the clip first.
              </p>
            )}
          </div>

          {/* Repaint range slider constrained to clip bounds */}
          <div className="bg-[#222]/60 rounded px-3 pt-2 pb-3 border border-[#3a3a3a]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-zinc-300">Repaint range</span>
              <span className="text-[10px] font-mono text-rose-300">
                {fmt(selStart)} — {fmt(selEnd)}
              </span>
            </div>
            <DualRangeSlider
              min={clipStart}
              max={clipEnd}
              startValue={selStart}
              endValue={selEnd}
              onChange={handleRangeChange}
              minSpan={0.1}
              step={0.01}
            />
            {/* Mini timeline diagram */}
            <div className="relative mt-3" style={{ height: '28px' }}>
              <div
                className="absolute inset-x-0 bg-[#333] rounded"
                style={{ top: '12px', height: '4px' }}
              />
              {/* Clip region */}
              <div
                className="absolute bg-zinc-600/40 border border-zinc-500/40 rounded"
                style={{
                  left: `${(clipStart / totalDur) * 100}%`,
                  width: `${((clipEnd - clipStart) / totalDur) * 100}%`,
                  top: '6px',
                  height: '16px',
                }}
              />
              {/* Repaint region */}
              <div
                className="absolute bg-rose-600/50 border border-rose-500/70 rounded"
                style={{
                  left: `${(selStart / totalDur) * 100}%`,
                  width: `${((selEnd - selStart) / totalDur) * 100}%`,
                  top: '6px',
                  height: '16px',
                }}
              />
            </div>
            <div className="flex gap-4 mt-1">
              <span className="flex items-center gap-1 text-[8px] text-zinc-500">
                <span className="inline-block w-3 h-2 rounded-sm bg-zinc-600/50 border border-zinc-500/50" />
                Clip
              </span>
              <span className="flex items-center gap-1 text-[8px] text-rose-400">
                <span className="inline-block w-3 h-2 rounded-sm bg-rose-600/50 border border-rose-500/60" />
                Repaint region
              </span>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Prompt for this section
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
            Only the selected range will be regenerated. Audio outside the repaint region is preserved.
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
            disabled={isGenerating || !hasAudio || selEnd <= selStart}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              isGenerating || !hasAudio || selEnd <= selStart
                ? 'bg-[#444] text-zinc-500 cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {isGenerating ? 'Generating…' : 'Repaint Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateCoverClip } from '../../services/generationPipeline';
import { modelSupportsTaskType } from '../../services/aceStepApi';

export function CoverModal() {
  const coverClipId = useUIStore((s) => s.coverClipId);
  const setCoverModal = useUIStore((s) => s.setCoverModal);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);

  const clip = coverClipId ? getClipById(coverClipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === coverClipId)) ?? null;

  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [coverStrength, setCoverStrength] = useState(0.5);
  const [createNew, setCreateNew] = useState(true);

  // Reset form when clip changes
  useEffect(() => {
    if (clip) {
      setCaption(clip.prompt ?? '');
      setLyrics(clip.lyrics ?? '');
      setCoverStrength(0.5);
      setCreateNew(true);
    }
  }, [coverClipId]);

  const onClose = useCallback(() => setCoverModal(null), [setCoverModal]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    if (!coverClipId || isGenerating) return;
    onClose();
    await generateCoverClip({ clipId: coverClipId, caption, lyrics, coverStrength, createNew });
  }, [coverClipId, caption, lyrics, coverStrength, createNew, isGenerating, onClose]);

  if (!coverClipId || !clip || !track) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const coverSupported = modelSupportsTaskType('cover');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[460px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Create Cover</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-700/60 text-amber-200">
              Cover
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
          {/* Source clip info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Source clip</p>
            <p className="text-[11px] font-medium text-zinc-200">
              {track.displayName ?? track.trackName}
            </p>
            <p className="text-[10px] text-zinc-400 truncate">{clip.prompt || '(no prompt)'}</p>
            {!hasAudio && (
              <p className="text-[10px] text-amber-400 mt-1">
                No audio generated yet — generate the clip first before creating a cover.
              </p>
            )}
            {!coverSupported && (
              <p className="text-[10px] text-amber-400 mt-1">
                The currently loaded model does not support cover generation. Load a model that supports the &quot;cover&quot; task type.
              </p>
            )}
          </div>

          {/* Style/caption */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Style description
              <span className="ml-1 normal-case font-normal text-zinc-600">(caption)</span>
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. jazz arrangement, acoustic guitar, slow tempo…"
              rows={3}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {/* Lyrics */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Lyrics
              <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Override lyrics for this cover…"
              rows={3}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent font-mono"
            />
          </div>

          {/* Cover strength */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                Cover strength
              </label>
              <span className="text-[10px] font-mono text-amber-300">{coverStrength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={coverStrength}
              onChange={(e) => setCoverStrength(Number(e.target.value))}
              className="w-full h-1.5 accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
              <span>0.0 — close to original</span>
              <span>1.0 — fully reimagined</span>
            </div>
          </div>

          {/* Create new vs replace */}
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createNew}
                onChange={(e) => setCreateNew(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-daw-accent"
              />
              <span className="text-[10px] text-zinc-400">Create new clip (leave original intact)</span>
            </label>
          </div>
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
            disabled={isGenerating || !hasAudio || !coverSupported}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              isGenerating || !hasAudio || !coverSupported
                ? 'bg-[#444] text-zinc-500 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isGenerating ? 'Generating…' : 'Generate Cover'}
          </button>
        </div>
      </div>
    </div>
  );
}

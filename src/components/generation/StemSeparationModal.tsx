import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { separateClipStems } from '../../services/stemSeparation';
import type { StemCount } from '../../types/api';

const STEM_OPTIONS: Array<{ count: StemCount; title: string; description: string }> = [
  { count: 2, title: '2-Stem', description: 'Vocals + Instrumental' },
  { count: 4, title: '4-Stem', description: 'Vocals, Drums, Bass, Other' },
  { count: 6, title: '6-Stem', description: 'Adds Guitar + Piano isolation' },
];

export function StemSeparationModal() {
  const clipId = useUIStore((s) => s.stemSeparationClipId);
  const setStemSeparationModal = useUIStore((s) => s.setStemSeparationModal);
  const project = useProjectStore((s) => s.project);
  const getClipById = useProjectStore((s) => s.getClipById);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const progress = useGenerationStore((s) => {
    if (!clipId) return '';
    return s.jobs.find((job) => job.clipId === clipId && job.status !== 'done')?.progress ?? '';
  });

  const clip = clipId ? getClipById(clipId) : null;
  const track = project?.tracks.find((candidate) => candidate.clips.some((candidateClip) => candidateClip.id === clipId)) ?? null;
  const [stemCount, setStemCount] = useState<StemCount>(4);

  useEffect(() => {
    setStemCount(4);
  }, [clipId]);

  const onClose = useCallback(() => setStemSeparationModal(null), [setStemSeparationModal]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSeparate = useCallback(async () => {
    if (!clipId || isGenerating) return;
    const succeeded = await separateClipStems(clipId, stemCount);
    if (succeeded) {
      onClose();
    }
  }, [clipId, isGenerating, onClose, stemCount]);

  if (!clipId || !clip || !track) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-[420px] rounded-lg border border-daw-border bg-daw-surface text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Separate Stems</h2>
            <p className="text-[10px] text-zinc-500">{track.displayName} • {clip.duration.toFixed(1)}s</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 transition-colors hover:text-zinc-200" aria-label="Close stem separation dialog">
            ✕
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded border border-[#3a3a3a] bg-[#202020] px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-zinc-500">Source Clip</p>
            <p className="truncate text-[11px] font-medium text-zinc-100">{clip.prompt || '(untitled audio clip)'}</p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Stem Count</p>
            <div className="grid gap-2">
              {STEM_OPTIONS.map((option) => {
                const active = option.count === stemCount;
                return (
                  <button
                    key={option.count}
                    type="button"
                    aria-label={`Choose ${option.title} separation`}
                    onClick={() => setStemCount(option.count)}
                    className={`rounded border px-3 py-2 text-left transition-colors ${active ? 'border-cyan-500 bg-cyan-500/12 text-cyan-100' : 'border-[#3a3a3a] bg-[#202020] text-zinc-200 hover:border-zinc-500'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium">{option.title}</span>
                      <span className="text-[9px] uppercase tracking-wide text-zinc-500">{option.count} tracks</span>
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-400">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {progress && (
            <div className="rounded border border-cyan-900/50 bg-cyan-950/20 px-3 py-2 text-[10px] text-cyan-200">
              {progress}
            </div>
          )}

          {!hasAudio && (
            <div className="rounded border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-300">
              Generate or import audio first. Stem separation requires an existing audio clip.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-daw-border px-4 py-3">
          <button onClick={onClose} className="rounded border border-[#3a3a3a] px-3 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-500">
            Cancel
          </button>
          <button
            onClick={handleSeparate}
            disabled={!hasAudio || isGenerating}
            aria-label="Start stem separation"
            className="rounded bg-cyan-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isGenerating ? 'Separating…' : 'Separate'}
          </button>
        </div>
      </div>
    </div>
  );
}

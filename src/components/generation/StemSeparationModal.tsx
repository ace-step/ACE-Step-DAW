import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGenerationStore } from '../../store/generationStore';
import type { StemCount, StemSeparationEngine } from '../../types/api';
import { getAvailableEngines, getDefaultEngine, ENGINE_DISPLAY_NAMES, ENGINE_DESCRIPTIONS } from '../../services/stemSeparationEngines';

const STEM_OPTIONS: Array<{
  count: StemCount;
  title: string;
  detail: string;
}> = [
  { count: 2, title: '2-Stem', detail: 'Vocals + Instrumental' },
  { count: 4, title: '4-Stem', detail: 'Vocals + Drums + Bass + Other' },
  { count: 6, title: '6-Stem', detail: 'Vocals + Drums + Bass + Guitar + Piano + Other' },
];

function parseProgressPercent(progress: string | undefined): number | null {
  if (!progress) return null;
  const match = progress.match(/(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

export function StemSeparationModal() {
  const stemSeparationClipId = useUIStore((state) => state.stemSeparationClipId);
  const setStemSeparationModal = useUIStore((state) => state.setStemSeparationModal);
  const separateStems = useProjectStore((state) => state.separateStems);
  const getClipById = useProjectStore((state) => state.getClipById);
  const project = useProjectStore((state) => state.project);
  const isGenerating = useGenerationStore((state) => state.isGenerating);
  const activeJob = useGenerationStore((state) => [...state.jobs].reverse().find((job) => job.clipId === stemSeparationClipId));

  const clip = stemSeparationClipId ? getClipById(stemSeparationClipId) : null;
  const track = project?.tracks.find((candidate) => candidate.clips.some((candidateClip) => candidateClip.id === stemSeparationClipId)) ?? null;
  const [stemCount, setStemCount] = useState<StemCount>(4);
  const [engine, setEngine] = useState<StemSeparationEngine>('auto');
  const availableEngines = useMemo(() => getAvailableEngines(stemCount), [stemCount]);

  useEffect(() => {
    setStemCount(4);
    setEngine('auto');
  }, [stemSeparationClipId]);

  // Reset engine to 'auto' when stem count changes and current engine isn't compatible
  useEffect(() => {
    if (!availableEngines.includes(engine)) {
      setEngine(getDefaultEngine(stemCount));
    }
  }, [stemCount, engine, availableEngines]);

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

  useEffect(() => {
    if (activeJob?.status === 'done') {
      onClose();
    }
  }, [activeJob?.status, onClose]);

  const hasAudio = Boolean(clip?.isolatedAudioKey || clip?.cumulativeMixKey);
  const progressPercent = parseProgressPercent(activeJob?.progress);
  const isBusy = activeJob?.status === 'queued' || activeJob?.status === 'generating' || activeJob?.status === 'processing';

  const handleSeparate = useCallback(async () => {
    if (!stemSeparationClipId || !hasAudio || isGenerating) return;
    await separateStems(stemSeparationClipId, stemCount, engine);
  }, [stemSeparationClipId, hasAudio, isGenerating, separateStems, stemCount, engine]);

  if (!stemSeparationClipId || !clip || !track) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[520px] max-w-[calc(100vw-24px)] rounded-xl border border-daw-border bg-daw-surface shadow-2xl text-xs text-zinc-200">
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Separate Stems</h2>
            <p className="mt-1 text-[10px] text-zinc-400">Split one audio clip into isolated remixable tracks.</p>
          </div>
          <button
            type="button"
            aria-label="Close stem separation modal"
            onClick={onClose}
            className="text-base leading-none text-zinc-400 transition-colors hover:text-zinc-200"
          >
            x
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="rounded-lg border border-[#3a3a3a] bg-[#202020] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Source Clip</p>
            <p className="mt-1 text-[11px] font-medium text-zinc-100">{track.displayName}</p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{clip.prompt || 'Imported audio clip'}</p>
            <p className="mt-0.5 text-[10px] text-zinc-400">
              Starts at {clip.startTime.toFixed(2)}s, duration {clip.duration.toFixed(2)}s
            </p>
            {!hasAudio && (
              <p className="mt-2 text-[10px] text-amber-400">
                This clip has no audio yet. Generate or import audio before separating stems.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Stem Count</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {STEM_OPTIONS.map((option) => {
                const selected = option.count === stemCount;
                return (
                  <button
                    key={option.count}
                    type="button"
                    aria-label={`Select ${option.count} stem separation`}
                    onClick={() => setStemCount(option.count)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected
                        ? 'border-sky-400 bg-sky-500/10 text-white'
                        : 'border-[#3a3a3a] bg-[#1d1d1d] text-zinc-300 hover:border-[#525252] hover:bg-[#252525]'
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{option.title}</div>
                    <div className="mt-1 text-[10px] text-zinc-400">{option.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {availableEngines.length > 1 && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Separation Engine</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Separation engine">
                {availableEngines.map((eng) => {
                  const selected = eng === engine;
                  return (
                    <button
                      key={eng}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={ENGINE_DESCRIPTIONS[eng]}
                      onClick={() => setEngine(eng)}
                      className={`rounded-md border px-2.5 py-1.5 text-[10px] transition-colors ${
                        selected
                          ? 'border-sky-400 bg-sky-500/10 text-white'
                          : 'border-[#3a3a3a] bg-[#1d1d1d] text-zinc-300 hover:border-[#525252] hover:bg-[#252525]'
                      }`}
                    >
                      {ENGINE_DISPLAY_NAMES[eng]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-zinc-500">{ENGINE_DESCRIPTIONS[engine]}</p>
            </div>
          )}

          {(isBusy || activeJob?.status === 'error') && (
            <div className="rounded-lg border border-[#3a3a3a] bg-[#202020] px-3 py-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                <span>Progress</span>
                <span>{activeJob?.status ?? 'queued'}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#111]">
                <div
                  className={`h-full rounded-full transition-all ${
                    activeJob?.status === 'error' ? 'bg-red-500' : 'bg-sky-400'
                  } ${progressPercent === null && activeJob?.status !== 'error' ? 'animate-pulse w-1/2' : ''}`}
                  style={progressPercent !== null ? { width: `${progressPercent}%` } : undefined}
                />
              </div>
              <p className={`mt-2 text-[10px] ${activeJob?.status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>
                {activeJob?.progress ?? 'Waiting…'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-daw-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#444] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-[#5a5a5a] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label="Run stem separation"
            onClick={handleSeparate}
            disabled={!hasAudio || isGenerating}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isBusy ? 'Separating…' : `Separate ${stemCount} Stems`}
          </button>
        </div>
      </div>
    </div>
  );
}

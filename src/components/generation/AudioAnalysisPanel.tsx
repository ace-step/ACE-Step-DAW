import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGenerationStore } from '../../store/generationStore';
import { useAnalysisStore } from '../../store/analysisStore';
import * as api from '../../services/aceStepApi';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { analyzeClipLocally } from '../../services/localAnalysisService';
import type { TaskResultItem } from '../../types/api';
import type { LocalAnalysisResult, ChordEvent } from '../../types/analysis';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../../constants/defaults';

type AnalysisMode = 'local' | 'server';

interface ServerAnalysisResult {
  bpm: number | undefined;
  keyScale: string | undefined;
  timeSignature: string | undefined;
  genres: string | undefined;
  caption: string | undefined;
}

export function AudioAnalysisPanel() {
  const analysisClipId = useUIStore((s) => s.analysisClipId);
  const setAnalysisPanel = useUIStore((s) => s.setAnalysisPanel);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  const clip = analysisClipId ? getClipById(analysisClipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === analysisClipId)) ?? null;

  const [mode, setMode] = useState<AnalysisMode>('local');
  const [analyzing, setAnalyzing] = useState(false);
  const [serverResult, setServerResult] = useState<ServerAnalysisResult | null>(null);
  const [localResult, setLocalResult] = useState<LocalAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  // Local analysis progress from store
  const analysisJob = useAnalysisStore((s) =>
    analysisClipId ? s.getJobForClip(analysisClipId) : undefined,
  );

  // Reset when clip changes
  useEffect(() => {
    setServerResult(null);
    setLocalResult(null);
    setError('');
    setApplied(false);
    setAnalyzing(false);
  }, [analysisClipId]);

  const onClose = useCallback(() => setAnalysisPanel(null), [setAnalysisPanel]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // ---------- Local analysis ----------
  const handleLocalAnalyze = useCallback(async () => {
    if (!clip || !analysisClipId || analyzing) return;
    setAnalyzing(true);
    setError('');
    setLocalResult(null);

    try {
      const result = await analyzeClipLocally(analysisClipId);
      setLocalResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Local analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [clip, analysisClipId, analyzing]);

  // ---------- Server analysis ----------
  const handleServerAnalyze = useCallback(async () => {
    if (!clip || analyzing || isGenerating) return;
    setAnalyzing(true);
    setError('');
    setServerResult(null);

    try {
      let audioBlob: Blob | null = null;
      if (clip.isolatedAudioKey) {
        audioBlob = (await loadAudioBlobByKey(clip.isolatedAudioKey)) ?? null;
      }
      if (!audioBlob && clip.cumulativeMixKey) {
        audioBlob = (await loadAudioBlobByKey(clip.cumulativeMixKey)) ?? null;
      }
      if (!audioBlob) {
        setError('No audio available to analyze');
        return;
      }

      const coverParams = {
        task_type: 'cover' as const,
        caption: 'analyze audio properties',
        lyrics: '',
        audio_cover_strength: 0.0,
        audio_duration: clip.duration,
        inference_steps: 10,
        guidance_scale: 1.0,
        shift: 1.0,
        batch_size: 1,
        audio_format: 'wav' as const,
        thinking: false,
        model: project?.generationDefaults.model ?? '',
      };

      const releaseResp = await api.releaseLegoTask(audioBlob, coverParams);
      const taskId = releaseResp.task_id;

      const startTime = Date.now();
      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const entries = await api.queryResult([taskId]);
        const entry = entries?.[0];
        if (!entry) continue;

        if (entry.status === 1) {
          const items: TaskResultItem[] = JSON.parse(entry.result);
          const first = items?.[0];
          if (first) {
            setServerResult({
              bpm: first.metas?.bpm,
              keyScale: first.metas?.keyscale,
              timeSignature: first.metas?.timesignature,
              genres: first.metas?.genres,
              caption: first.prompt || undefined,
            });
          } else {
            setError('No analysis results returned');
          }
          return;
        } else if (entry.status === 2) {
          setError(`Analysis failed: ${entry.result}`);
          return;
        }
      }
      setError('Analysis timed out');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [clip, analyzing, isGenerating, project]);

  const handleAnalyze = mode === 'local' ? handleLocalAnalyze : handleServerAnalyze;

  const handleApplyToProject = useCallback(() => {
    if (!project) return;
    const updates: Record<string, unknown> = {};
    if (mode === 'local' && localResult) {
      if (localResult.bpm) updates.bpm = Math.round(localResult.bpm);
      if (localResult.keyScale) updates.keyScale = localResult.keyScale;
    } else if (mode === 'server' && serverResult) {
      if (serverResult.bpm) updates.bpm = Math.round(serverResult.bpm);
      if (serverResult.keyScale) updates.keyScale = serverResult.keyScale;
    }
    if (Object.keys(updates).length > 0) {
      useProjectStore.getState().updateProject(updates as { bpm?: number; keyScale?: string });
      setApplied(true);
    }
  }, [mode, localResult, serverResult, project]);

  if (!analysisClipId || !clip || !track) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const existingMetas = clip.inferredMetas;
  const hasResult = mode === 'local' ? !!localResult : !!serverResult;
  const hasBpmOrKey = mode === 'local'
    ? !!(localResult?.bpm || localResult?.keyScale)
    : !!(serverResult?.bpm || serverResult?.keyScale);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[420px] max-h-[80vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Audio Analysis</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-cyan-700/60 text-cyan-200">
              Analyze
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Mode selector */}
          <div className="flex gap-1 p-0.5 bg-[#1a1a1a] rounded-md border border-[#333]">
            <button
              onClick={() => setMode('local')}
              className={`flex-1 px-3 py-1.5 rounded text-[10px] font-medium transition-colors ${
                mode === 'local'
                  ? 'bg-cyan-700/60 text-cyan-200'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Local (Browser)
            </button>
            <button
              onClick={() => setMode('server')}
              className={`flex-1 px-3 py-1.5 rounded text-[10px] font-medium transition-colors ${
                mode === 'server'
                  ? 'bg-cyan-700/60 text-cyan-200'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Server
            </button>
          </div>

          {/* Source clip info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Clip</p>
            <p className="text-[11px] font-medium text-zinc-200">
              {track.displayName ?? track.trackName}
            </p>
            <p className="text-[10px] text-zinc-400 truncate">{clip.prompt || '(no prompt)'}</p>
            <p className="text-[10px] text-zinc-400">{clip.duration.toFixed(1)}s</p>
          </div>

          {/* Local analysis progress */}
          {mode === 'local' && analyzing && analysisJob && (
            <div className="bg-[#1a1c20]/60 rounded px-3 py-2.5 border border-cyan-900/40 space-y-1.5">
              <p className="text-[10px] text-cyan-400 uppercase tracking-wide font-medium">
                Analyzing...
              </p>
              <div className="w-full h-1.5 bg-[#333] rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                  style={{ width: `${analysisJob.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400">{analysisJob.message}</p>
            </div>
          )}

          {/* Existing inferred metas */}
          {existingMetas && (
            <div className="bg-[#1a2a1a]/60 rounded px-3 py-2.5 border border-emerald-900/40 space-y-1">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wide font-medium">
                Previously Inferred
                {existingMetas.analysisSource && (
                  <span className="ml-1 text-[9px] text-emerald-600">
                    ({existingMetas.analysisSource})
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {existingMetas.bpm && (
                  <div>
                    <span className="text-[10px] text-zinc-400">BPM</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.bpm}</p>
                  </div>
                )}
                {existingMetas.keyScale && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Key</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.keyScale}</p>
                  </div>
                )}
                {existingMetas.timeSignature && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Time Sig</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.timeSignature}</p>
                  </div>
                )}
                {existingMetas.genres && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400">Genre</span>
                    <p className="text-[11px] text-emerald-300">{existingMetas.genres}</p>
                  </div>
                )}
              </div>

              {/* Chord display for local analysis results */}
              {existingMetas.chords && existingMetas.chords.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-900/30">
                  <span className="text-[10px] text-zinc-400">Chords</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {existingMetas.chords.slice(0, 16).map((chord, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-900/40 text-emerald-300 border border-emerald-800/40"
                        title={`${chord.startTime.toFixed(1)}s - ${chord.endTime.toFixed(1)}s`}
                      >
                        {chord.label}
                      </span>
                    ))}
                    {existingMetas.chords.length > 16 && (
                      <span className="text-[10px] text-zinc-500">
                        +{existingMetas.chords.length - 16} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Local analysis results */}
          {mode === 'local' && localResult && (
            <LocalResultDisplay result={localResult} />
          )}

          {/* Server analysis results */}
          {mode === 'server' && serverResult && (
            <div className="bg-[#1a1c20]/60 rounded px-3 py-2.5 border border-cyan-900/40 space-y-1">
              <p className="text-[10px] text-cyan-400 uppercase tracking-wide font-medium">
                Server Results
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {serverResult.bpm && (
                  <div>
                    <span className="text-[10px] text-zinc-400">BPM</span>
                    <p className="text-[11px] font-mono text-cyan-300">{Math.round(serverResult.bpm)}</p>
                  </div>
                )}
                {serverResult.keyScale && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Key</span>
                    <p className="text-[11px] font-mono text-cyan-300">{serverResult.keyScale}</p>
                  </div>
                )}
                {serverResult.timeSignature && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Time Sig</span>
                    <p className="text-[11px] font-mono text-cyan-300">{serverResult.timeSignature}</p>
                  </div>
                )}
                {serverResult.genres && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400">Genre</span>
                    <p className="text-[11px] text-cyan-300">{serverResult.genres}</p>
                  </div>
                )}
                {serverResult.caption && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400">Description</span>
                    <p className="text-[10px] text-cyan-200 leading-relaxed">{serverResult.caption}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-[10px] text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-900/30">
              {error}
            </p>
          )}

          {!hasAudio && (
            <p className="text-[10px] text-amber-400">
              No audio available — generate the clip first before analyzing.
            </p>
          )}

          {mode === 'local' && !analyzing && !localResult && hasAudio && (
            <p className="text-[10px] text-zinc-500">
              Local analysis uses Beat This! for BPM detection and Consonance-ACE for chord recognition.
              Models are downloaded on first use (~23MB total) and cached locally.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[#333] hover:bg-[#444] text-zinc-300 transition-colors"
          >
            Close
          </button>
          <div className="flex gap-2">
            {hasResult && hasBpmOrKey && (
              <button
                onClick={handleApplyToProject}
                disabled={applied}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  applied
                    ? 'bg-emerald-800/40 text-emerald-400 cursor-default'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                }`}
              >
                {applied ? 'Applied' : 'Apply to Project'}
              </button>
            )}
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !hasAudio || (mode === 'server' && isGenerating)}
              className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                analyzing || !hasAudio || (mode === 'server' && isGenerating)
                  ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {analyzing ? 'Analyzing...' : 'Analyze Audio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Local result display component ----------

function LocalResultDisplay({ result }: { result: LocalAnalysisResult }) {
  return (
    <div className="bg-[#1a1c20]/60 rounded px-3 py-2.5 border border-cyan-900/40 space-y-1">
      <p className="text-[10px] text-cyan-400 uppercase tracking-wide font-medium">
        Local Analysis Results
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <span className="text-[10px] text-zinc-400">BPM</span>
          <p className="text-[11px] font-mono text-cyan-300">{Math.round(result.bpm)}</p>
        </div>
        {result.keyScale && (
          <div>
            <span className="text-[10px] text-zinc-400">Key</span>
            <p className="text-[11px] font-mono text-cyan-300">{result.keyScale}</p>
          </div>
        )}
        {result.timeSignature && (
          <div>
            <span className="text-[10px] text-zinc-400">Time Sig</span>
            <p className="text-[11px] font-mono text-cyan-300">{result.timeSignature}</p>
          </div>
        )}
        <div>
          <span className="text-[10px] text-zinc-400">Beats</span>
          <p className="text-[11px] font-mono text-cyan-300">{result.beats.length} detected</p>
        </div>
      </div>

      {/* Chord timeline */}
      {result.chords.length > 0 && (
        <ChordTimeline chords={result.chords} />
      )}
    </div>
  );
}

function ChordTimeline({ chords }: { chords: ChordEvent[] }) {
  // Filter out "N" (no chord) for display
  const displayChords = chords.filter((c) => c.label !== 'N');
  if (displayChords.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-cyan-900/30">
      <span className="text-[10px] text-zinc-400">Chords ({displayChords.length})</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {displayChords.slice(0, 24).map((chord, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-900/40 text-cyan-300 border border-cyan-800/40"
            title={`${chord.startTime.toFixed(1)}s - ${chord.endTime.toFixed(1)}s (${(chord.confidence * 100).toFixed(0)}%)`}
          >
            {chord.label}
          </span>
        ))}
        {displayChords.length > 24 && (
          <span className="text-[10px] text-zinc-500">
            +{displayChords.length - 24} more
          </span>
        )}
      </div>
    </div>
  );
}

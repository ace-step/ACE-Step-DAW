import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGenerationStore } from '../../store/generationStore';
import * as api from '../../services/aceStepApi';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import type { TaskResultItem } from '../../types/api';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../../constants/defaults';

interface AnalysisResult {
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

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  // Reset when clip changes
  useEffect(() => {
    setResult(null);
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

  const handleAnalyze = useCallback(async () => {
    if (!clip || analyzing || isGenerating) return;
    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      // Load clip audio
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

      // Send as a cover task with minimal transformation — we just want the metas back.
      // The cover task returns inferred BPM, key, etc. in the result metas.
      const coverParams = {
        task_type: 'cover' as const,
        caption: 'analyze audio properties',
        lyrics: '',
        audio_cover_strength: 0.0, // No transformation — just analyze
        audio_duration: clip.duration,
        inference_steps: 10, // Minimal steps for fast analysis
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
            setResult({
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

  const handleApplyToProject = useCallback(() => {
    if (!result || !project) return;
    const updates: Record<string, unknown> = {};
    if (result.bpm) updates.bpm = Math.round(result.bpm);
    if (result.keyScale) updates.keyScale = result.keyScale;
    if (Object.keys(updates).length > 0) {
      useProjectStore.getState().updateProject(updates as { bpm?: number; keyScale?: string });
      setApplied(true);
    }
  }, [result, project]);

  if (!analysisClipId || !clip || !track) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);

  // If clip already has inferred metas, show them immediately
  const existingMetas = clip.inferredMetas;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[380px] max-h-[70vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Audio Analysis</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-cyan-700/60 text-cyan-200">
              Analyze
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
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Clip</p>
            <p className="text-[11px] font-medium text-zinc-200">
              {track.displayName ?? track.trackName}
            </p>
            <p className="text-[10px] text-zinc-400 truncate">{clip.prompt || '(no prompt)'}</p>
            <p className="text-[10px] text-zinc-500">{clip.duration.toFixed(1)}s</p>
          </div>

          {/* Existing inferred metas */}
          {existingMetas && (
            <div className="bg-[#1a2a1a]/60 rounded px-3 py-2.5 border border-emerald-900/40 space-y-1">
              <p className="text-[9px] text-emerald-400 uppercase tracking-wide font-medium">Previously Inferred</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {existingMetas.bpm && (
                  <div>
                    <span className="text-[9px] text-zinc-500">BPM</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.bpm}</p>
                  </div>
                )}
                {existingMetas.keyScale && (
                  <div>
                    <span className="text-[9px] text-zinc-500">Key</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.keyScale}</p>
                  </div>
                )}
                {existingMetas.timeSignature && (
                  <div>
                    <span className="text-[9px] text-zinc-500">Time Sig</span>
                    <p className="text-[11px] font-mono text-emerald-300">{existingMetas.timeSignature}</p>
                  </div>
                )}
                {existingMetas.genres && (
                  <div className="col-span-2">
                    <span className="text-[9px] text-zinc-500">Genre</span>
                    <p className="text-[11px] text-emerald-300">{existingMetas.genres}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analysis results */}
          {result && (
            <div className="bg-[#1a1a2a]/60 rounded px-3 py-2.5 border border-cyan-900/40 space-y-1">
              <p className="text-[9px] text-cyan-400 uppercase tracking-wide font-medium">Analysis Results</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {result.bpm && (
                  <div>
                    <span className="text-[9px] text-zinc-500">BPM</span>
                    <p className="text-[11px] font-mono text-cyan-300">{Math.round(result.bpm)}</p>
                  </div>
                )}
                {result.keyScale && (
                  <div>
                    <span className="text-[9px] text-zinc-500">Key</span>
                    <p className="text-[11px] font-mono text-cyan-300">{result.keyScale}</p>
                  </div>
                )}
                {result.timeSignature && (
                  <div>
                    <span className="text-[9px] text-zinc-500">Time Sig</span>
                    <p className="text-[11px] font-mono text-cyan-300">{result.timeSignature}</p>
                  </div>
                )}
                {result.genres && (
                  <div className="col-span-2">
                    <span className="text-[9px] text-zinc-500">Genre</span>
                    <p className="text-[11px] text-cyan-300">{result.genres}</p>
                  </div>
                )}
                {result.caption && (
                  <div className="col-span-2">
                    <span className="text-[9px] text-zinc-500">Description</span>
                    <p className="text-[10px] text-cyan-200 leading-relaxed">{result.caption}</p>
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
            {result && (result.bpm || result.keyScale) && (
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
              disabled={analyzing || !hasAudio || isGenerating}
              className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                analyzing || !hasAudio || isGenerating
                  ? 'bg-[#444] text-zinc-500 cursor-not-allowed'
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

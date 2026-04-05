import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useGenerationStore } from '../store/generationStore';
import { useUIStore, getBottomPanelHeight, isAnyModalOpen } from '../store/uiStore';
import { generateCoverClip } from '../services/generationPipeline';
import { generateRepaintClip } from '../services/generationPipeline';
import { modelSupportsTaskType, isModelInventoryLoaded, isModelReady } from '../services/aceStepApi';
import { useEnhancePlayback } from './useEnhancePlayback';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import type { RepaintMode } from '../types/api';
import type { EnhancementNode } from '../types/enhance';
import type { ConsistencyLevel } from '../components/generation/EnhanceCoverControls';
import type { ResultEntry, ABSide } from '../components/generation/ResultsPanel';
import type { SessionEntry } from '../components/generation/EnhanceHistorySidebar';

const ENHANCER_BASE_BOTTOM = 60;

const CONSISTENCY_VALUES: Record<ConsistencyLevel, number> = {
  low: 0.75,
  medium: 0.5,
  high: 0.25,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useEnhancePanelState() {
  const enhancerOpen = useUIStore((s) => s.enhancerOpen);
  const enhancerTarget = useUIStore((s) => s.enhancerTarget);
  const closeEnhancer = useUIStore((s) => s.closeEnhancer);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);
  const bottomPanelHeight = useUIStore(getBottomPanelHeight);
  const dynamicBottom = ENHANCER_BASE_BOTTOM + bottomPanelHeight;

  const clip = enhancerTarget ? getClipById(enhancerTarget.clipId) : null;
  const track = enhancerTarget
    ? project?.tracks.find((t) => t.id === enhancerTarget.trackId) ?? null
    : null;

  // Local mode state
  const [mode, setMode] = useState<'cover' | 'repaint'>('cover');

  // Cover fields
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [consistency, setConsistency] = useState<ConsistencyLevel>('medium');
  const [createNew, setCreateNew] = useState(true);

  // Repaint fields
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');
  const [repaintMode, setRepaintMode] = useState<RepaintMode>('balanced');
  const [repaintStrength, setRepaintStrength] = useState(0.5);

  // Sessions & results
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCounterRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // A/B comparison
  const [abSide, setAbSide] = useState<ABSide>('A');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  // Mini player selected index
  const [miniPlayerIdx, setMiniPlayerIdx] = useState(0);

  // Quick Styles section
  const [quickStylesOpen, setQuickStylesOpen] = useState(false);

  // Local guard against rapid Generate clicks
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Playback
  const playback = useEnhancePlayback();

  // Enhancement session (iterative chaining)
  const enhancementSession = useUIStore((s) => s.enhancementSession);
  const startEnhancementSession = useUIStore((s) => s.startEnhancementSession);
  const addEnhancementNode = useUIStore((s) => s.addEnhancementNode);
  const setActiveEnhancementNode = useUIStore((s) => s.setActiveEnhancementNode);
  const rollbackToNode = useUIStore((s) => s.rollbackToNode);

  // Track the overridden source audio key when using a result as new source
  const [chainedSourceAudioKey, setChainedSourceAudioKey] = useState<string | null>(null);

  // Source audio key
  const clipAudioKey = clip?.isolatedAudioKey || clip?.cumulativeMixKey || '';
  const sourceAudioKey = chainedSourceAudioKey || clipAudioKey;

  // Initialize form when enhancerTarget changes
  useEffect(() => {
    if (enhancerTarget && clip) {
      setMode(enhancerTarget.mode);
      setCaption(clip.prompt ?? '');
      setLyrics(clip.lyrics ?? '');
      setConsistency('medium');
      setCreateNew(true);

      const clipStart = clip.startTime ?? 0;
      const clipEnd = (clip.startTime ?? 0) + (clip.duration ?? 0);
      const rangeStart = enhancerTarget.range?.start ?? clipStart;
      const rangeEnd = enhancerTarget.range?.end ?? clipEnd;
      setSelStart(rangeStart);
      setSelEnd(rangeEnd);
      setPrompt(clip.prompt ?? '');
      setGlobalCaption(clip.globalCaption ?? project?.globalCaption ?? '');
      setRepaintMode('balanced');
      setRepaintStrength(0.5);

      const sessionId = `session-${Date.now()}`;
      sessionCounterRef.current = 1;
      setSessions([{ id: sessionId, label: 'Enhancement 1', timestamp: Date.now() }]);
      setActiveSessionId(sessionId);
      setResults([]);
      setAbSide('A');
      setSelectedResultId(null);
      setMiniPlayerIdx(0);
      setChainedSourceAudioKey(null);

      const currentSession = useUIStore.getState().enhancementSession;
      if (!currentSession || currentSession.clipId !== enhancerTarget.clipId) {
        startEnhancementSession(enhancerTarget.clipId);
      }
    }
  }, [enhancerTarget?.clipId]);

  // Stop playback when panel closes
  useEffect(() => {
    if (!enhancerOpen) {
      playback.stopPlayback();
    }
  }, [enhancerOpen, playback.stopPlayback]);

  // Focus management
  useEffect(() => {
    if (!enhancerOpen) return;
    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAnyModalOpen()) return;
        e.stopPropagation();
        closeEnhancer();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [enhancerOpen, closeEnhancer]);

  const handleNewSession = useCallback(() => {
    sessionCounterRef.current += 1;
    const sessionId = `session-${Date.now()}`;
    const entry: SessionEntry = {
      id: sessionId,
      label: `Enhancement ${sessionCounterRef.current}`,
      timestamp: Date.now(),
    };
    setSessions((prev) => [entry, ...prev]);
    setActiveSessionId(sessionId);
    if (clip) {
      setCaption(clip.prompt ?? '');
      setLyrics(clip.lyrics ?? '');
      setPrompt(clip.prompt ?? '');
    }
    setConsistency('medium');
    setRepaintMode('balanced');
    setRepaintStrength(0.5);
    setResults([]);
    setSelectedResultId(null);
    setMiniPlayerIdx(0);
  }, [clip]);

  const handleRangeChange = useCallback((s: number, e: number) => {
    setSelStart(s);
    setSelEnd(e);
  }, []);

  const finalizeResult = useCallback(async (resultId: string, originalClipId: string, newClipId?: string) => {
    const store = useProjectStore.getState();
    const targetId = newClipId ?? originalClipId;
    let updatedClip = store.getClipById(targetId);
    let audioKey = updatedClip?.isolatedAudioKey || updatedClip?.cumulativeMixKey || '';

    if (!audioKey && !newClipId && enhancerTarget) {
      const track = store.project?.tracks.find((t) => t.id === enhancerTarget.trackId);
      if (track) {
        const readyClip = [...track.clips]
          .reverse()
          .find((c) => c.id !== originalClipId && (c.isolatedAudioKey || c.cumulativeMixKey));
        if (readyClip) {
          updatedClip = readyClip;
          audioKey = readyClip.isolatedAudioKey || readyClip.cumulativeMixKey || '';
        }
      }
    }
    if (!audioKey) {
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: 'No audio key found for result' } : r,
      ));
      return;
    }

    try {
      const buffer = await playback.loadBuffer(audioKey);
      if (!buffer) {
        setResults((prev) => prev.map((r) =>
          r.id === resultId ? { ...r, status: 'error' as const, error: 'Failed to load audio buffer' } : r,
        ));
        return;
      }
      const peaks = computeWaveformPeaks(buffer, 60);
      const dur = buffer.duration;
      const finalClipId = updatedClip?.id ?? originalClipId;
      setResults((prev) => prev.map((r) =>
        r.id === resultId
          ? { ...r, clipId: finalClipId, audioKey, peaks, duration: formatDuration(dur), durationSec: dur, status: 'ready' as const }
          : r,
      ));
      setSelectedResultId((prev) => prev ?? resultId);
      setMiniPlayerIdx((prev) => {
        if (prev === 0) return Math.max(0, results.length);
        return prev;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Audio decode failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    }
  }, [playback, results.length, enhancerTarget]);

  const handleCoverGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating || isSubmitting) return;
    setIsSubmitting(true);
    const coverStrength = CONSISTENCY_VALUES[consistency];
    const resultId = `result-${Date.now()}`;
    setResults((prev) => [...prev, {
      id: resultId, clipId: enhancerTarget.clipId, audioKey: '', title: caption || 'Untitled enhancement',
      duration: '--:--', durationSec: 0, peaks: [], timestamp: Date.now(), status: 'generating',
    }]);
    try {
      const newClipId = await generateCoverClip({
        clipId: enhancerTarget.clipId, caption, lyrics, coverStrength, createNew,
        sourceAudioOverride: chainedSourceAudioKey || undefined,
      });
      await finalizeResult(resultId, enhancerTarget.clipId, newClipId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enhancement failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    } finally {
      setIsSubmitting(false);
    }
  }, [enhancerTarget, caption, lyrics, consistency, createNew, isGenerating, isSubmitting, chainedSourceAudioKey, finalizeResult]);

  const handleRepaintGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating || isSubmitting) return;
    setIsSubmitting(true);
    const resultId = `result-${Date.now()}`;
    setResults((prev) => [...prev, {
      id: resultId, clipId: enhancerTarget.clipId, audioKey: '', title: prompt || 'Untitled repaint',
      duration: '--:--', durationSec: 0, peaks: [], timestamp: Date.now(), status: 'generating',
    }]);
    try {
      const newClipId = await generateRepaintClip({
        clipId: enhancerTarget.clipId, repaintStart: selStart, repaintEnd: selEnd, prompt,
        globalCaption: globalCaption || undefined, repaintMode, repaintStrength,
        sourceAudioOverride: chainedSourceAudioKey || undefined,
      });
      await finalizeResult(resultId, enhancerTarget.clipId, newClipId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Repaint failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    } finally {
      setIsSubmitting(false);
    }
  }, [enhancerTarget, selStart, selEnd, prompt, globalCaption, repaintMode, repaintStrength, isGenerating, isSubmitting, chainedSourceAudioKey, finalizeResult]);

  const handleGenerate = mode === 'cover' ? handleCoverGenerate : handleRepaintGenerate;

  const handleSourcePlay = useCallback(() => {
    if (!sourceAudioKey) return;
    playback.togglePlay('source', sourceAudioKey);
  }, [sourceAudioKey, playback]);

  const handleSourceSeek = useCallback((progress: number) => {
    if (!sourceAudioKey) return;
    playback.seek('source', sourceAudioKey, progress);
  }, [sourceAudioKey, playback]);

  const handleResultPlay = useCallback((resultId: string, audioKey: string) => {
    if (!audioKey) return;
    setSelectedResultId(resultId);
    playback.togglePlay(resultId, audioKey);
  }, [playback]);

  const handleABToggle = useCallback(() => {
    const nextSide: ABSide = abSide === 'A' ? 'B' : 'A';
    setAbSide(nextSide);
    const selectedResult = results.find((r) => r.id === selectedResultId);
    if (nextSide === 'A' && sourceAudioKey) {
      playback.play('source', sourceAudioKey, playback.progress);
    } else if (nextSide === 'B' && selectedResult?.audioKey) {
      playback.play(selectedResult.id, selectedResult.audioKey, playback.progress);
    }
  }, [abSide, results, selectedResultId, sourceAudioKey, playback]);

  const handleUseAsSource = useCallback((result: ResultEntry) => {
    if (!result.audioKey || !enhancerTarget) return;
    addEnhancementNode({
      parentId: enhancementSession?.activeNodeId ?? null,
      clipId: result.clipId, audioKey: result.audioKey, mode,
      params: mode === 'cover'
        ? { caption, lyrics, coverStrength: CONSISTENCY_VALUES[consistency] }
        : { repaintRange: { start: selStart, end: selEnd }, repaintMode, repaintStrength },
      label: result.title,
    });
    setChainedSourceAudioKey(result.audioKey);
    handleNewSession();
  }, [enhancerTarget, enhancementSession, addEnhancementNode, mode, caption, lyrics, consistency, selStart, selEnd, repaintMode, repaintStrength, handleNewSession]);

  const handleVersionTreeClick = useCallback((node: EnhancementNode) => {
    rollbackToNode(node.id);
    setChainedSourceAudioKey(node.audioKey);
  }, [rollbackToNode]);

  const handleVersionTreeOriginal = useCallback(() => {
    setChainedSourceAudioKey(null);
    setActiveEnhancementNode(null);
  }, [setActiveEnhancementNode]);

  const versionTreeRoots = useMemo(() => {
    if (!enhancementSession) return [];
    return enhancementSession.nodes.filter((n) => n.parentId === null);
  }, [enhancementSession]);

  const getNodeChildren = useCallback((parentId: string): EnhancementNode[] => {
    if (!enhancementSession) return [];
    return enhancementSession.nodes.filter((n) => n.parentId === parentId);
  }, [enhancementSession]);

  // Mini player controls
  const miniResult = results[miniPlayerIdx] ?? null;

  const handleMiniPrev = useCallback(() => {
    setMiniPlayerIdx((prev) => Math.max(0, prev - 1));
  }, []);

  const handleMiniNext = useCallback(() => {
    setMiniPlayerIdx((prev) => Math.min(results.length - 1, prev + 1));
  }, [results.length]);

  const handleMiniPlay = useCallback(() => {
    if (!miniResult?.audioKey) return;
    setSelectedResultId(miniResult.id);
    playback.togglePlay(miniResult.id, miniResult.audioKey);
  }, [miniResult, playback]);

  const handleMiniSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!miniResult?.audioKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSelectedResultId(miniResult.id);
    playback.seek(miniResult.id, miniResult.audioKey, progress);
  }, [miniResult, playback]);

  // Derived values
  const hasAudio = !!(clip?.isolatedAudioKey || clip?.cumulativeMixKey);
  const inventoryLoaded = isModelInventoryLoaded();
  const modelReady = isModelReady();
  const coverSupported = modelSupportsTaskType('cover');
  const repaintSupported = modelSupportsTaskType('repaint');
  const modeSupported = mode === 'cover' ? coverSupported : repaintSupported;
  const canGenerate = hasAudio && modeSupported && !isGenerating && !isSubmitting && !!(clip && track);
  const clipStart = clip?.startTime ?? 0;
  const accentColor = mode === 'cover' ? '#14b8a6' : '#f43f5e';
  const accentBg = mode === 'cover' ? 'bg-teal-600' : 'bg-rose-600';
  const accentBgHover = mode === 'cover' ? 'hover:bg-teal-500' : 'hover:bg-rose-500';
  const sourcePeaks = clip?.waveformPeaks ?? [];
  const sourceIsPlaying = playback.playingId === 'source';
  const sourceProgress = sourceIsPlaying ? playback.progress : 0;
  const selectedResult = results.find((r) => r.id === selectedResultId);
  const canAB = hasAudio && !!selectedResult?.audioKey;
  const miniIsPlaying = miniResult ? playback.playingId === miniResult.id : false;
  const miniProgress = miniIsPlaying ? playback.progress : 0;

  return {
    // UI state
    enhancerOpen, enhancerTarget, closeEnhancer, dynamicBottom, panelRef,
    // Data
    clip, track, project, mode, setMode, isGenerating, isSubmitting,
    // Cover fields
    caption, setCaption, lyrics, setLyrics, consistency, setConsistency, createNew, setCreateNew,
    quickStylesOpen, setQuickStylesOpen,
    // Repaint fields
    selStart, selEnd, prompt, setPrompt, globalCaption, setGlobalCaption,
    repaintMode, setRepaintMode, repaintStrength, setRepaintStrength,
    // Sessions
    sessions, activeSessionId, setActiveSessionId,
    // Results
    results, selectedResultId, setSelectedResultId, miniPlayerIdx, setMiniPlayerIdx,
    // A/B
    abSide,
    // Chaining
    chainedSourceAudioKey,
    // Enhancement session
    enhancementSession, versionTreeRoots, getNodeChildren,
    // Derived
    hasAudio, inventoryLoaded, modelReady, modeSupported, canGenerate, clipStart,
    accentColor, accentBg, accentBgHover, sourcePeaks, sourceIsPlaying, sourceProgress,
    canAB, miniResult, miniIsPlaying, miniProgress,
    // Playback
    playback,
    // Handlers
    handleGenerate, handleSourcePlay, handleSourceSeek, handleResultPlay,
    handleABToggle, handleUseAsSource, handleNewSession, handleRangeChange,
    handleVersionTreeClick, handleVersionTreeOriginal,
    handleMiniPrev, handleMiniNext, handleMiniPlay, handleMiniSeek,
  };
}

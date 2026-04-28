import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateFromAddLayer, resolveContextWindow } from '../../services/generationPipeline';
import { toastError } from '../../hooks/useToast';
import { extractContextAudioLazy } from '../../services/lazyContextAudioExtractor';
import type { TrackName } from '../../types/project';
import { TRACK_CATALOG, TRACK_NAMES } from '../../constants/tracks';
import {
  getFirstSelectedEmptyTrackSlotIndex,
  parseArrangementEmptyTrackSlotIndex,
} from '../arrangement/trackSlotLayout';
import { TimbrePresetPicker } from './TimbrePresetPicker';

const VOCAL_TRACK_NAMES = new Set<string>(['vocals', 'backing_vocals']);
const TARGET_TRACK_OPTIONS = TRACK_NAMES.map((trackName) => TRACK_CATALOG[trackName]);

type PanelPosition = { left: number; top: number };

const PANEL_WIDTH = 480;
const PANEL_MARGIN = 16;
const PANEL_BOTTOM_GAP = 120;
const FALLBACK_PANEL_HEIGHT = 680;

type SelectWindow = NonNullable<ReturnType<typeof useUIStore.getState>['selectWindow']>;

function fmt(s: number) {
  return `${s.toFixed(1)}s`;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getAudioTargetTracks(project: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>) {
  return project.tracks.filter((track) => !track.isGroup && (track.trackType === undefined || track.trackType === 'stems' || track.trackType === 'sample'));
}

function getSelectedProjectTrack(
  project: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>,
  selectWindow: SelectWindow | null,
) {
  if (!selectWindow) return null;
  if (selectWindow.primaryTrackId !== undefined) {
    return project.tracks.find((track) => track.id === selectWindow.primaryTrackId) ?? null;
  }
  return project.tracks.find((track) => selectWindow.trackIds.includes(track.id)) ?? null;
}

function getSelectedEmptyTrackOrder(
  selectWindow: SelectWindow | null,
) {
  if (!selectWindow) return null;
  if (typeof selectWindow.targetRowIndex === 'number' && Number.isFinite(selectWindow.targetRowIndex)) {
    return selectWindow.targetRowIndex + 1;
  }
  if (selectWindow.primaryTrackId) {
    const primaryEmptySlotIndex = parseArrangementEmptyTrackSlotIndex(selectWindow.primaryTrackId);
    if (primaryEmptySlotIndex !== null) {
      return primaryEmptySlotIndex + 1;
    }
  }

  const slotIndex = getFirstSelectedEmptyTrackSlotIndex(selectWindow.trackIds);
  if (slotIndex === null) return null;

  return slotIndex + 1;
}

function getDefaultTargetTrackName(
  project: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>,
  selectWindow: SelectWindow | null,
) : TrackName {
  const targetTracks = getAudioTargetTracks(project);
  if (targetTracks.length === 0) return 'drums';

  const selectedTrackIds = selectWindow?.primaryTrackId
    ? [selectWindow.primaryTrackId]
    : (selectWindow?.trackIds ?? []);
  const selectedTracks = targetTracks.filter((track) => selectedTrackIds.includes(track.id));
  const selectedPresetTrack = selectedTracks.find((track) => track.trackName !== 'custom');

  if (selectedPresetTrack) return selectedPresetTrack.trackName;
  if (selectedTracks.length > 0 && selectedTracks[0].trackName !== 'custom') return selectedTracks[0].trackName;

  const firstInstrumentTrack = targetTracks.find((track) => track.trackName !== 'custom' && !VOCAL_TRACK_NAMES.has(track.trackName));
  const fallbackTrack = firstInstrumentTrack ?? targetTracks.find((track) => track.trackName !== 'custom');
  return fallbackTrack?.trackName ?? 'drums';
}

function clampPanelPosition(position: PanelPosition, width: number, height: number): PanelPosition {
  const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
  const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

  return {
    left: Math.min(Math.max(PANEL_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(PANEL_MARGIN, position.top), maxTop),
  };
}

function keepPositionIfUnchanged(currentPosition: PanelPosition | null, nextPosition: PanelPosition) {
  if (currentPosition && currentPosition.left === nextPosition.left && currentPosition.top === nextPosition.top) {
    return currentPosition;
  }
  return nextPosition;
}

export function AddLayerPanel() {
  const isOpen = useUIStore((s) => s.addLayerOpen);
  const setAddLayerOpen = useUIStore((s) => s.setAddLayerOpen);
  const editingClipId = useUIStore((s) => s.editingLegoClipId);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const contextWindow = useUIStore((s) => s.contextWindow);

  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  // Resolve editing clip and its track
  const editingClip = useMemo(() => {
    if (!editingClipId || !project) return null;
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === editingClipId);
      if (clip) return { clip, track };
    }
    return null;
  }, [editingClipId, project]);
  const isEditMode = editingClip !== null;

  const [targetTrackName, setTargetTrackName] = useState<TrackName>('drums');
  const [style, setStyle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');

  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('explicit');
  const [seedValue, setSeedValue] = useState('');
  const [useRandomSeed, setUseRandomSeed] = useState(true);

  // Context audio preview
  type PreviewState = 'idle' | 'loading' | 'playing';
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const scrubIntervalRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const wasOpenRef = useRef(false);
  const [savedSelectionBeforeWholeSong, setSavedSelectionBeforeWholeSong] = useState<{
    startTime: number;
    endTime: number;
    trackIds: string[];
    primaryTrackId?: string;
    targetRowIndex?: number;
  } | null>(null);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const audioTargetTracks = useMemo(() => (project ? getAudioTargetTracks(project) : []), [project]);
  const selectedTargetTrack = audioTargetTracks.find((track) => track.trackName === targetTrackName) ?? null;
  const selectedTargetTrackInfo = TRACK_CATALOG[targetTrackName];
  const selectedWindowTrack = useMemo(
    () => (project ? getSelectedProjectTrack(project, selectWindow) : null),
    [project, selectWindow],
  );
  const selectedEmptyTrackOrder = useMemo(() => getSelectedEmptyTrackOrder(selectWindow), [selectWindow]);

  const positionPanelNearBottomCenter = useCallback(() => {
    if (!panelRef.current) return;

    const width = panelRef.current.offsetWidth || PANEL_WIDTH;
    const height = panelRef.current.offsetHeight || FALLBACK_PANEL_HEIGHT;
    setPanelPosition(
      clampPanelPosition(
        {
          left: (window.innerWidth - width) / 2,
          top: window.innerHeight - height - PANEL_BOTTOM_GAP,
        },
        width,
        height,
      ),
    );
  }, []);

  const stopPreview = useCallback(() => {
    if (scrubIntervalRef.current) {
      clearInterval(scrubIntervalRef.current);
      scrubIntervalRef.current = null;
    }
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewState('idle');
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  useEffect(() => {
    if (!isOpen) {
      setIsDragging(false);
      dragOffsetRef.current = null;
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragOffset = dragOffsetRef.current;
      const panel = panelRef.current;
      if (!dragOffset || !panel) return;

      const width = panel.offsetWidth || PANEL_WIDTH;
      const height = panel.offsetHeight || FALLBACK_PANEL_HEIGHT;
      setPanelPosition(
        clampPanelPosition(
          {
            left: event.clientX - dragOffset.x,
            top: event.clientY - dragOffset.y,
          },
          width,
          height,
        ),
      );
    };

    const stopDragging = () => {
      dragOffsetRef.current = null;
      setIsDragging(false);
    };

    const handleResize = () => {
      if (!panelRef.current) return;
      const width = panelRef.current.offsetWidth || PANEL_WIDTH;
      const height = panelRef.current.offsetHeight || FALLBACK_PANEL_HEIGHT;
      setPanelPosition((currentPosition) => {
        if (!currentPosition) {
          return keepPositionIfUnchanged(
            currentPosition,
            clampPanelPosition(
              {
                left: (window.innerWidth - width) / 2,
                top: window.innerHeight - height - PANEL_BOTTOM_GAP,
              },
              width,
              height,
            ),
          );
        }
        return keepPositionIfUnchanged(
          currentPosition,
          clampPanelPosition(currentPosition, width, height),
        );
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    stopPreview();
    setAddLayerOpen(false);
  }, [stopPreview, setAddLayerOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  // Reset form when panel opens — restore from clip in edit mode
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      if (editingClip) {
        // Edit mode: restore from clip's generation params
        const { clip, track } = editingClip;
        const params = clip.generationParams;
        setTargetTrackName(track.trackName);
        setStyle(params?.prompt ?? clip.prompt ?? '');
        setLyrics(params?.lyrics ?? clip.lyrics ?? '');
        setGlobalCaption(params?.globalCaption ?? clip.globalCaption ?? project?.globalCaption ?? '');
        setSeedValue(params?.seed !== undefined ? String(params.seed) : '');
        setUseRandomSeed(params?.useRandomSeed ?? true);
        setChunkMaskMode('explicit');
        // Restore context window from saved generation params (resolved to current clip position)
        const resolvedCtx = resolveContextWindow(clip);
        if (resolvedCtx) {
          const allAudibleTrackIds = project!.tracks
            .filter((t) => !t.muted && !t.isGroup)
            .map((t) => t.id);
          useUIStore.getState().setContextWindow({
            startTime: resolvedCtx.startTime,
            endTime: resolvedCtx.endTime,
            trackIds: resolvedCtx.trackIds.length > 0 ? resolvedCtx.trackIds : allAudibleTrackIds,
          });
        }
        // Set select window to match clip range
        useUIStore.getState().setSelectWindow({
          startTime: clip.startTime,
          endTime: clip.startTime + clip.duration,
          trackIds: [track.id],
          primaryTrackId: track.id,
        });
      } else {
        // New layer mode: fresh form
        setTargetTrackName(project ? getDefaultTargetTrackName(project, selectWindow) : 'drums');
        setStyle('');
        setLyrics('');
        setGlobalCaption(project?.globalCaption ?? '');
        setSeedValue('');
        setUseRandomSeed(true);
        setChunkMaskMode('explicit');
      }
      setSavedSelectionBeforeWholeSong(null);
      setPanelPosition(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, project, selectWindow, editingClip]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      if (panelPosition === null) {
        positionPanelNearBottomCenter();
        return;
      }

      if (!panelRef.current) return;
      const width = panelRef.current.offsetWidth || PANEL_WIDTH;
      const height = panelRef.current.offsetHeight || FALLBACK_PANEL_HEIGHT;
      setPanelPosition((currentPosition) => {
        if (!currentPosition) return currentPosition;
        return keepPositionIfUnchanged(
          currentPosition,
          clampPanelPosition(currentPosition, width, height),
        );
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, panelPosition, positionPanelNearBottomCenter, targetTrackName]);

  useEffect(() => {
    if (!project || !isOpen) return;
    const hasPresetTarget = TARGET_TRACK_OPTIONS.some((track) => track.name === targetTrackName);
    if (!hasPresetTarget) {
      setTargetTrackName(getDefaultTargetTrackName(project, selectWindow));
    }
  }, [audioTargetTracks, isOpen, project, selectWindow, targetTrackName]);

  const extractPeaks = useCallback(async (blob: Blob, barCount: number) => {
    try {
      // Use OfflineAudioContext for decoding to avoid creating extra AudioContext
      // instances that can hit browser limits and cause silent playback (#1188).
      const arrayBuf = await blob.arrayBuffer();
      const offCtx = new OfflineAudioContext(1, 1, 48000);
      const buf = await offCtx.decodeAudioData(arrayBuf);
      const data = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / barCount));
      const peaks: number[] = [];
      for (let i = 0; i < barCount; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(start + step, data.length);
        for (let j = start; j < end; j++) {
          const abs = Math.abs(data[j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }
      return peaks;
    } catch {
      return [];
    }
  }, []);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') { stopPreview(); return; }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      // trimToContext: blob spans [0, ctxDuration] with no leading silence
      const blob = await extractContextAudioLazy(contextWindow, { trimToContext: true });
      if (!blob) { setPreviewState('idle'); return; }

      const peaks = await extractPeaks(blob, 80);
      setWaveformPeaks(peaks);

      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onloadedmetadata = () => setPreviewDuration(audio.duration);
      audio.onended = () => stopPreview();
      audio.onerror = () => stopPreview();
      scrubIntervalRef.current = window.setInterval(() => {
        if (previewAudioRef.current) setPreviewCurrentTime(previewAudioRef.current.currentTime);
      }, 100);
      await audio.play();
      setPreviewState('playing');
    } catch {
      stopPreview();
    }
  }, [previewState, contextWindow, stopPreview, extractPeaks]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (previewAudioRef.current) previewAudioRef.current.currentTime = t;
    setPreviewCurrentTime(t);
  }, []);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewDuration || previewState === 'idle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relativeT = ratio * previewDuration;
    if (previewAudioRef.current) previewAudioRef.current.currentTime = relativeT;
    setPreviewCurrentTime(relativeT);
  }, [previewDuration, previewState]);

  // Draggable selection mask on the context waveform
  const maskDragRef = useRef<{ edge: 'left' | 'right' | 'move'; startX: number; origStart: number; origEnd: number } | null>(null);

  const handleMaskMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, edge: 'left' | 'right' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    const sw = selectWindow;
    maskDragRef.current = {
      edge,
      startX: e.clientX,
      origStart: sw?.startTime ?? 0,
      origEnd: sw?.endTime ?? 0,
    };
  }, [selectWindow]);

  useEffect(() => {
    if (!contextWindow) return;
    const ctxDuration = contextWindow.endTime - contextWindow.startTime;
    if (ctxDuration <= 0) return;

    const onMove = (e: MouseEvent) => {
      const drag = maskDragRef.current;
      if (!drag) return;
      const container = waveformCanvasRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pxPerSec = rect.width / ctxDuration;
      const deltaSec = (e.clientX - drag.startX) / pxPerSec;
      const sw = selectWindow;

      let newStart = drag.origStart;
      let newEnd = drag.origEnd;

      if (drag.edge === 'left') {
        newStart = Math.max(contextWindow.startTime, Math.min(drag.origEnd - 0.5, drag.origStart + deltaSec));
      } else if (drag.edge === 'right') {
        newEnd = Math.min(contextWindow.endTime, Math.max(drag.origStart + 0.5, drag.origEnd + deltaSec));
      } else {
        const len = drag.origEnd - drag.origStart;
        newStart = drag.origStart + deltaSec;
        newEnd = newStart + len;
        if (newStart < contextWindow.startTime) { newStart = contextWindow.startTime; newEnd = newStart + len; }
        if (newEnd > contextWindow.endTime) { newEnd = contextWindow.endTime; newStart = newEnd - len; }
      }

      const next: SelectWindow = {
        startTime: Math.round(newStart * 10) / 10,
        endTime: Math.round(newEnd * 10) / 10,
        trackIds: sw?.trackIds ?? [],
      };
      if (sw?.primaryTrackId !== undefined) next.primaryTrackId = sw.primaryTrackId;
      if (typeof sw?.targetRowIndex === 'number') next.targetRowIndex = sw.targetRowIndex;
      useUIStore.getState().setSelectWindow(next);
    };

    const onUp = () => { maskDragRef.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [contextWindow, selectWindow]);

  // Compute selection mask position as ratio within context window
  const selMaskRatio = useMemo(() => {
    if (!contextWindow) return null;
    const ctxDur = contextWindow.endTime - contextWindow.startTime;
    if (ctxDur <= 0) return null;
    const sStart = selectWindow?.startTime ?? 0;
    const sEnd = selectWindow?.endTime ?? 0;
    return {
      left: Math.max(0, (sStart - contextWindow.startTime) / ctxDur),
      right: Math.min(1, (sEnd - contextWindow.startTime) / ctxDur),
    };
  }, [contextWindow, selectWindow?.startTime, selectWindow?.endTime]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || waveformPeaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const barCount = waveformPeaks.length;
    const barWidth = Math.max(1, (w / barCount) - 1);
    const gap = 1;
    const maxPeak = Math.max(...waveformPeaks, 0.01);
    // previewCurrentTime and previewDuration are both context-relative (start at 0)
    const progress = previewDuration > 0 ? previewCurrentTime / previewDuration : 0;

    // Draw dim bars outside selection, bright bars inside
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap);
      const barH = Math.max(1, (waveformPeaks[i] / maxPeak) * (h - 4));
      const y = (h - barH) / 2;
      const ratio = i / barCount;
      const inSelection = selMaskRatio ? ratio >= selMaskRatio.left && ratio <= selMaskRatio.right : true;
      const isPlayed = ratio <= progress;
      if (inSelection) {
        ctx.fillStyle = isPlayed ? '#2dd4bf' : '#8ab4ff';
      } else {
        ctx.fillStyle = isPlayed ? '#1a6b5a' : '#333';
      }
      ctx.fillRect(x, y, barWidth, barH);
    }
  }, [waveformPeaks, previewCurrentTime, previewDuration, selMaskRatio]);

  if (!isOpen || !project) return null;

  const showLyrics = VOCAL_TRACK_NAMES.has(targetTrackName);
  const hasContext = contextWindow !== null;

  const startTime = selectWindow?.startTime ?? 0;
  const endTime = selectWindow?.endTime ?? project.totalDuration;
  const duration = endTime - startTime;
  const selectionCoversWholeSong = startTime <= 0 && endTime >= project.totalDuration;

  const handleSelectWholeSong = () => {
    if (selectWindow) {
      const savedSelection: SelectWindow = {
        startTime: selectWindow.startTime,
        endTime: selectWindow.endTime,
        trackIds: [...selectWindow.trackIds],
      };
      if (selectWindow.primaryTrackId !== undefined) {
        savedSelection.primaryTrackId = selectWindow.primaryTrackId;
      }
      if (typeof selectWindow.targetRowIndex === 'number') {
        savedSelection.targetRowIndex = selectWindow.targetRowIndex;
      }
      setSavedSelectionBeforeWholeSong(savedSelection);
    }

    const wholeSongSelection: SelectWindow = {
      startTime: 0,
      endTime: project.totalDuration,
      trackIds: selectWindow?.trackIds ?? [],
    };
    if (selectWindow?.primaryTrackId !== undefined) {
      wholeSongSelection.primaryTrackId = selectWindow.primaryTrackId;
    }
    if (typeof selectWindow?.targetRowIndex === 'number') {
      wholeSongSelection.targetRowIndex = selectWindow.targetRowIndex;
    }
    useUIStore.getState().setSelectWindow(wholeSongSelection);
    setChunkMaskMode('auto');
  };

  const handleRestorePreviousWindow = () => {
    if (!savedSelectionBeforeWholeSong) return;
    useUIStore.getState().setSelectWindow(savedSelectionBeforeWholeSong);
    setSavedSelectionBeforeWholeSong(null);
    setChunkMaskMode('explicit');
  };

  const handleGenerate = async () => {
    stopPreview();

    let trackId: string;

    if (isEditMode && editingClip) {
      // Edit mode: reuse existing track, update clip params
      trackId = editingClip.track.id;
      if (style) setTrackLocalCaption(trackId, style);
      // Update clip text params — contextWindow is persisted by generateFromAddLayer
      useProjectStore.getState().updateClip(editingClip.clip.id, {
        prompt: style,
        globalCaption,
        lyrics: showLyrics ? lyrics : '',
      });
    } else {
      // New layer mode: create or find target track
      let targetTrack = selectedWindowTrack;
      if (!targetTrack) {
        targetTrack = addTrack(
          targetTrackName,
          'stems',
          selectedEmptyTrackOrder !== null ? { order: selectedEmptyTrackOrder } : undefined,
        );
      }
      trackId = targetTrack.id;
      if (style) setTrackLocalCaption(trackId, style);
    }

    useUIStore.getState().setSelectWindow(null);
    setSavedSelectionBeforeWholeSong(null);
    handleClose();

    try {
      await generateFromAddLayer({
        trackId,
        startTime,
        duration,
        localDescription: style,
        globalCaption,
        lyrics: showLyrics ? lyrics : '',
        contextWindow: hasContext ? contextWindow : null,
        chunkMaskMode,
        clipId: isEditMode ? editingClipId ?? undefined : undefined,
      });
    } catch {
      toastError('Generation failed — please try again');
    }
  };

  const handleHeaderMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
    event.preventDefault();
  };

  return (
    <div
      ref={panelRef}
      data-testid="add-layer-panel"
      className={`fixed w-[480px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col bg-[#1e1e22]/98 border border-[#3a3a3a] rounded-2xl shadow-2xl backdrop-blur-md text-xs text-zinc-200 ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{
        zIndex: 60,
        left: panelPosition?.left ?? PANEL_MARGIN,
        top: panelPosition?.top ?? PANEL_MARGIN,
      }}
    >
      {/* Header */}
      <div
        data-testid="add-layer-drag-handle"
        className={`flex items-start justify-between gap-3 px-4 py-3 border-b border-[#3a3a3a] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleHeaderMouseDown}
        aria-label="Drag Add Layer panel"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col gap-1 pt-0.5 text-zinc-500" aria-hidden="true">
            <span className="block h-1 w-5 rounded-full bg-current/70" />
            <span className="block h-1 w-5 rounded-full bg-current/40" />
          </div>
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-white">{isEditMode ? 'Edit Layer' : 'Add a Layer'}</span>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-zinc-500">{fmt(startTime)} - {fmt(endTime)}</span>
              {!selectionCoversWholeSong && (
                <button
                  onClick={handleSelectWholeSong}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="text-teal-400 hover:text-teal-300 transition-colors"
                >
                  Whole song
                </button>
              )}
              {selectionCoversWholeSong && savedSelectionBeforeWholeSong && (
                <button
                  onClick={handleRestorePreviousWindow}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          onMouseDown={(event) => event.stopPropagation()}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {/* Context audio preview — above Target Track */}
        {hasContext && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Context
            </label>
            <div className="rounded-lg bg-blue-950/50 border border-blue-800/40 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-blue-300">
                <span>{fmt(contextWindow.startTime)} — {fmt(contextWindow.endTime)}</span>
                <span>{fmtTime(previewCurrentTime)} / {fmtTime(previewDuration)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviewContext}
                  disabled={previewState === 'loading'}
                  className="w-6 h-6 flex items-center justify-center rounded bg-blue-800/60 hover:bg-blue-700/60 text-blue-200 text-[10px] disabled:opacity-50 shrink-0 transition-colors"
                  title={previewState === 'playing' ? 'Stop preview' : 'Preview context audio'}
                >
                  {previewState === 'loading' ? '\u2026' : previewState === 'playing' ? '\u25A0' : '\u25B6'}
                </button>
                {waveformPeaks.length > 0 ? (
                  <div className="relative flex-1" style={{ minWidth: 0 }} onClick={handleWaveformClick}>
                    <canvas
                      ref={waveformCanvasRef}
                      role="img"
                      aria-label="Layer selection visualization"
                      className="w-full h-8 cursor-pointer rounded"
                    />
                    {/* Draggable selection mask overlay */}
                    {selMaskRatio && (
                      <>
                        {/* Left edge handle */}
                        <div
                          className="absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-teal-400/40"
                          style={{ left: `${selMaskRatio.left * 100}%`, transform: 'translateX(-50%)' }}
                          onMouseDown={(e) => handleMaskMouseDown(e, 'left')}
                        >
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-teal-400" />
                        </div>
                        {/* Center drag area */}
                        <div
                          className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing hover:bg-teal-400/10"
                          style={{ left: `${selMaskRatio.left * 100}%`, width: `${(selMaskRatio.right - selMaskRatio.left) * 100}%` }}
                          onMouseDown={(e) => handleMaskMouseDown(e, 'move')}
                        />
                        {/* Right edge handle */}
                        <div
                          className="absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-teal-400/40"
                          style={{ left: `${selMaskRatio.right * 100}%`, transform: 'translateX(-50%)' }}
                          onMouseDown={(e) => handleMaskMouseDown(e, 'right')}
                        >
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-teal-400" />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <input
                    type="range"
                    min={0}
                    max={previewDuration || 1}
                    step={0.01}
                    value={previewCurrentTime}
                    onChange={handleScrub}
                    disabled={previewState !== 'playing'}
                    className="flex-1 h-1 accent-blue-400 cursor-pointer disabled:opacity-40"
                  />
                )}
              </div>
              {/* Selection range label under waveform */}
              {selMaskRatio && (
                <div className="text-[9px] font-mono text-teal-400/70">
                  Selection: {fmt(startTime)} — {fmt(endTime)}
                </div>
              )}
            </div>
          </div>
        )}
        {!hasContext && (
          <div className="text-[10px] text-zinc-500">
            Context: none (Alt+drag on timeline to set)
          </div>
        )}

        {/* Target Track — compact dropdown */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1.5">
            Target Track
          </label>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: selectedTargetTrackInfo.color }}
              aria-hidden="true"
            />
            <select
              value={targetTrackName}
              onChange={(e) => setTargetTrackName(e.target.value as TrackName)}
              className="flex-1 bg-[#161618] border border-[#333] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-teal-600 appearance-none cursor-pointer"
              aria-label="Target track"
            >
              {TARGET_TRACK_OPTIONS.map((track) => {
                const existingTrack = audioTargetTracks.find((candidate) => candidate.trackName === track.name);
                return (
                  <option key={track.name} value={track.name}>
                    {track.displayName}{existingTrack ? '' : ' (new)'}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1.5">
            <span>
              {selectedWindowTrack
                ? `Generate into selected row: ${selectedWindowTrack.displayName}`
                : `Create a new ${selectedTargetTrackInfo.displayName} track`}
            </span>
          </div>
        </div>

        {/* Stem Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Stem Description
            </label>
          </div>
          <TimbrePresetPicker onSelect={(preset) => setStyle(preset.promptTemplate)} />
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Describe the sound..."
            rows={2}
            className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
          />
        </div>

        {/* Lyrics (vocal tracks only) */}
        {showLyrics && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Lyrics
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Song lyrics..."
              rows={3}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600 font-mono"
            />
          </div>
        )}

        {/* Mask mode + Seed + Global caption — exposed inline */}
        <div className="border-t border-[#3a3a3a] pt-2 space-y-2.5">
          {/* Mask mode + Seed — same row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-zinc-500">Mask:</label>
              <button
                onClick={() => setChunkMaskMode('auto')}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  chunkMaskMode === 'auto'
                    ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                    : 'bg-[#2a2a2a] border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
                }`}
              >
                Auto
              </button>
              <button
                onClick={() => setChunkMaskMode('explicit')}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  chunkMaskMode === 'explicit'
                    ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                    : 'bg-[#2a2a2a] border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
                }`}
              >
                Explicit
              </button>
            </div>
            <div className="h-3 border-l border-[#3a3a3a]" />
            <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Seed</label>
            <input
              type="number"
              value={seedValue}
              onChange={(e) => { setSeedValue(e.target.value); setUseRandomSeed(false); }}
              placeholder="Random"
              min={0}
              max={2147483647}
              disabled={useRandomSeed}
              className="w-[110px] rounded border border-[#444] bg-[#161618] px-1.5 py-0.5 text-[11px] font-mono text-zinc-100 focus:border-teal-600 focus:outline-none disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => {
                setSeedValue(String(Math.floor(Math.random() * 2147483647)));
                setUseRandomSeed(false);
              }}
              className="text-[14px] leading-none transition-opacity hover:opacity-80"
              title="Random seed"
            >
              🎲
            </button>
            <label className="flex items-center gap-1 cursor-pointer" title="Use random seed each time">
              <input
                type="checkbox"
                checked={useRandomSeed}
                onChange={(e) => setUseRandomSeed(e.target.checked)}
                className="h-3 w-3 rounded border-[#444] accent-teal-600"
              />
              <span className="text-[9px] text-zinc-600">Rand</span>
            </label>
          </div>

          {/* Global caption — hidden in chunk mode (partial selection) */}
          {selectionCoversWholeSong && (
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Global caption</label>
              <textarea
                value={globalCaption}
                onChange={(e) => setGlobalCaption(e.target.value)}
                placeholder="e.g. upbeat pop song with energetic drums..."
                rows={2}
                className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#3a3a3a]">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-2.5 rounded-lg text-xs font-medium transition-colors ${
            isGenerating
              ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
              : 'bg-teal-600 hover:bg-teal-500 text-white'
          }`}
        >
          {isGenerating ? 'Generating\u2026' : isEditMode ? 'Regenerate' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

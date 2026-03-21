import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateFromAddLayer } from '../../services/generationPipeline';
import { extractContextAudioLazy } from '../../services/lazyContextAudioExtractor';
import type { TrackName } from '../../types/project';
import { TRACK_CATALOG, TRACK_NAMES } from '../../constants/tracks';
import {
  getFirstSelectedEmptyTrackSlotIndex,
  parseArrangementEmptyTrackSlotIndex,
} from '../arrangement/trackSlotLayout';

const VOCAL_TRACK_NAMES = new Set<string>(['vocals', 'backing_vocals']);
const TARGET_TRACK_OPTIONS = TRACK_NAMES.map((trackName) => TRACK_CATALOG[trackName]);

const LAYER_TYPES = [
  { id: 'song', label: 'Song Track', trackName: 'custom' as TrackName },
  { id: 'vocal', label: 'Vocal', trackName: 'vocals' as TrackName, showLyrics: true },
  { id: 'backing', label: 'Backing', trackName: 'backing_vocals' as TrackName, showLyrics: true },
  { id: 'custom', label: 'Custom', trackName: 'custom' as TrackName },
] as const;

type LayerTypeId = (typeof LAYER_TYPES)[number]['id'];
type PanelPosition = { left: number; top: number };

const PANEL_WIDTH = 420;
const PANEL_MARGIN = 16;
const PANEL_BOTTOM_GAP = 60;
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
  layerType: LayerTypeId,
) : TrackName {
  const targetTracks = getAudioTargetTracks(project);
  if (targetTracks.length === 0) {
    return layerType === 'vocal'
      ? 'vocals'
      : layerType === 'backing'
        ? 'backing_vocals'
        : 'drums';
  }

  const selectedTrackIds = selectWindow?.primaryTrackId
    ? [selectWindow.primaryTrackId]
    : (selectWindow?.trackIds ?? []);
  const selectedTracks = targetTracks.filter((track) => selectedTrackIds.includes(track.id));
  const selectedPresetTrack = selectedTracks.find((track) => track.trackName !== 'custom');
  const preferredTrackName: TrackName | null =
    layerType === 'vocal'
      ? 'vocals'
      : layerType === 'backing'
        ? 'backing_vocals'
        : null;

  if (selectedPresetTrack) return selectedPresetTrack.trackName;

  if (preferredTrackName) {
    const matchingSelectedTrack = selectedTracks.find((track) => track.trackName === preferredTrackName);
    if (matchingSelectedTrack) return matchingSelectedTrack.trackName;

    const matchingTrack = targetTracks.find((track) => track.trackName === preferredTrackName);
    if (matchingTrack) return matchingTrack.trackName;
  }

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
  const selectWindow = useUIStore((s) => s.selectWindow);
  const contextWindow = useUIStore((s) => s.contextWindow);

  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  const [layerType, setLayerType] = useState<LayerTypeId>('song');
  const [targetTrackName, setTargetTrackName] = useState<TrackName>('drums');
  const [style, setStyle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('auto');
  const [sampleMode, setSampleMode] = useState(false);
  const [autoExpandPrompt, setAutoExpandPrompt] = useState(true);
  const [seedValue, setSeedValue] = useState('');

  // Context audio preview
  type PreviewState = 'idle' | 'loading' | 'playing';
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
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

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setLayerType('song');
      setTargetTrackName(project ? getDefaultTargetTrackName(project, selectWindow, 'song') : 'drums');
      setStyle('');
      setLyrics('');
      setGlobalCaption(project?.globalCaption ?? '');
      setSeedValue('');
      setSampleMode(false);
      setAutoExpandPrompt(true);
      setChunkMaskMode('auto');
      setSavedSelectionBeforeWholeSong(null);
      setPanelPosition(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, project, selectWindow]);

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
  }, [isOpen, panelPosition, positionPanelNearBottomCenter, showAdvanced, sampleMode, layerType]);

  useEffect(() => {
    if (!project || !isOpen) return;
    const hasPresetTarget = TARGET_TRACK_OPTIONS.some((track) => track.name === targetTrackName);
    if (!hasPresetTarget) {
      setTargetTrackName(getDefaultTargetTrackName(project, selectWindow, layerType));
    }
  }, [audioTargetTracks, isOpen, layerType, project, selectWindow, targetTrackName]);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') { stopPreview(); return; }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      const blob = await extractContextAudioLazy(contextWindow);
      if (!blob) { setPreviewState('idle'); return; }
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
  }, [previewState, contextWindow, stopPreview]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (previewAudioRef.current) previewAudioRef.current.currentTime = t;
    setPreviewCurrentTime(t);
  }, []);

  if (!isOpen || !project) return null;

  const selectedLayerType = LAYER_TYPES.find((lt) => lt.id === layerType)!;
  const showLyrics = 'showLyrics' in selectedLayerType && selectedLayerType.showLyrics;
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
  };

  const handleRestorePreviousWindow = () => {
    if (!savedSelectionBeforeWholeSong) return;
    useUIStore.getState().setSelectWindow(savedSelectionBeforeWholeSong);
    setSavedSelectionBeforeWholeSong(null);
  };

  const handleGenerate = async () => {
    stopPreview();

    let targetTrack = selectedWindowTrack;
    if (!targetTrack) {
      targetTrack = addTrack(
        targetTrackName,
        'stems',
        selectedEmptyTrackOrder !== null ? { order: selectedEmptyTrackOrder } : undefined,
      );
    }

    if (style) {
      setTrackLocalCaption(targetTrack.id, style);
    }

    useUIStore.getState().setSelectWindow(null);
    setSavedSelectionBeforeWholeSong(null);
    handleClose();

    await generateFromAddLayer({
      trackId: targetTrack.id,
      startTime,
      duration,
      localDescription: style,
      globalCaption,
      lyrics: showLyrics ? lyrics : '',
      contextWindow: hasContext ? contextWindow : null,
      chunkMaskMode,
    });
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
      className={`fixed w-[420px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col bg-[#1e1e22]/98 border border-[#3a3a3a] rounded-2xl shadow-2xl backdrop-blur-md text-xs text-zinc-200 ${isDragging ? 'cursor-grabbing' : ''}`}
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
            <span className="block text-sm font-semibold text-white">Add a Layer</span>
            <span className="block text-[11px] text-zinc-500">
              Selection {fmt(startTime)} - {fmt(endTime)}
            </span>
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
        {/* Selection display */}
        <div>
          <div className="text-zinc-400 text-xs">
            Selection: {fmt(startTime)} - {fmt(endTime)}
          </div>
          {!selectionCoversWholeSong && (
            <button
              onClick={handleSelectWholeSong}
              className="text-teal-400 hover:text-teal-300 text-[11px] mt-0.5 transition-colors"
            >
              + Select the whole song
            </button>
          )}
          {selectionCoversWholeSong && savedSelectionBeforeWholeSong && (
            <button
              onClick={handleRestorePreviousWindow}
              className="text-zinc-300 hover:text-white text-[11px] mt-0.5 transition-colors"
            >
              Restore previous window
            </button>
          )}
        </div>

        {/* Target track */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1.5">
            Target Track
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Target Track">
            {TARGET_TRACK_OPTIONS.map((track) => {
              const isActive = targetTrackName === track.name;
              const existingTrack = audioTargetTracks.find((candidate) => candidate.trackName === track.name);

              return (
                <button
                  key={track.name}
                  type="button"
                  aria-label={`Target track: ${track.displayName}`}
                  onClick={() => setTargetTrackName(track.name)}
                  className={`px-2.5 py-1.5 rounded-full border text-[11px] transition-colors ${
                    isActive
                      ? 'border-zinc-200 text-white bg-white/10'
                      : 'border-[#333] text-zinc-400 hover:text-zinc-200 hover:border-[#555]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: track.color }}
                      aria-hidden="true"
                    />
                    <span>{track.displayName}</span>
                    {!existingTrack && <span className="text-[10px] text-zinc-500">new</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedWindowTrack?.color ?? selectedTargetTrackInfo.color }}
              aria-hidden="true"
            />
            <span>
              {selectedWindowTrack
                ? `Generate into selected row: ${selectedWindowTrack.displayName}`
                : `Create a new ${selectedTargetTrackInfo.displayName} track in the selected row`}
            </span>
          </div>
        </div>

        {/* Layer Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1.5">
            Layer Type
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {LAYER_TYPES.map((lt) => (
              <button
                key={lt.id}
                onClick={() => setLayerType(lt.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                  layerType === lt.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-[#2a2a2a] text-zinc-400 hover:text-zinc-300 hover:bg-[#333]'
                }`}
              >
                {lt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        {!sampleMode && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Style
            </label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Describe the sound..."
              rows={2}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
            />
          </div>
        )}

        {sampleMode && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Description
            </label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Describe the sample you want..."
              rows={2}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
            />
          </div>
        )}

        {/* Lyrics (vocal types only) */}
        {showLyrics && !sampleMode && (
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

        {/* Advanced section */}
        <div className="border-t border-[#3a3a3a] pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 text-[11px] transition-colors"
          >
            {showAdvanced ? '\u25BE' : '\u25B8'} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2.5">
              {/* Context window info */}
              {hasContext && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
                    Context
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/50 border border-blue-800/40">
                    <button
                      onClick={handlePreviewContext}
                      disabled={previewState === 'loading'}
                      className="w-6 h-6 flex items-center justify-center rounded bg-blue-800/60 hover:bg-blue-700/60 text-blue-200 text-[10px] disabled:opacity-50 shrink-0 transition-colors"
                      title={previewState === 'playing' ? 'Stop preview' : 'Preview context audio'}
                    >
                      {previewState === 'loading' ? '\u2026' : previewState === 'playing' ? '\u25A0' : '\u25B6'}
                    </button>
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
                    <span className="text-[10px] font-mono text-blue-300 shrink-0 w-[60px] text-right">
                      {fmtTime(previewCurrentTime)} / {fmtTime(previewDuration)}
                    </span>
                  </div>
                  <span className="text-[10px] text-blue-300 mt-1 block">
                    {fmt(contextWindow.startTime)} — {fmt(contextWindow.endTime)}
                  </span>
                </div>
              )}
              {!hasContext && (
                <div className="text-[10px] text-zinc-500">
                  Context: none (Alt+drag on timeline to set)
                </div>
              )}

              {/* Mask mode */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-zinc-500">Mask mode:</label>
                <div className="flex gap-1">
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
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sampleMode}
                    onChange={(e) => setSampleMode(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-600"
                  />
                  <span className="text-[10px] text-zinc-400">Sample mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoExpandPrompt}
                    onChange={(e) => setAutoExpandPrompt(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-600"
                  />
                  <span className="text-[10px] text-zinc-400">Auto-expand prompt</span>
                </label>
              </div>

              {/* Seed */}
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Seed</label>
                <input
                  type="number"
                  value={seedValue}
                  onChange={(e) => setSeedValue(e.target.value)}
                  placeholder="Leave empty for random"
                  className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-600"
                />
              </div>

              {/* Global caption */}
              {!sampleMode && (
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
          {isGenerating ? 'Generating\u2026' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

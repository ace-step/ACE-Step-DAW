import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useTransportStore } from '../../store/transportStore';
import { hexToRgba } from '../../utils/color';
import { getClipContentOffset } from '../../utils/clipAudio';
import { getClipPresentation } from './clipPresentation';
import { AddLayerModal } from '../generation/AddLayerModal';
import { ClipContextMenuContainer } from './ClipContextMenuContainer';
import { CanvasClipWaveform } from './CanvasClipWaveform';
import { CanvasClipMidiThumbnail } from './CanvasClipMidiThumbnail';
import { ClipGainEnvelope } from './ClipGainEnvelope';
import { ClipWarpMarkers } from './ClipWarpMarkers';
import { ClipStatusOverlay } from './ClipStatusOverlay';
import { ClipFadeHandles } from './ClipFadeHandles';
import { ClipDragGhost } from './ClipDragGhost';
import { DragTooltip, shouldShowDragTooltip, incrementDragTooltipCount } from './DragTooltip';
import { ClipVersionNav } from './ClipVersionNav';
import { getClipFadeBounds } from '../../utils/clipFade';
import { useClipDrag, HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import { useClipHover } from './useClipHover';
import { useWaveformUpgrade } from './useWaveformUpgrade';
import type { DragGhostInfo } from './useClipDrag';
import { CURSOR_BRACKET_LEFT, CURSOR_BRACKET_RIGHT } from '../../utils/bracketCursor';

interface ClipBlockProps {
  clip: Clip;
  track: Track;
}

function ClipBlockInner({ clip, track }: ClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const isClipSelected = useUIStore((s) => s.selectedClipIds.has(clip.id));
  const selectClip = useUIStore((s) => s.selectClip);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const generationJob = useGenerationStore((s) => {
    for (let i = s.jobs.length - 1; i >= 0; i--) {
      const j = s.jobs[i];
      if (j.clipId === clip.id && (j.status === 'generating' || j.status === 'queued' || j.status === 'processing')) {
        return j;
      }
    }
    return null;
  });
  const generatingProgress = generationJob
    ? generationJob.progressPercent != null
      ? `${generationJob.stage ?? generationJob.progress} ${Math.round(generationJob.progressPercent)}%`
      : generationJob.stage ?? generationJob.progress
    : null;
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const totalDuration = useProjectStore((s) => s.project?.totalDuration ?? 600);
  const isMidiClip = Boolean(clip.midiData);
  const hasGeneratedClipBadge = clip.source === 'generated' || (clip.source == null && track.trackType === 'stems');
  const hasAudioBody = Boolean(clip.isolatedAudioKey || clip.cumulativeMixKey || clip.waveformPeaks);

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhostInfo | null>(null);
  const [ghostLanding, setGhostLanding] = useState(false);
  const [showDragTooltip, setShowDragTooltip] = useState(false);
  const dragTooltipCounted = useRef(false);
  const [scissorLine, setScissorLine] = useState<number | null>(null);
  const [rangePreview, setRangePreview] = useState<{ left: number; width: number } | null>(null);
  const clipBlockRef = useRef<HTMLDivElement>(null);
  const ghostLandingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    hoveredResizeEdge,
    hoverSeekX,
    isPointerInside,
    handleMouseEnter: handleMouseEnterLocal,
    handleMouseMove: handleMouseMoveLocal,
    handleMouseLeave: handleMouseLeaveLocal,
    handleResizeHandleEnter,
    handleResizeHandleLeave,
  } = useClipHover(clipBlockRef);

  useEffect(() => {
    return () => {
      if (ghostLandingTimerRef.current !== null) clearTimeout(ghostLandingTimerRef.current);
    };
  }, []);

  const onGhostLanding = useCallback(() => {
    setGhostLanding(true);
    setShowDragTooltip(false);
    if (ghostLandingTimerRef.current !== null) clearTimeout(ghostLandingTimerRef.current);
    ghostLandingTimerRef.current = setTimeout(() => {
      setDragGhost(null);
      setGhostLanding(false);
      ghostLandingTimerRef.current = null;
    }, 200);
  }, []);

  const handleDragGhostChange = useCallback((ghost: DragGhostInfo | null) => {
    setDragGhost(ghost);
    if (ghost && !dragTooltipCounted.current && shouldShowDragTooltip()) {
      setShowDragTooltip(true);
      incrementDragTooltipCount();
      dragTooltipCounted.current = true;
    }
    if (!ghost) {
      setShowDragTooltip(false);
      dragTooltipCounted.current = false;
    }
  }, []);

  const { handleMouseDown, scissorRef, suppressContextMenuRef, rangePreviewCommittedRef } = useClipDrag({
    clip,
    track,
    clipBlockRef,
    pixelsPerSecond,
    bpm,
    totalDuration,
    onDragGhostChange: handleDragGhostChange,
    onGhostLanding,
    onScissorLineChange: setScissorLine,
    onRangePreviewChange: setRangePreview,
    onCtxMenuChange: (pos) => setCtxMenu(pos),
  });

  // Cleanup cursor on unmount if scissor mode was active
  useEffect(() => {
    return () => {
      if (scissorRef.current) document.body.style.cursor = '';
      if (/(?:^|-)resize$/.test(document.body.style.cursor)) document.body.style.cursor = '';
      if (/(?:^|-)resize$/.test(document.documentElement.style.cursor)) document.documentElement.style.cursor = '';
    };
  }, [scissorRef]);

  const editingClipId = useUIStore((s) => s.editingClipId);
  useEffect(() => {
    if (editingClipId === clip.id) {
      setEditModalOpen(true);
      setEditingClip(null);
    }
  }, [editingClipId, clip.id, setEditingClip]);

  const versions = clip.versions ?? [];
  const activeVersionIdx = clip.activeVersionIdx ?? (versions.length > 0 ? versions.length - 1 : -1);
  const totalVersions = versions.length;

  useWaveformUpgrade(clip.id, clip.generationStatus, clip.isolatedAudioKey, clip.waveformPeaks, clip.audioDuration);

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const isSelected = isClipSelected;
  // Local override for live fade values during drag. We deliberately bypass
  // the Zustand store while the user is dragging to keep redraws cheap: only
  // this ClipBlock re-renders per frame, instead of the whole project tree
  // notifying every subscriber. The store is updated once on mouseup.
  const [liveFadeIn, setLiveFadeIn] = useState<number | null>(null);
  const [liveFadeOut, setLiveFadeOut] = useState<number | null>(null);

  const storedFade = getClipFadeBounds(clip);
  const fadeInDuration = liveFadeIn ?? storedFade.fadeInDuration;
  const fadeOutDuration = liveFadeOut ?? storedFade.fadeOutDuration;
  const fadeInWidth = Math.min(width, fadeInDuration * pixelsPerSecond);
  const fadeOutWidth = Math.min(width, fadeOutDuration * pixelsPerSecond);
  // Handles are strictly hover-only so the timeline stays uncluttered when the
  // pointer is elsewhere. The fade itself is shown by the waveform amplitude
  // envelope, which is always visible when a fade exists.
  const showFadeInHandle = isPointerInside;
  const showFadeOutHandle = isPointerInside;
  const clipColor = clip.color ?? track.color;
  const clipPresentation = useMemo(() => getClipPresentation(clipColor, isSelected), [clipColor, isSelected]);

  const fadeInCurve = clip.fadeInCurve ?? 'linear';
  const fadeOutCurve = clip.fadeOutCurve ?? 'linear';
  // Local override for live curve point during drag (same store-bypass pattern
  // as fade duration drag). Cleared on commit in the callback below.
  const [liveFadeInCurvePoint, setLiveFadeInCurvePoint] = useState<{ x: number; y: number } | null>(null);
  const [liveFadeOutCurvePoint, setLiveFadeOutCurvePoint] = useState<{ x: number; y: number } | null>(null);
  const fadeInCurvePoint = liveFadeInCurvePoint ?? clip.fadeInCurvePoint;
  const fadeOutCurvePoint = liveFadeOutCurvePoint ?? clip.fadeOutCurvePoint;
  const waveformFadeEnvelope = useMemo(() => {
    if (fadeInWidth <= 0 && fadeOutWidth <= 0) return undefined;
    return {
      totalWidthPx: width,
      fadeInPx: fadeInWidth,
      fadeOutPx: fadeOutWidth,
      fadeInCurve,
      fadeOutCurve,
      fadeInCurvePoint,
      fadeOutCurvePoint,
    };
  }, [width, fadeInWidth, fadeOutWidth, fadeInCurve, fadeOutCurve, fadeInCurvePoint, fadeOutCurvePoint]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (rangePreviewCommittedRef.current) {
      rangePreviewCommittedRef.current = false;
      return;
    }
    setCtxMenu(null);
    const isMultiSelect = e.metaKey || e.ctrlKey;
    selectClip(clip.id, isMultiSelect);
    useUIStore.getState().selectTrack(track.id, isMultiSelect);
    if (!isMultiSelect) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const clickTime = clip.startTime + relX / pixelsPerSecond;
      useTransportStore.getState().seek(clickTime);
    }
  }, [clip.id, clip.startTime, track.id, selectClip, pixelsPerSecond, rangePreviewCommittedRef]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (rangePreviewCommittedRef.current) {
      rangePreviewCommittedRef.current = false;
      return;
    }
    if (isMidiClip) {
      setOpenPianoRoll(track.id, clip.id);
      return;
    }
    // Text2music clips (explicit params AND mix track type) → open GenerationSidePanel
    if (clip.generationParams?.type === 'text2music' || (clip.source === 'generated' && track.trackType === 'mix')) {
      const ui = useUIStore.getState();
      ui.setEditingText2MusicClipId(clip.id);
      ui.openGenerationPanelView('textToMusic');
      return;
    }
    // Any other generated clip (lego / stems / add layer) → open AddLayerPanel
    // Also handle stems-track clips that may not have source set
    if (clip.source === 'generated' || track.trackType === 'stems') {
      useUIStore.getState().openAddLayerForClip(clip.id);
      return;
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [isMidiClip, setOpenPianoRoll, track.id, track.trackType, clip, rangePreviewCommittedRef]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [suppressContextMenuRef]);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const statusStyles: Record<string, string> = {
    empty: 'opacity-60',
    idle: '',
    queued: 'opacity-70',
    generating: 'opacity-80 animate-pulse',
    processing: 'opacity-80 animate-pulse',
    ready: '',
    error: 'opacity-60',
    stale: 'opacity-50',
  };

  const peaks = clip.waveformPeaks;
  const audioDuration = clip.audioDuration ?? clip.duration;
  const audioOffset = clip.audioOffset ?? 0;
  const contentOffset = getClipContentOffset(clip);
  const selectedActionClipIds = isClipSelected ? [...useUIStore.getState().selectedClipIds] : [clip.id];
  const allTracks = useProjectStore.getState().project?.tracks ?? [];
  const selectedActionClips = selectedActionClipIds
    .map((clipId) => allTracks.flatMap((candidate) => candidate.clips).find((candidate) => candidate.id === clipId))
    .filter((candidate): candidate is Clip => Boolean(candidate));
  const canConsolidate = selectedActionClips.length === selectedActionClipIds.length
    && selectedActionClips.every((candidate) => candidate.trackId === track.id)
    && new Set(selectedActionClips.map((candidate) => Boolean(candidate.midiData))).size <= 1;
  const hasCustomColor = selectedActionClips.some((candidate) => Boolean(candidate.color));

  return (
    <>
      {/* Mount animation wrapper — CSS-only, no timers, doesn't conflict with animate-pulse */}
      <div
        className="absolute top-1 bottom-1 clip-mount-animation"
        style={{
          left,
          width: Math.max(width, 4),
          zIndex: 1,
          animation: 'clip-mount-fade 200ms ease-out',
        }}
        data-testid={`clip-mount-wrapper-${clip.id}`}
      >
      <div
        ref={clipBlockRef}
        className={`rounded-[3px] select-none overflow-hidden w-full h-full
          daw-clip-interactive
          active:brightness-95
          ${clip.muted ? 'opacity-40' : (statusStyles[clip.generationStatus] ?? '')}
        `}
        style={{
          boxShadow: clipPresentation.containerShadow,
          border: clipPresentation.clipBorder,
          contain: 'layout style paint',
        }}
        data-clip-block
        data-clip-id={clip.id}
        data-testid={`clip-${clip.id}`}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnterLocal}
        onMouseMove={handleMouseMoveLocal}
        onMouseLeave={handleMouseLeaveLocal}
        onContextMenu={handleContextMenu}
        >
        {/* Header rail */}
        <div
          data-clip-header-rail="true"
          data-testid="clip-header-rail"
          aria-label={`Move clip ${clip.id}`}
          className="absolute left-0 right-0 top-0 z-[6] flex items-center rounded-t-[3px] border-b px-2"
          style={{
            height: HEADER_RAIL_HEIGHT_PX,
            background: clipPresentation.headerBackground,
            borderBottomColor: hexToRgba(clipColor, 0.38),
          }}
        />

        {/* Body surface */}
        <div
          className="absolute left-0 right-0 bottom-0 rounded-b-[3px] overflow-hidden"
          data-testid="clip-body-surface"
          style={{
            top: HEADER_RAIL_HEIGHT_PX,
            background: clipPresentation.bodyBackground,
          }}
        />

        {/* Resize handles — accent-colored edge strips visible on hover */}
        <div
          className="absolute top-0 left-0 w-[16px] z-10 group/resize-left"
          data-testid="resize-handle-left"
          style={{ cursor: CURSOR_BRACKET_LEFT, height: HEADER_RAIL_HEIGHT_PX }}
          onMouseEnter={handleResizeHandleEnter('left')}
          onMouseLeave={handleResizeHandleLeave}
        >
          <div
            className="absolute top-0 left-0 bottom-0 w-[3px] rounded-l-[3px] opacity-0 group-hover/resize-left:opacity-100 transition-opacity duration-150"
            style={{ backgroundColor: 'var(--color-daw-accent, #5e59ff)' }}
          />
        </div>
        <div
          className="absolute top-0 right-0 w-[16px] z-10 group/resize-right"
          data-testid="resize-handle-right"
          style={{ cursor: CURSOR_BRACKET_RIGHT, height: HEADER_RAIL_HEIGHT_PX }}
          onMouseEnter={handleResizeHandleEnter('right')}
          onMouseLeave={handleResizeHandleLeave}
        >
          <div
            className="absolute top-0 right-0 bottom-0 w-[3px] rounded-r-[3px] opacity-0 group-hover/resize-right:opacity-100 transition-opacity duration-150"
            style={{ backgroundColor: 'var(--color-daw-accent, #5e59ff)' }}
          />
        </div>

        {/* Waveform */}
        <div
          className="absolute left-0 right-0 bottom-0 overflow-hidden"
          style={{ top: HEADER_RAIL_HEIGHT_PX }}
        >
          <CanvasClipWaveform
            peaks={peaks}
            audioKey={clip.isolatedAudioKey ?? clip.cumulativeMixKey ?? null}
            audioDuration={audioDuration}
            audioOffset={audioOffset}
            clipDuration={clip.duration}
            contentOffset={contentOffset}
            timeStretchRate={clip.timeStretchRate}
            stretchMode={clip.stretchMode}
            width={width}
            color={clipPresentation.waveformColor}
            opacityClassName={isSelected ? 'opacity-95' : 'opacity-90'}
            trackVolume={track.volume}
            fadeEnvelope={waveformFadeEnvelope}
          />
        </div>

        {/* Fade handles — small grab targets only; the fade itself is shown
            by the waveform amplitude envelope via CanvasClipWaveform. */}
        {!isMidiClip && hasAudioBody && (
          <ClipFadeHandles
            clipId={clip.id}
            clipDuration={clip.duration}
            clipStartTime={clip.startTime}
            width={width}
            fadeInDuration={fadeInDuration}
            fadeOutDuration={fadeOutDuration}
            fadeInCurve={fadeInCurve}
            fadeOutCurve={fadeOutCurve}
            fadeInCurvePoint={fadeInCurvePoint}
            fadeOutCurvePoint={fadeOutCurvePoint}
            showFadeInHandle={showFadeInHandle}
            showFadeOutHandle={showFadeOutHandle}
            pixelsPerSecond={pixelsPerSecond}
            clipBlockRef={clipBlockRef}
            clipColor={clipColor}
            onFadeDragLive={(edge, value) => {
              if (edge === 'in') setLiveFadeIn(value);
              else setLiveFadeOut(value);
            }}
            onFadeDragCommit={(edge, value) => {
              if (edge === 'in') {
                setLiveFadeIn(null);
                useProjectStore.getState().setClipFade(clip.id, { fadeInDuration: value });
              } else {
                setLiveFadeOut(null);
                useProjectStore.getState().setClipFade(clip.id, { fadeOutDuration: value });
              }
            }}
            onFadeDragCancel={(edge) => {
              if (edge === 'in') setLiveFadeIn(null);
              else setLiveFadeOut(null);
            }}
            onCurvePointDragLive={(edge, point) => {
              if (edge === 'in') setLiveFadeInCurvePoint(point);
              else setLiveFadeOutCurvePoint(point);
            }}
            onCurvePointDragCommit={(edge, point) => {
              if (edge === 'in') {
                setLiveFadeInCurvePoint(null);
                useProjectStore.getState().setClipFade(clip.id, { fadeInCurvePoint: point });
              } else {
                setLiveFadeOutCurvePoint(null);
                useProjectStore.getState().setClipFade(clip.id, { fadeOutCurvePoint: point });
              }
            }}
            onCurvePointDragCancel={(edge) => {
              if (edge === 'in') setLiveFadeInCurvePoint(null);
              else setLiveFadeOutCurvePoint(null);
            }}
            onCurvePointReset={(edge) => {
              useProjectStore.getState().setClipFade(clip.id, edge === 'in'
                ? { fadeInCurvePoint: undefined }
                : { fadeOutCurvePoint: undefined });
            }}
          />
        )}

        {/* Gain envelope */}
        {clip.gainEnvelope && clip.gainEnvelope.length > 0 && (
          <ClipGainEnvelope
            clipId={clip.id}
            clipDuration={clip.duration}
            width={width}
            gainEnvelope={clip.gainEnvelope}
            color={clipColor}
          />
        )}

        {/* Warp markers */}
        {clip.warpMarkers && clip.warpMarkers.length > 0 && (
          <ClipWarpMarkers
            clipId={clip.id}
            clipDuration={clip.duration}
            width={width}
            markers={clip.warpMarkers}
            allowAdd
          />
        )}

        {/* MIDI thumbnail */}
        {isMidiClip && clip.midiData && (
          <CanvasClipMidiThumbnail
            midiData={clip.midiData}
            width={width}
            duration={clip.duration}
            bpm={bpm}
            color={clipPresentation.waveformColor}
          />
        )}

        {/* Title */}
        <div
          className="absolute left-1.5 text-[10px] font-medium truncate leading-4 z-10 pointer-events-none"
          style={{
            top: 1,
            right: (totalVersions >= 1 || (clip.source === 'generated' && (clip.generationParams || track.trackType === 'mix'))) ? '52px' : '6px',
            color: clipPresentation.titleColor,
          }}
        >
          {isMidiClip ? `${clip.midiData?.notes.length ?? 0} notes` : (clip.prompt || '(no prompt)')}
        </div>

        {/* Version navigation */}
        <ClipVersionNav
          clipId={clip.id}
          activeVersionIdx={activeVersionIdx}
          totalVersions={totalVersions}
          generationStatus={clip.generationStatus}
          metaColor={clipPresentation.metaColor}
          hoveredResizeEdge={hoveredResizeEdge}
          canRegenerate={clip.source === 'generated' && !!(clip.generationParams || track.trackType === 'mix')}
        />

        {/* AI-generated clip badge — subtle sparkle in bottom-left corner */}
        {hasGeneratedClipBadge && (
          <div
            data-testid="ai-generated-badge"
            className="absolute z-10 pointer-events-none"
            style={{
              bottom: 3,
              left: 4,
              width: 8,
              height: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.5,
            }}
            aria-hidden="true"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path
                d="M5 0L6.1 3.9L10 5L6.1 6.1L5 10L3.9 6.1L0 5L3.9 3.9L5 0Z"
                fill="currentColor"
                style={{ color: 'rgba(255, 255, 255, 0.9)' }}
              />
            </svg>
          </div>
        )}

        <ClipStatusOverlay clip={clip} generatingProgress={generatingProgress} generationJob={generationJob} isMidiClip={isMidiClip} />

        {/* Muted overlay: diagonal stripes + darkening + label */}
        {clip.muted && (
          <div
            className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center daw-clip-mute-overlay"
            data-testid="clip-muted-overlay"
          >
            <span className="text-[9px] font-bold tracking-wider text-zinc-400 uppercase opacity-90 bg-black/40 px-1.5 py-px rounded-sm">Muted</span>
          </div>
        )}

        {/* Hover seek line */}
        {hoverSeekX !== null && (
          <div
            className="absolute bottom-0 pointer-events-none z-20"
            data-testid="hover-seek-line"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: hoverSeekX,
              width: 1,
              background: 'rgba(255, 255, 255, 0.18)',
              boxShadow: '0 0 3px rgba(255, 255, 255, 0.10), 0 0 8px rgba(255, 255, 255, 0.05)',
            }}
          />
        )}

        {/* Scissor line */}
        {scissorLine !== null && (
          <div
            className="absolute bottom-0 w-px pointer-events-none z-30"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: scissorLine,
              background: 'rgba(250, 204, 21, 0.9)',
              boxShadow: '0 0 4px rgba(250, 204, 21, 0.5)',
            }}
          >
            <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] border-2 border-yellow-400 bg-zinc-900 rounded-full" />
          </div>
        )}

        {/* Range preview */}
        {rangePreview && (
          <div
            className="absolute bottom-0 pointer-events-none z-20"
            data-testid="clip-range-preview"
            style={{
              top: HEADER_RAIL_HEIGHT_PX,
              left: rangePreview.left,
              width: rangePreview.width,
              background: 'rgba(255, 255, 255, 0.26)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)',
            }}
          />
        )}
      </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ClipContextMenuContainer
          x={ctxMenu.x}
          y={ctxMenu.y}
          clip={clip}
          track={track}
          isMidiClip={isMidiClip}
          canConsolidate={canConsolidate}
          hasCustomColor={hasCustomColor}
          selectedActionClipIds={selectedActionClipIds}
          onClose={closeCtxMenu}
          onEditModalOpen={() => setEditModalOpen(true)}
        />
      )}

      {/* Add layer modal */}
      {addLayerOpen && (
        <AddLayerModal
          trackId={track.id}
          startTime={clip.startTime}
          duration={clip.duration}
          contextWindow={contextWindow}
          onClose={() => setAddLayerOpen(false)}
        />
      )}

      {/* Edit modal */}
      {editModalOpen && (
        <AddLayerModal
          trackId={track.id}
          startTime={clip.startTime}
          duration={clip.duration}
          contextWindow={contextWindow}
          clipId={clip.id}
          onClose={() => setEditModalOpen(false)}
        />
      )}

      {/* Drag tooltip — shown for first 3 drags */}
      {showDragTooltip && dragGhost && (
        <DragTooltip x={dragGhost.x + dragGhost.width} y={dragGhost.y} />
      )}

      {/* Drag ghost */}
      {dragGhost && dragGhost.targetTrackId && (
        <ClipDragGhost
          dragGhost={dragGhost}
          ghostLanding={ghostLanding}
          clipColor={clipColor}
          clipPresentation={clipPresentation}
          left={left}
          width={width}
          peaks={peaks}
          audioDuration={audioDuration}
          audioOffset={audioOffset}
          clipDuration={clip.duration}
          contentOffset={contentOffset}
          timeStretchRate={clip.timeStretchRate}
          stretchMode={clip.stretchMode}
          isMidiClip={isMidiClip}
          midiData={clip.midiData}
          bpm={bpm}
          prompt={clip.prompt}
          displayName={track.displayName}
          trackVolume={track.volume}
        />
      )}
    </>
  );
}

export const ClipBlock = React.memo(ClipBlockInner, (prev, next) => {
  return prev.clip === next.clip && prev.track === next.track;
});

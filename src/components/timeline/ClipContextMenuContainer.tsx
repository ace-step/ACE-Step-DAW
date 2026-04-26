import React from 'react';
import type { Clip, MidiNote, Project, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import { toastError } from '../../hooks/useToast';
import { ClipContextMenu } from './ClipContextMenu';
import {
  getBarAtBeat,
  getTimeSignatureAtBar,
  getTimeSignatureBarLength,
  timeToBeat,
} from '../../utils/tempoMap';

/** Default grid size for groove extraction (16th note = 0.25 beats). */
const DEFAULT_GROOVE_GRID_BEATS = 0.25;
const THIRTY_SECOND_GRID_BEATS = 0.125;
const FINE_GRID_TOLERANCE_BEATS = 0.02;
/** Fallback groove analysis length when clip is too short (1 bar of 4/4). */
const FALLBACK_GROOVE_LENGTH_BEATS = 4;

function distanceToGrid(beat: number, gridBeats: number): number {
  const snapped = Math.round(beat / gridBeats) * gridBeats;
  return Math.abs(beat - snapped);
}

export function getGrooveGridBeatsFromMidiNotes(notes: MidiNote[] | undefined): number {
  if (!notes || notes.length === 0) return DEFAULT_GROOVE_GRID_BEATS;

  const hasThirtySecondOnset = notes.some((note) => {
    const start = Number.isFinite(note.startBeat) ? Math.max(0, note.startBeat) : 0;
    return distanceToGrid(start, DEFAULT_GROOVE_GRID_BEATS) > FINE_GRID_TOLERANCE_BEATS
      && distanceToGrid(start, THIRTY_SECOND_GRID_BEATS) <= FINE_GRID_TOLERANCE_BEATS;
  });

  return hasThirtySecondOnset ? THIRTY_SECOND_GRID_BEATS : DEFAULT_GROOVE_GRID_BEATS;
}

export function getGrooveLengthBeatsFromMidiNotes(
  notes: MidiNote[] | undefined,
  oneBarBeats: number,
  gridBeats: number,
): number {
  const validOneBar = Number.isFinite(oneBarBeats) && oneBarBeats > 0
    ? oneBarBeats
    : FALLBACK_GROOVE_LENGTH_BEATS;
  const validGrid = Number.isFinite(gridBeats) && gridBeats > 0
    ? gridBeats
    : DEFAULT_GROOVE_GRID_BEATS;

  const maxQuantizedOnset = notes?.reduce((maxOnset, note) => {
    const start = Number.isFinite(note.startBeat) ? note.startBeat : 0;
    const quantizedStart = Math.round(Math.max(0, start) / validGrid) * validGrid;
    const isExactBoundary = quantizedStart > 0
      && Math.abs(start - quantizedStart) < 1e-9
      && Math.abs(quantizedStart % validOneBar) < 1e-9;
    const effectiveOnset = isExactBoundary ? quantizedStart + validGrid : quantizedStart;
    return Math.max(maxOnset, effectiveOnset);
  }, 0) ?? 0;

  if (maxQuantizedOnset <= 0) return validOneBar;
  return Math.max(validOneBar, Math.ceil(maxQuantizedOnset / validOneBar) * validOneBar);
}

export function getGrooveBarLengthBeatsForClip(
  project: Project | null | undefined,
  clipStartTime: number,
): number {
  if (!project) return FALLBACK_GROOVE_LENGTH_BEATS;

  const fallbackNumerator = project.timeSignature ?? 4;
  const fallbackDenominator = project.timeSignatureDenominator ?? 4;
  const clipStartBeat = timeToBeat(
    Number.isFinite(clipStartTime) ? Math.max(0, clipStartTime) : 0,
    project.tempoMap,
    project.bpm,
  );
  const activeBar = getBarAtBeat(
    clipStartBeat,
    project.timeSignatureMap,
    fallbackNumerator,
    fallbackDenominator,
  );
  const activeSignature = getTimeSignatureAtBar(
    project.timeSignatureMap,
    activeBar,
    fallbackNumerator,
    fallbackDenominator,
  );

  return getTimeSignatureBarLength(activeSignature.numerator, activeSignature.denominator);
}

interface ClipContextMenuContainerProps {
  x: number;
  y: number;
  clip: Clip;
  track: Track;
  isMidiClip: boolean;
  canConsolidate: boolean;
  hasCustomColor: boolean;
  selectedActionClipIds: string[];
  onClose: () => void;
  onEditModalOpen: () => void;
}

export function ClipContextMenuContainer({
  x,
  y,
  clip,
  track,
  isMidiClip,
  canConsolidate,
  hasCustomColor,
  selectedActionClipIds,
  onClose,
  onEditModalOpen,
}: ClipContextMenuContainerProps) {
  const selectWindow = useUIStore((s) => s.selectWindow);
  const openEnhancer = useUIStore((s) => s.openEnhancer);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setVocal2BGMModal = useUIStore((s) => s.setVocal2BGMModal);
  const setAnalysisPanel = useUIStore((s) => s.setAnalysisPanel);
  const setStemSeparationModal = useUIStore((s) => s.setStemSeparationModal);
  const setAudioToMidiModal = useUIStore((s) => s.setAudioToMidiModal);
  const setVocalReplacementModal = useUIStore((s) => s.setVocalReplacementModal);
  const selectClip = useUIStore((s) => s.selectClip);

  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const consolidateClips = useProjectStore((s) => s.consolidateClips);
  const createQuickSamplerFromClip = useProjectStore((s) => s.createQuickSamplerFromClip);
  const applyAudioQuantize = useProjectStore((s) => s.applyAudioQuantize);
  const clearAudioQuantize = useProjectStore((s) => s.clearAudioQuantize);
  const exportMidiClip = useProjectStore((s) => s.exportMidiClip);
  const extractGrooveFromClip = useProjectStore((s) => s.extractGrooveFromClip);
  const convertMidiClipToStrudel = useProjectStore((s) => s.convertMidiClipToStrudel);
  const applyStrudelCodeToTrack = useProjectStore((s) => s.applyStrudelCodeToTrack);
  const splitClipAtZeroCrossing = useProjectStore((s) => s.splitClipAtZeroCrossing);
  const updateClipColors = useProjectStore((s) => s.updateClipColors);
  const tracks = useProjectStore((s) => s.project?.tracks);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const isReady = clip.generationStatus === 'ready';
  const isVocalTrack = track.trackName === 'vocals' || track.trackName === 'backing_vocals';
  const hasWarpMarkers = !!(clip.warpMarkers && clip.warpMarkers.length > 0);

  const handleEnhance = (!isMidiClip && isReady) ? () => {
    onClose();
    let range: { start: number; end: number } | null = null;
    if (selectWindow) {
      const rs = Math.max(selectWindow.startTime, clip.startTime);
      const re = Math.min(selectWindow.endTime, clip.startTime + clip.duration);
      if (re > rs) range = { start: rs, end: re };
    }
    openEnhancer(clip.id, track.id, range);
  } : undefined;

  const clipAIContext = (!isMidiClip && isReady) ? {
    onRegenerate: () => { onClose(); void import('../../services/generationPipeline').then(m => m.regenerateClip(clip.id)).catch(err => console.error('Failed to regenerate clip', err)); },
    hasPrompt: !!clip.prompt,
    isReady,
    ...(hasAudio ? { onSeparateStems: () => { onClose(); setStemSeparationModal(clip.id); } } : {}),
    ...(isVocalTrack ? { onGenerateAccompaniment: () => { onClose(); setVocal2BGMModal(clip.id); } } : {}),
    ...(!isVocalTrack && hasAudio ? { onGenerateVocals: () => { onClose(); setVocalReplacementModal(clip.id); } } : {}),
    onAnalyze: () => { onClose(); setAnalysisPanel(clip.id); },
    ...(hasAudio ? {
      onConvertToMidi: () => { onClose(); setAudioToMidiModal(clip.id); },
      onCreateQuickSampler: () => {
        onClose();
        const samplerTrack = createQuickSamplerFromClip(track.id, clip.id);
        if (samplerTrack) useUIStore.getState().setOpenPianoRoll(samplerTrack.id);
      },
      onQuantizeAudio: () => { onClose(); applyAudioQuantize(clip.id); },
      ...(hasWarpMarkers ? { onClearAudioQuantize: () => { onClose(); clearAudioQuantize(clip.id); } } : {}),
    } : {}),
  } : undefined;

  const handleConsolidate = async () => {
    try {
      const consolidatedClip = await consolidateClips(track.id, selectedActionClipIds);
      onClose();
      if (consolidatedClip) {
        selectClip(consolidatedClip.id, false);
      }
    } catch {
      onClose();
      toastError('Failed to consolidate clips');
    }
  };

  return (
    <ClipContextMenu
      x={x}
      y={y}
      onClose={onClose}
      onEnhance={handleEnhance}
      onInspireMe={() => { onClose(); useUIStore.getState().setShowGenerationPanel(true); }}
      onAddLayer={() => { onClose(); useUIStore.getState().setAddLayerOpen(true); }}
      onMusicEnhancer={() => { onClose(); openEnhancer(clip.id, track.id); }}
      clipAIContext={clipAIContext}
      onOpenMidi={isMidiClip ? () => { onClose(); setOpenPianoRoll(track.id, clip.id); } : undefined}
      onConvertToStrudel={isMidiClip ? () => {
        onClose();
        void (async () => {
          const result = await convertMidiClipToStrudel(clip.id);
          if (!result) return;
          await applyStrudelCodeToTrack(result.code, null, { label: 'Convert MIDI Clip' });
        })();
      } : undefined}
      onExportMidi={isMidiClip ? () => { onClose(); exportMidiClip(clip.id); } : undefined}
      onExtractGroove={isMidiClip ? () => {
        onClose();
        const name = `Groove from ${track.displayName || track.trackName}`;
        const gridBeats = getGrooveGridBeatsFromMidiNotes(clip.midiData?.notes);
        const project = useProjectStore.getState().project;
        const oneBar = getGrooveBarLengthBeatsForClip(project, clip.startTime);
        const lengthBeats = getGrooveLengthBeatsFromMidiNotes(clip.midiData?.notes, oneBar, gridBeats);
        const groove = extractGrooveFromClip(clip.id, name, { gridBeats, lengthBeats });
        if (!groove) {
          if (isViewerMode) {
            toastError('Grooves cannot be extracted in viewer mode.');
          } else if (!clip.midiData?.notes.length) {
            toastError('Add MIDI notes before extracting a groove.');
          } else {
            toastError('Failed to extract groove.');
          }
        }
      } : undefined}
      onEdit={() => {
        onClose();
        if (clip.generationParams?.type === 'text2music' || (clip.source === 'generated' && track.trackType === 'mix')) {
          const ui = useUIStore.getState();
          ui.setEditingText2MusicClipId(clip.id);
          ui.openGenerationPanelView('textToMusic');
        } else {
          useUIStore.getState().openAddLayerForClip(clip.id);
        }
      }}
      onDuplicate={() => { onClose(); duplicateClip(clip.id); }}
      onSplitAtPlayhead={() => {
        onClose();
        const currentTime = useTransportStore.getState().currentTime;
        if (currentTime > clip.startTime + 0.01 && currentTime < clip.startTime + clip.duration - 0.01) {
          void splitClipAtZeroCrossing(clip.id, currentTime);
        }
      }}
      onConsolidate={() => { void handleConsolidate(); }}
      onDelete={() => { onClose(); removeClip(clip.id); }}
      onSelectAll={() => {
        onClose();
        const p = useProjectStore.getState().project;
        if (p) {
          const allClipIds = p.tracks.flatMap((t) => t.clips.map((c) => c.id));
          useUIStore.getState().selectClips(allClipIds);
        }
      }}
      onLoopSelection={() => {
        onClose();
        const sw = useUIStore.getState().selectWindow;
        if (sw) {
          useTransportStore.getState().setLoopRegion(sw.startTime, sw.endTime);
          if (!useTransportStore.getState().loopEnabled) {
            useTransportStore.getState().toggleLoop();
          }
        }
      }}
      onToggleMute={() => {
        onClose();
        useProjectStore.getState().toggleClipMuted(selectedActionClipIds);
      }}
      isMuted={selectedActionClipIds.length > 1
        ? selectedActionClipIds.every((id) => {
            const c = (tracks ?? []).flatMap((t) => t.clips).find((cl) => cl.id === id);
            return c?.muted;
          })
        : !!clip.muted
      }
      onAssignColor={(color) => { onClose(); updateClipColors(selectedActionClipIds, color); }}
      onResetColor={() => { onClose(); updateClipColors(selectedActionClipIds, undefined); }}
      hasCustomColor={hasCustomColor}
      canConsolidate={canConsolidate}
      isMidiClip={isMidiClip}
      clip={clip}
    />
  );
}

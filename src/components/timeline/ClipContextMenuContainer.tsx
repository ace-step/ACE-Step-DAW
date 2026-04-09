import React from 'react';
import type { Clip, Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { ClipContextMenu } from './ClipContextMenu';

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
  const convertMidiClipToStrudel = useProjectStore((s) => s.convertMidiClipToStrudel);
  const applyStrudelCodeToTrack = useProjectStore((s) => s.applyStrudelCodeToTrack);
  const splitClipAtZeroCrossing = useProjectStore((s) => s.splitClipAtZeroCrossing);
  const updateClipColors = useProjectStore((s) => s.updateClipColors);
  const tracks = useProjectStore((s) => s.project?.tracks);

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
    const consolidatedClip = await consolidateClips(track.id, selectedActionClipIds);
    onClose();
    if (consolidatedClip) {
      selectClip(consolidatedClip.id, false);
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

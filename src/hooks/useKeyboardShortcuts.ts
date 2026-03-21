import { useEffect } from 'react';
import { useTransport } from './useTransport';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useGenerationStore } from '../store/generationStore';
import { useShortcutsStore } from '../store/shortcutsStore';
import { generateSingleClip } from '../services/generationPipeline';
import { useRecording } from './useRecording';
import { getMidiCaptureService } from '../services/midiCaptureService';
import {
  isEditableShortcutTarget,
  registerCoreDawShortcutRuntime,
} from '../services/coreDawShortcuts';
import { executeCoreKeyboardAction } from '../services/coreKeyboardActions';
import {
  navigateMixerByArrow,
  navigatePianoRollByArrow,
  navigateTimelineByArrow,
} from '../services/arrowKeyNavigation';
import { resolveFocusedTrackId } from '../services/focusResolution';
import type { KeyCombo } from '../types/shortcuts';

function isInputFocused(event: KeyboardEvent): boolean {
  return isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement);
}

const NUDGE_SECONDS = 5;
const DEFAULT_PIXELS_PER_SECOND = 50;

function eventMatchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const mod = event.metaKey || event.ctrlKey;
  return (
    event.code === combo.code &&
    mod === !!combo.mod &&
    event.shiftKey === !!combo.shift &&
    event.altKey === !!combo.alt
  );
}

function getBounceTargetTrackId(): string | null {
  const ui = useUIStore.getState();
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project) return null;

  const [selectedClipId] = [...ui.selectedClipIds];
  if (selectedClipId) {
    const track = projectStore.getTrackForClip(selectedClipId);
    if (track) return track.id;
  }

  return ui.openPianoRollTrackId
    ?? ui.openSequencerTrackId
    ?? ui.openDrumMachineTrackId
    ?? ui.openEffectChainTrackId
    ?? ui.expandedTrackId
    ?? project.tracks[0]?.id
    ?? null;
}

function focusTrack(delta: number) {
  const ui = useUIStore.getState();
  const project = useProjectStore.getState().project;
  if (!project || project.tracks.length === 0) return;

  const orderedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const currentId = resolveFocusedTrackId() ?? orderedTracks[0]?.id ?? null;
  const currentIndex = Math.max(0, orderedTracks.findIndex((track) => track.id === currentId));
  const nextIndex = Math.min(orderedTracks.length - 1, Math.max(0, currentIndex + delta));
  const nextTrack = orderedTracks[nextIndex];
  if (!nextTrack) return;

  ui.setExpandedTrackId(nextTrack.id);
  ui.setKeyboardContext(ui.keyboardContext.scope, nextTrack.id);

  if (ui.keyboardContext.scope === 'pianoRoll' && ui.openPianoRollTrackId) {
    ui.setOpenPianoRoll(nextTrack.id);
  }
}

function shouldDeferToPianoRollTools(event: KeyboardEvent): boolean {
  const ui = useUIStore.getState();
  if (ui.keyboardContext.scope !== 'pianoRoll') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyV', 'KeyB', 'KeyX'].includes(event.code);
}

export function shouldDeferToDrumMachine(event: KeyboardEvent): boolean {
  const ui = useUIStore.getState();
  if (ui.keyboardContext.scope !== 'drumMachine') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  // All 16 drum pad key codes
  return [
    'KeyZ', 'KeyX', 'KeyC', 'KeyV',
    'KeyA', 'KeyS', 'KeyD', 'KeyF',
    'KeyQ', 'KeyW', 'KeyE', 'KeyR',
    'Digit1', 'Digit2', 'Digit3', 'Digit4',
  ].includes(event.code);
}

export function useKeyboardShortcuts() {
  const { play, pause, stop, seek } = useTransport();
  const { toggleRecord, toggleArmTrack } = useRecording();

  useEffect(() => {
    const unregisterRuntime = registerCoreDawShortcutRuntime({
      play,
      pause,
      toggleRecord,
      toggleArmTrack,
    });

    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const getCombo = useShortcutsStore.getState().getCombo;
      const ui = useUIStore.getState();
      const project = useProjectStore.getState();
      const transport = useTransportStore.getState();
      const generation = useGenerationStore.getState();
      const activeHistoryScope = ui.historyFocusScope;
      const activeHistoryTarget = {
        trackId: ui.historyFocusTrackId ?? undefined,
        clipId: ui.historyFocusClipId ?? undefined,
      };
      const matches = (actionId: string) => eventMatchesCombo(event, getCombo(actionId));

      if (mod && event.code === 'KeyK') {
        event.preventDefault();
        if (ui.showCommandPalette) ui.closeCommandPalette();
        else ui.openCommandPalette();
        return;
      }

      if (mod && event.code === 'KeyZ' && !event.altKey && !isInputFocused(event)) {
        event.preventDefault();
        if (event.shiftKey) useProjectStore.getState().redo(activeHistoryScope, activeHistoryTarget);
        else useProjectStore.getState().undo(activeHistoryScope, activeHistoryTarget);
        return;
      }

      if (mod && event.altKey && event.code === 'KeyZ' && !isInputFocused(event)) {
        event.preventDefault();
        ui.setShowUndoHistoryPanel(!ui.showUndoHistoryPanel);
        return;
      }

      if (!mod && !event.shiftKey && !event.altKey && event.code === 'Slash' && !isInputFocused(event)) {
        event.preventDefault();
        ui.toggleVirtualKeyboard();
        return;
      }

      if (isInputFocused(event)) return;

      if (event.code === 'Escape') {
        if (ui.showCommandPalette) {
          event.preventDefault();
          ui.closeCommandPalette();
        } else if (ui.showUndoHistoryPanel) {
          event.preventDefault();
          ui.setShowUndoHistoryPanel(false);
        } else if (ui.showAIAssistant) {
          event.preventDefault();
          ui.setShowAIAssistant(false);
        } else if (ui.bounceInPlaceTrackId !== null) {
          event.preventDefault();
          ui.closeBounceInPlaceDialog();
        } else if (ui.editingClipId !== null) {
          event.preventDefault();
          ui.setEditingClip(null);
        } else if (ui.batchGenerateMode !== null) {
          event.preventDefault();
          ui.setBatchGenerateMode(null);
        } else if (ui.showKeyboardShortcutsDialog) {
          event.preventDefault();
          ui.setShowKeyboardShortcutsDialog(false);
        } else if (ui.showShortcutEditorDialog) {
          event.preventDefault();
          ui.setShowShortcutEditorDialog(false);
        } else if (ui.showInstrumentPicker) {
          event.preventDefault();
          ui.setShowInstrumentPicker(false);
        } else if (ui.showSettingsDialog) {
          event.preventDefault();
          ui.setShowSettingsDialog(false);
        } else if (ui.showExportDialog) {
          event.preventDefault();
          ui.setShowExportDialog(false);
        } else if (ui.showProjectListDialog) {
          event.preventDefault();
          ui.setShowProjectListDialog(false);
        } else if (ui.selectWindow !== null) {
          event.preventDefault();
          ui.setSelectWindow(null);
        } else if (ui.contextWindow !== null) {
          event.preventDefault();
          ui.setContextWindow(null);
        } else {
          ui.deselectAll();
        }
        return;
      }

      const anyModalOpen =
        ui.showCommandPalette ||
        ui.editingClipId !== null ||
        ui.batchGenerateMode !== null ||
        ui.bounceInPlaceTrackId !== null ||
        ui.showKeyboardShortcutsDialog ||
        ui.showShortcutEditorDialog ||
        ui.showInstrumentPicker ||
        ui.showSettingsDialog ||
        ui.showExportDialog ||
        ui.showProjectListDialog ||
        ui.showNewProjectDialog;

      if (matches('view.zoomIn')) { event.preventDefault(); ui.zoomIn(); return; }
      if (matches('view.zoomOut')) { event.preventDefault(); ui.zoomOut(); return; }
      if (matches('view.zoomReset')) { event.preventDefault(); ui.setPixelsPerSecond(DEFAULT_PIXELS_PER_SECOND); return; }

      if (matches('project.settings')) { event.preventDefault(); if (!anyModalOpen) ui.setShowSettingsDialog(true); return; }
      if (matches('project.new')) { event.preventDefault(); if (!anyModalOpen) ui.setShowNewProjectDialog(true); return; }
      if (matches('project.open')) { event.preventDefault(); if (!anyModalOpen) ui.setShowProjectListDialog(true); return; }
      if (matches('project.export')) { event.preventDefault(); if (!anyModalOpen) ui.setShowExportDialog(true); return; }
      if (matches('project.addTrack')) { event.preventDefault(); if (!anyModalOpen) ui.setShowInstrumentPicker(true); return; }
      if (matches('project.help')) { event.preventDefault(); if (!anyModalOpen) ui.setShowKeyboardShortcutsDialog(true); return; }
      if (matches('project.bounceInPlace')) {
        event.preventDefault();
        if (!anyModalOpen) {
          const trackId = getBounceTargetTrackId();
          if (trackId) ui.openBounceInPlaceDialog(trackId);
        }
        return;
      }

      if (matches('generation.context')) {
        event.preventDefault();
        if (!anyModalOpen && !generation.isGenerating) ui.setBatchGenerateMode('context');
        return;
      }
      if (matches('generation.silence')) {
        event.preventDefault();
        if (!anyModalOpen && !generation.isGenerating) ui.setBatchGenerateMode('silence');
        return;
      }

      if (matches('panels.aiAssistant')) { event.preventDefault(); ui.toggleAIAssistant(); return; }

      if (matches('clips.selectAll')) {
        event.preventDefault();
        if (!anyModalOpen && project.project) {
          if (ui.lastSelectionContext === 'tracks') {
            // Context is tracks — select all tracks
            const allTrackIds = project.project.tracks.map((t) => t.id);
            if (allTrackIds.length > 0) ui.selectTracks(allTrackIds);
          } else {
            // Default: select all clips
            const allClips = project.project.tracks.flatMap((track) => track.clips);
            if (allClips.length > 0) ui.selectClips(allClips.map((clip) => clip.id));
          }
        }
        return;
      }

      if (matches('clips.duplicate')) {
        event.preventDefault();
        if (!anyModalOpen) {
          const [firstSelected] = ui.selectedClipIds;
          if (firstSelected) project.duplicateClip(firstSelected);
        }
        return;
      }

      if (mod && event.code === 'KeyJ' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        if (!anyModalOpen && ui.selectedClipIds.size > 0 && project.project) {
          const selectedIds = [...ui.selectedClipIds];
          const selectedClips = project.project.tracks
            .flatMap((track) => track.clips)
            .filter((clip) => selectedIds.includes(clip.id));
          const trackIds = [...new Set(selectedClips.map((clip) => clip.trackId))];
          if (trackIds.length === 1) {
            void (async () => {
              const consolidatedClip = await project.consolidateClips(trackIds[0], selectedIds);
              if (consolidatedClip) ui.selectClip(consolidatedClip.id, false);
            })();
          }
        }
        return;
      }

      if (matches('clips.generate')) {
        event.preventDefault();
        if (!anyModalOpen && !generation.isGenerating) {
          const [clipId] = ui.selectedClipIds;
          if (clipId) generateSingleClip(clipId);
        }
        return;
      }

      if (mod) return;
      if (anyModalOpen) return;
      if (shouldDeferToPianoRollTools(event)) return;
      if (shouldDeferToDrumMachine(event)) return;

      if (matches('clips.toggleMute')) {
        event.preventDefault();
        if (ui.selectedClipIds.size > 0) {
          project.toggleClipMuted([...ui.selectedClipIds]);
        }
        return;
      }

      if (matches('view.toggleSessionView')) {
        event.preventDefault();
        ui.toggleMainView();
        return;
      }

      if (matches('transport.playPause')) {
        event.preventDefault();
        void executeCoreKeyboardAction('transport.playPause', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('transport.stop')) { event.preventDefault(); stop(); return; }
      if (matches('transport.loop')) {
        event.preventDefault();
        void executeCoreKeyboardAction('transport.loop', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('transport.metronome')) { event.preventDefault(); transport.toggleMetronome(); return; }
      if (matches('transport.record')) {
        event.preventDefault();
        void executeCoreKeyboardAction('transport.record', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('transport.stop')) { event.preventDefault(); stop(); return; }
      if (matches('transport.loop')) {
        event.preventDefault();
        void executeCoreKeyboardAction('transport.loop', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('transport.metronome')) { event.preventDefault(); transport.toggleMetronome(); return; }
      if (matches('transport.home')) { event.preventDefault(); seek(0); return; }
      if (matches('transport.end')) {
        event.preventDefault();
        if (project.project) seek(project.project.totalDuration);
        return;
      }
      if (matches('transport.punchIn')) { event.preventDefault(); transport.setPunchIn(transport.currentTime); return; }
      if (matches('transport.punchOut')) { event.preventDefault(); transport.setPunchOut(transport.currentTime); return; }
      if (matches('transport.captureMidi')) {
        event.preventDefault();
        const captureService = getMidiCaptureService();
        const targetTrackId = transport.armedTrackIds[0];
        if (targetTrackId) {
          project.captureMidi(targetTrackId, transport.currentTime, captureService);
        }
        return;
      }

      if (matches('panels.mixer')) { event.preventDefault(); ui.setShowMixer(!ui.showMixer); return; }
      if (matches('panels.smartControls')) { event.preventDefault(); ui.setShowSmartControls(!ui.showSmartControls); return; }
      if (matches('panels.library')) { event.preventDefault(); ui.setShowLibrary(!ui.showLibrary); return; }
      if (matches('panels.loopBrowser')) { event.preventDefault(); ui.toggleLoopBrowser(); return; }
      if (matches('panels.trackList')) { event.preventDefault(); ui.toggleTrackListDisplayMode(); return; }
      if (matches('panels.tempoLane')) { event.preventDefault(); ui.toggleTempoLane(); return; }
      if (matches('panels.generation')) { event.preventDefault(); ui.toggleGenerationPanel(); return; }
      if (matches('panels.generationHistory')) { event.preventDefault(); ui.toggleGenerationHistoryPanel(); return; }
      if (matches('panels.modelLibrary')) { event.preventDefault(); ui.toggleModelLibrary(); return; }
      if (matches('view.autoScroll')) { event.preventDefault(); ui.toggleAutoScroll(); return; }

      if (matches('tracks.mute')) {
        event.preventDefault();
        void executeCoreKeyboardAction('tracks.mute', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('tracks.solo')) {
        event.preventDefault();
        void executeCoreKeyboardAction('tracks.solo', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }
      if (matches('tracks.bypassEffects')) {
        event.preventDefault();
        void executeCoreKeyboardAction('tracks.bypassEffects', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }

      if (!event.shiftKey && !event.altKey) {
        if (ui.keyboardContext.scope === 'timeline') {
          if (event.code === 'ArrowLeft' && navigateTimelineByArrow('left')) { event.preventDefault(); return; }
          if (event.code === 'ArrowRight' && navigateTimelineByArrow('right')) { event.preventDefault(); return; }
          if (event.code === 'ArrowUp' && navigateTimelineByArrow('up')) { event.preventDefault(); return; }
          if (event.code === 'ArrowDown' && navigateTimelineByArrow('down')) { event.preventDefault(); return; }
        }

        if (ui.keyboardContext.scope === 'mixer') {
          if (event.code === 'ArrowLeft' && navigateMixerByArrow('left')) { event.preventDefault(); return; }
          if (event.code === 'ArrowRight' && navigateMixerByArrow('right')) { event.preventDefault(); return; }
        }

        if (ui.keyboardContext.scope === 'pianoRoll') {
          if (event.code === 'ArrowLeft' && navigatePianoRollByArrow('left')) { event.preventDefault(); return; }
          if (event.code === 'ArrowRight' && navigatePianoRollByArrow('right')) { event.preventDefault(); return; }
          if (event.code === 'ArrowUp' && navigatePianoRollByArrow('up')) { event.preventDefault(); return; }
          if (event.code === 'ArrowDown' && navigatePianoRollByArrow('down')) { event.preventDefault(); return; }
        }
      }

      if (matches('navigation.previousTrack')) { event.preventDefault(); focusTrack(-1); return; }
      if (matches('navigation.nextTrack')) { event.preventDefault(); focusTrack(1); return; }

      // Context-aware Delete / Backspace: tracks take priority over clips
      const isDeleteKey = matches('clips.delete') || (event.code === 'Backspace' && !mod && !event.shiftKey && !event.altKey);
      if (isDeleteKey) {
        event.preventDefault();
        if (ui.selectedTrackIds.size > 0) {
          const trackIds = [...ui.selectedTrackIds];
          ui.deselectAllTracks();
          project.removeTracks(trackIds);
        } else if (ui.selectedClipIds.size > 0) {
          const ids = [...ui.selectedClipIds];
          ui.deselectAll();
          ids.forEach((id) => project.removeClip(id));
        }
        return;
      }

      if (matches('clips.edit')) {
        const selected = [...ui.selectedClipIds];
        if (selected.length === 1) {
          event.preventDefault();
          ui.setEditingClip(selected[0]);
        }
        return;
      }

      if (matches('clips.split')) {
        const selected = [...ui.selectedClipIds];
        if (selected.length === 1) {
          event.preventDefault();
          project.splitClipAtZeroCrossing(selected[0], transport.currentTime);
        }
        return;
      }

      // Arrangement navigation follows the DAW convention:
      // Z fits the current selection, Shift+Z resets to the full project.
      if (matches('view.zoomToSelection')) {
        event.preventDefault();
        void executeCoreKeyboardAction('view.zoomToSelection', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }

      if (matches('view.zoomToFit')) {
        event.preventDefault();
        void executeCoreKeyboardAction('view.zoomToFit', { play, pause, toggleRecord, toggleArmTrack });
        return;
      }

      if (matches('view.toggleSnap')) { event.preventDefault(); ui.toggleSnap(); return; }

      // Group track shortcuts
      if (mod && event.shiftKey && event.code === 'KeyG' && !event.altKey) {
        event.preventDefault();
        const name = window.prompt('Group name', 'New Group');
        if (name?.trim()) project.createGroupTrack(name.trim());
        return;
      }
      if (event.shiftKey && event.code === 'KeyG' && !mod && !event.altKey) {
        const focusedTrackId = resolveFocusedTrackId();
        if (focusedTrackId) {
          const focusedTrack = project.project?.tracks.find((t) => t.id === focusedTrackId);
          if (focusedTrack?.isGroup) {
            event.preventDefault();
            project.toggleGroupCollapse(focusedTrackId);
            return;
          }
        }
      }

      if (/^Digit[1-4]$/.test(event.code)) {
        const variationIndex = Number(event.code.slice(5)) - 1;
        const session = generation.variationSession;
        if (session && variationIndex < session.variations.length) {
          event.preventDefault();
          generation.setActiveVariation(variationIndex);
          return;
        }
      }

      if (ui.keyboardContext.scope === 'timeline') {
        if (matches('transport.nudgeLeft')) {
          event.preventDefault();
          seek(Math.max(0, transport.currentTime - NUDGE_SECONDS));
          return;
        }
        if (matches('transport.nudgeRight')) {
          event.preventDefault();
          seek(transport.currentTime + NUDGE_SECONDS);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      unregisterRuntime();
      window.removeEventListener('keydown', handler);
    };
  }, [pause, play, seek, stop, toggleArmTrack, toggleRecord]);
}

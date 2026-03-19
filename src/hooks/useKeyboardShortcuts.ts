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
import type { KeyCombo } from '../types/shortcuts';

function isInputFocused(event: KeyboardEvent): boolean {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  );
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

function resolveFocusedTrackId(): string | null {
  const ui = useUIStore.getState();
  const project = useProjectStore.getState().project;
  if (!project) return null;

  const inProject = (trackId: string | null | undefined) =>
    trackId ? project.tracks.find((track) => track.id === trackId)?.id ?? null : null;

  const keyboardTrackId = inProject(ui.keyboardContext.trackId);
  if (keyboardTrackId) return keyboardTrackId;

  const editorTrackId = inProject(ui.openPianoRollTrackId)
    ?? inProject(ui.openSequencerTrackId)
    ?? inProject(ui.openDrumMachineTrackId)
    ?? inProject(ui.expandedTrackId);
  if (editorTrackId) return editorTrackId;

  if (ui.selectedClipIds.size > 0) {
    const selectedClipIds = new Set(ui.selectedClipIds);
    for (const track of project.tracks) {
      if (track.clips.some((clip) => selectedClipIds.has(clip.id))) {
        return track.id;
      }
    }
  }

  return project.tracks[0]?.id ?? null;
}

function focusTrack(delta: number) {
  const ui = useUIStore.getState();
  const project = useProjectStore.getState().project;
  if (!project || project.tracks.length === 0) return;

  const orderedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const currentId = resolveFocusedTrackId();
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

function toggleFocusedTrackFlag(flag: 'muted' | 'soloed') {
  const trackId = resolveFocusedTrackId();
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project || !trackId) return;

  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return;

  projectStore.updateTrack(trackId, { [flag]: !track[flag] });
  useUIStore.getState().setKeyboardContext(useUIStore.getState().keyboardContext.scope, trackId);
}

function shouldDeferToPianoRollTools(event: KeyboardEvent): boolean {
  const ui = useUIStore.getState();
  if (ui.keyboardContext.scope !== 'pianoRoll') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyB'].includes(event.code);
}

export function useKeyboardShortcuts() {
  const { play, pause, stop, seek } = useTransport();
  const { toggleRecord } = useRecording();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const getCombo = useShortcutsStore.getState().getCombo;
      const ui = useUIStore.getState();
      const project = useProjectStore.getState();
      const transport = useTransportStore.getState();
      const generation = useGenerationStore.getState();
      const activeHistoryScope = ui.historyFocusScope;
      const matches = (actionId: string) => eventMatchesCombo(event, getCombo(actionId));

      if (mod && event.code === 'KeyK') {
        event.preventDefault();
        if (ui.showCommandPalette) ui.closeCommandPalette();
        else ui.openCommandPalette();
        return;
      }

      if (mod && event.code === 'KeyZ' && !event.altKey && !isInputFocused(event)) {
        event.preventDefault();
        if (event.shiftKey) useProjectStore.getState().redo(activeHistoryScope);
        else useProjectStore.getState().undo(activeHistoryScope);
        return;
      }

      if (mod && event.altKey && event.code === 'KeyZ' && !isInputFocused(event)) {
        event.preventDefault();
        ui.setShowUndoHistoryPanel(!ui.showUndoHistoryPanel);
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
        } else if (ui.activeTutorialStep !== null) {
          event.preventDefault();
          ui.skipTutorial();
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
        } else if (ui.showOnboarding) {
          event.preventDefault();
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
        ui.showNewProjectDialog ||
        ui.showOnboarding ||
        ui.activeTutorialStep !== null;

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
          const allClips = project.project.tracks.flatMap((track) => track.clips);
          if (allClips.length > 0) ui.selectClips(allClips.map((clip) => clip.id));
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

      if (event.code === 'Tab') {
        event.preventDefault();
        ui.toggleMainView();
        return;
      }

      if (ui.mainView === 'session') {
        if (event.code === 'ArrowUp') {
          event.preventDefault();
          project.moveSessionSelection(-1, 0);
          return;
        }
        if (event.code === 'ArrowDown') {
          event.preventDefault();
          project.moveSessionSelection(1, 0);
          return;
        }
        if (event.code === 'ArrowLeft') {
          event.preventDefault();
          project.moveSessionSelection(0, -1);
          return;
        }
        if (event.code === 'ArrowRight') {
          event.preventDefault();
          project.moveSessionSelection(0, 1);
          return;
        }
        if (event.code === 'Enter') {
          const selection = project.project?.session?.selectedCell;
          if (selection) {
            event.preventDefault();
            project.launchClip(selection.trackId, selection.sceneIndex);
            return;
          }
        }
      }
      if (matches('transport.playPause')) {
        event.preventDefault();
        if (transport.isPlaying) pause();
        else play();
        return;
      }
      if (matches('transport.stop')) { event.preventDefault(); stop(); return; }
      if (matches('transport.loop')) { event.preventDefault(); transport.toggleLoop(); return; }
      if (matches('transport.metronome')) { event.preventDefault(); transport.toggleMetronome(); return; }
      if (matches('transport.record')) { event.preventDefault(); void toggleRecord(); return; }
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
      if (matches('panels.tempoLane')) { event.preventDefault(); ui.toggleTempoLane(); return; }

      if (matches('tracks.mute')) { event.preventDefault(); toggleFocusedTrackFlag('muted'); return; }
      if (matches('tracks.solo')) { event.preventDefault(); toggleFocusedTrackFlag('soloed'); return; }

      if (matches('navigation.previousTrack')) { event.preventDefault(); focusTrack(-1); return; }
      if (matches('navigation.nextTrack')) { event.preventDefault(); focusTrack(1); return; }

      if (matches('clips.delete')) {
        event.preventDefault();
        if (ui.selectedClipIds.size > 0) {
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

      if (matches('view.zoomToFit')) {
        event.preventDefault();
        if (project.project && project.project.totalDuration > 0) {
          const viewportWidth = window.innerWidth - 200;
          const fitPixelsPerSecond = Math.max(10, Math.min(500, viewportWidth / project.project.totalDuration));
          ui.setPixelsPerSecond(fitPixelsPerSecond);
        }
        return;
      }

      if (matches('view.toggleSnap')) { event.preventDefault(); ui.toggleSnap(); return; }

      if (event.code === 'KeyG' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        ui.toggleGenerationPanel();
        return;
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
    return () => window.removeEventListener('keydown', handler);
  }, [pause, play, seek, stop, toggleRecord]);
}

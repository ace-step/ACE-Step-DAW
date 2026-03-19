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

function isInputFocused(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement
  );
}

function getBounceTargetTrackId(): string | null {
  const ui = useUIStore.getState();
  const projectState = useProjectStore.getState();
  const project = projectState.project;
  if (!project) return null;

  const [selectedClipId] = [...ui.selectedClipIds];
  if (selectedClipId) {
    const track = projectState.getTrackForClip(selectedClipId);
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

const NUDGE_SECONDS = 5;
const DEFAULT_PIXELS_PER_SECOND = 50;

/** Check whether a keyboard event matches a KeyCombo binding. */
function eventMatchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  const mod = e.metaKey || e.ctrlKey;
  return (
    e.code === combo.code &&
    mod === !!combo.mod &&
    e.shiftKey === !!combo.shift &&
    e.altKey === !!combo.alt
  );
}

export function useKeyboardShortcuts() {
  const { play, pause, stop, seek } = useTransport();
  const { toggleRecord } = useRecording();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const getCombo = useShortcutsStore.getState().getCombo;
      const ui = useUIStore.getState();
      const activeHistoryScope = ui.historyFocusScope;

      if (mod && e.code === 'KeyK') {
        e.preventDefault();
        if (ui.showCommandPalette) {
          ui.closeCommandPalette();
        } else {
          ui.openCommandPalette();
        }
        return;
      }

      // Undo/Redo are always available — even when an input field is focused
      if (mod && e.code === 'KeyZ' && !e.altKey) {
        if (!isInputFocused(e)) {
          e.preventDefault();
          if (e.shiftKey) {
            useProjectStore.getState().redo(activeHistoryScope);
          } else {
            useProjectStore.getState().undo(activeHistoryScope);
          }
          return;
        }
      }

      if (mod && e.altKey && e.code === 'KeyZ') {
        if (!isInputFocused(e)) {
          e.preventDefault();
          ui.setShowUndoHistoryPanel(!ui.showUndoHistoryPanel);
          return;
        }
      }

      if (isInputFocused(e)) return;
      const project = useProjectStore.getState();
      const transport = useTransportStore.getState();
      const gen = useGenerationStore.getState();

      // ─── Helper: check if event matches a given action's binding ───
      const matches = (actionId: string) => eventMatchesCombo(e, getCombo(actionId));

      // -----------------------------------------------------------------------
      // Escape — close topmost modal in priority order (not rebindable)
      // -----------------------------------------------------------------------
      if (e.code === 'Escape') {
        if (ui.showCommandPalette) {
          e.preventDefault();
          ui.closeCommandPalette();
        } else if (ui.showUndoHistoryPanel) {
          e.preventDefault();
          ui.setShowUndoHistoryPanel(false);
        } else if (ui.showAIAssistant) {
          e.preventDefault();
          ui.setShowAIAssistant(false);
        } else if (ui.bounceInPlaceTrackId !== null) {
          e.preventDefault();
          ui.closeBounceInPlaceDialog();
        } else if (ui.editingClipId !== null) {
          e.preventDefault();
          ui.setEditingClip(null);
        } else if (ui.batchGenerateMode !== null) {
          e.preventDefault();
          ui.setBatchGenerateMode(null);
        } else if (ui.showKeyboardShortcutsDialog) {
          e.preventDefault();
          ui.setShowKeyboardShortcutsDialog(false);
        } else if (ui.showShortcutEditorDialog) {
          e.preventDefault();
          ui.setShowShortcutEditorDialog(false);
        } else if (ui.showInstrumentPicker) {
          e.preventDefault();
          ui.setShowInstrumentPicker(false);
        } else if (ui.showSettingsDialog) {
          e.preventDefault();
          ui.setShowSettingsDialog(false);
        } else if (ui.showExportDialog) {
          e.preventDefault();
          ui.setShowExportDialog(false);
        } else if (ui.showProjectListDialog) {
          e.preventDefault();
          ui.setShowProjectListDialog(false);
        } else if (ui.selectWindow !== null) {
          e.preventDefault();
          ui.setSelectWindow(null);
        } else if (ui.contextWindow !== null) {
          e.preventDefault();
          ui.setContextWindow(null);
        } else {
          ui.deselectAll();
        }
        return;
      }

      // Don't fire any other shortcut when a modal is open (except Escape above)
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

      // -----------------------------------------------------------------------
      // Mod shortcuts — zoom always works, others check anyModalOpen
      // -----------------------------------------------------------------------

      // Zoom (always)
      if (matches('view.zoomIn')) { e.preventDefault(); ui.zoomIn(); return; }
      if (matches('view.zoomOut')) { e.preventDefault(); ui.zoomOut(); return; }
      if (matches('view.zoomReset')) { e.preventDefault(); ui.setPixelsPerSecond(DEFAULT_PIXELS_PER_SECOND); return; }

      // Project shortcuts (require no modal)
      if (matches('project.settings')) { e.preventDefault(); if (!anyModalOpen) ui.setShowSettingsDialog(true); return; }
      if (matches('project.new')) { e.preventDefault(); if (!anyModalOpen) ui.setShowNewProjectDialog(true); return; }
      if (matches('project.open')) { e.preventDefault(); if (!anyModalOpen) ui.setShowProjectListDialog(true); return; }
      if (matches('project.export')) { e.preventDefault(); if (!anyModalOpen) ui.setShowExportDialog(true); return; }
      if (matches('project.addTrack')) { e.preventDefault(); if (!anyModalOpen) ui.setShowInstrumentPicker(true); return; }
      if (matches('project.help')) { e.preventDefault(); if (!anyModalOpen) ui.setShowKeyboardShortcutsDialog(true); return; }
      if (matches('project.bounceInPlace')) {
        e.preventDefault();
        if (!anyModalOpen) {
          const trackId = getBounceTargetTrackId();
          if (trackId) ui.openBounceInPlaceDialog(trackId);
        }
        return;
      }

      // Generation
      if (matches('generation.context')) {
        e.preventDefault();
        if (!anyModalOpen && !gen.isGenerating) ui.setBatchGenerateMode('context');
        return;
      }
      if (matches('generation.silence')) {
        e.preventDefault();
        if (!anyModalOpen && !gen.isGenerating) ui.setBatchGenerateMode('silence');
        return;
      }

      // AI Assistant
      if (matches('panels.aiAssistant')) { e.preventDefault(); ui.toggleAIAssistant(); return; }

      // Clip actions with mod
      if (matches('clips.selectAll')) {
        e.preventDefault();
        if (!anyModalOpen && project.project) {
          const allClips = project.project.tracks.flatMap((t) => t.clips);
          if (allClips.length > 0) {
            const firstId = allClips[0].id;
            ui.selectClip(firstId, false);
            for (let i = 1; i < allClips.length; i++) {
              ui.selectClip(allClips[i].id, true);
            }
          }
        }
        return;
      }
      if (matches('clips.duplicate')) {
        e.preventDefault();
        if (!anyModalOpen) {
          const [firstSelected] = ui.selectedClipIds;
          if (firstSelected) project.duplicateClip(firstSelected);
        }
        return;
      }
      if (mod && e.code === 'KeyJ' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (!anyModalOpen && ui.selectedClipIds.size > 0 && project.project) {
          const selectedIds = [...ui.selectedClipIds];
          const selectedClips = project.project.tracks
            .flatMap((track) => track.clips)
            .filter((clip) => selectedIds.includes(clip.id));
          const trackIds = [...new Set(selectedClips.map((clip) => clip.trackId))];
          if (trackIds.length === 1) {
            void (async () => {
              const consolidatedClip = await project.consolidateClips(trackIds[0], selectedIds);
              if (consolidatedClip) {
                ui.selectClip(consolidatedClip.id, false);
              }
            })();
          }
        }
        return;
      }
      if (matches('clips.generate')) {
        e.preventDefault();
        if (!anyModalOpen && !gen.isGenerating) {
          const [clipId] = ui.selectedClipIds;
          if (clipId) generateSingleClip(clipId);
        }
        return;
      }

      // If event uses mod and hasn't matched anything above, let it pass through
      if (mod) return;

      // -----------------------------------------------------------------------
      // Non-mod shortcuts — skip if any modal is open
      // -----------------------------------------------------------------------
      if (anyModalOpen) return;

      // Transport
      if (matches('transport.playPause')) {
        e.preventDefault();
        if (transport.isPlaying) pause(); else play();
        return;
      }
      if (matches('transport.stop')) {
        e.preventDefault();
        stop();
        return;
      }
      if (matches('transport.loop')) { e.preventDefault(); transport.toggleLoop(); return; }
      if (matches('transport.metronome')) { e.preventDefault(); transport.toggleMetronome(); return; }
      if (matches('transport.record')) { e.preventDefault(); void toggleRecord(); return; }
      if (matches('transport.home')) { e.preventDefault(); seek(0); return; }
      if (matches('transport.end')) {
        e.preventDefault();
        if (project.project) seek(project.project.totalDuration);
        return;
      }
      if (matches('transport.nudgeLeft')) {
        e.preventDefault();
        seek(Math.max(0, transport.currentTime - NUDGE_SECONDS));
        return;
      }
      if (matches('transport.nudgeRight')) {
        e.preventDefault();
        seek(transport.currentTime + NUDGE_SECONDS);
        return;
      }
      if (matches('transport.punchIn')) {
        e.preventDefault();
        transport.setPunchIn(transport.currentTime);
        return;
      }
      if (matches('transport.punchOut')) {
        e.preventDefault();
        transport.setPunchOut(transport.currentTime);
        return;
      }
      if (matches('transport.captureMidi')) {
        e.preventDefault();
        const captureService = getMidiCaptureService();
        const targetTrackId = transport.armedTrackIds[0];
        if (targetTrackId) {
          project.captureMidi(targetTrackId, transport.currentTime, captureService);
        }
        return;
      }

      // Clips
      if (matches('clips.delete')) {
        e.preventDefault();
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
          e.preventDefault();
          ui.setEditingClip(selected[0]);
        }
        return;
      }
      if (matches('clips.split')) {
        const selected = [...ui.selectedClipIds];
        if (selected.length === 1) {
          e.preventDefault();
          project.splitClip(selected[0], transport.currentTime);
        }
        return;
      }

      // View
      if (matches('view.zoomToFit')) {
        e.preventDefault();
        if (project.project && project.project.totalDuration > 0) {
          const viewportWidth = window.innerWidth - 200;
          const fitPps = Math.max(10, Math.min(500, viewportWidth / project.project.totalDuration));
          ui.setPixelsPerSecond(fitPps);
        }
        return;
      }
      if (matches('view.toggleSnap')) { e.preventDefault(); ui.toggleSnap(); return; }

      // Panels
      if (matches('panels.mixer')) { e.preventDefault(); ui.setShowMixer(!ui.showMixer); return; }
      if (matches('panels.smartControls')) { e.preventDefault(); ui.setShowSmartControls(!ui.showSmartControls); return; }
      if (matches('panels.library')) { e.preventDefault(); ui.setShowLibrary(!ui.showLibrary); return; }
      if (matches('panels.tempoLane')) { e.preventDefault(); ui.toggleTempoLane(); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [play, pause, stop, seek, toggleRecord]);
}

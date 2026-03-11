import { useEffect } from 'react';
import { useTransport } from './useTransport';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useGenerationStore } from '../store/generationStore';
import { generateSingleClip } from '../services/generationPipeline';

function isInputFocused(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement
  );
}

const NUDGE_SECONDS = 5;
const DEFAULT_PIXELS_PER_SECOND = 50;

export function useKeyboardShortcuts() {
  const { play, pause, stop, seek } = useTransport();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Undo/Redo are always available — even when an input field is focused
      if (mod && e.code === 'KeyZ' && !e.altKey) {
        // Only intercept if we're not in a native text field that handles its own undo
        if (!isInputFocused(e)) {
          e.preventDefault();
          if (e.shiftKey) {
            useProjectStore.getState().redo();
          } else {
            useProjectStore.getState().undo();
          }
          return;
        }
      }

      if (isInputFocused(e)) return;

      const ui = useUIStore.getState();
      const project = useProjectStore.getState();
      const transport = useTransportStore.getState();
      const gen = useGenerationStore.getState();

      // -----------------------------------------------------------------------
      // Escape — close topmost modal in priority order
      // -----------------------------------------------------------------------
      if (e.code === 'Escape') {
        if (ui.editingClipId !== null) {
          e.preventDefault();
          ui.setEditingClip(null);
        } else if (ui.batchGenerateMode !== null) {
          e.preventDefault();
          ui.setBatchGenerateMode(null);
        } else if (ui.showKeyboardShortcutsDialog) {
          e.preventDefault();
          ui.setShowKeyboardShortcutsDialog(false);
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
        ui.editingClipId !== null ||
        ui.batchGenerateMode !== null ||
        ui.showKeyboardShortcutsDialog ||
        ui.showInstrumentPicker ||
        ui.showSettingsDialog ||
        ui.showExportDialog ||
        ui.showProjectListDialog ||
        ui.showNewProjectDialog;

      // -----------------------------------------------------------------------
      // Mod + key shortcuts (work even with modals closed)
      // -----------------------------------------------------------------------
      if (mod) {
        switch (e.code) {
          // Zoom
          case 'Equal':   // Cmd/Ctrl + =  (also +)
          case 'NumpadAdd':
            e.preventDefault();
            ui.zoomIn();
            return;
          case 'Minus':
          case 'NumpadSubtract':
            e.preventDefault();
            ui.zoomOut();
            return;
          case 'Digit0':
          case 'Numpad0':
            e.preventDefault();
            ui.setPixelsPerSecond(DEFAULT_PIXELS_PER_SECOND);
            return;

          // Project
          case 'Comma':   // Cmd+,  → Settings
            e.preventDefault();
            if (!anyModalOpen) ui.setShowSettingsDialog(true);
            return;
          case 'KeyN':
            e.preventDefault();
            if (!anyModalOpen) ui.setShowNewProjectDialog(true);
            return;
          case 'KeyO':
            e.preventDefault();
            if (!anyModalOpen) ui.setShowProjectListDialog(true);
            return;

          // Generation
          case 'KeyG':
            e.preventDefault();
            if (!anyModalOpen && !gen.isGenerating) {
              if (e.shiftKey) {
                ui.setBatchGenerateMode('context');
              } else {
                ui.setBatchGenerateMode('silence');
              }
            }
            return;

          // Export
          case 'KeyE':
            if (e.shiftKey) {
              e.preventDefault();
              if (!anyModalOpen) ui.setShowExportDialog(true);
            }
            return;

          // Add Track
          case 'KeyI':
            if (e.shiftKey) {
              e.preventDefault();
              if (!anyModalOpen) ui.setShowInstrumentPicker(true);
            }
            return;

          // Clips
          case 'KeyA':
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
          case 'KeyD':
            e.preventDefault();
            if (!anyModalOpen) {
              const [firstSelected] = ui.selectedClipIds;
              if (firstSelected) {
                project.duplicateClip(firstSelected);
              }
            }
            return;
          case 'Enter':
          case 'NumpadEnter':
            // Cmd+Return → generate selected clip
            e.preventDefault();
            if (!anyModalOpen && !gen.isGenerating) {
              const [clipId] = ui.selectedClipIds;
              if (clipId) {
                generateSingleClip(clipId);
              }
            }
            return;
        }
        // Let other Cmd combos pass through (browser copy/paste etc.)
        return;
      }

      // -----------------------------------------------------------------------
      // Non-mod shortcuts — skip if any modal is open
      // -----------------------------------------------------------------------
      if (anyModalOpen) return;

      switch (e.code) {
        // Transport
        case 'Space':
          e.preventDefault();
          if (transport.isPlaying) pause();
          else play();
          break;

        case 'Enter':
        case 'NumpadEnter':
          e.preventDefault();
          stop();
          break;

        case 'KeyL':
          e.preventDefault();
          transport.toggleLoop();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, transport.currentTime - NUDGE_SECONDS));
          break;

        case 'ArrowRight':
          e.preventDefault();
          seek(transport.currentTime + NUDGE_SECONDS);
          break;

        // Clips — require selection
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (ui.selectedClipIds.size > 0) {
            const ids = [...ui.selectedClipIds];
            ui.deselectAll();
            ids.forEach((id) => project.removeClip(id));
          }
          break;

        case 'KeyE': {
          // Open editor for single selected clip
          const selected = [...ui.selectedClipIds];
          if (selected.length === 1) {
            e.preventDefault();
            ui.setEditingClip(selected[0]);
          }
          break;
        }

        // Mixer toggle
        case 'KeyM':
          e.preventDefault();
          ui.setShowMixer(!ui.showMixer);
          break;

        // Help
        case 'Slash':
          // ? key (Shift+/ on most keyboards)
          if (e.shiftKey) {
            e.preventDefault();
            ui.setShowKeyboardShortcutsDialog(true);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [play, pause, stop, seek]);
}

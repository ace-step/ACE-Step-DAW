import { useEffect } from 'react';
import { useTransport } from './useTransport';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useGenerationStore } from '../store/generationStore';
import { useShortcutsStore } from '../store/shortcutsStore';
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
import {
  copyClips,
  copyNotes,
  preparePasteClips,
  preparePasteNotes,
} from '../services/clipboardService';
import type { KeyCombo } from '../types/shortcuts';
import { DEFAULT_TIMELINE_PIXELS_PER_SECOND } from '../utils/timelineZoom';
import { getSessionClips } from '../utils/sessionClips';

function isInputFocused(event: KeyboardEvent): boolean {
  return isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement);
}

const NUDGE_SECONDS = 5;
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

      // Escape must work regardless of input focus (e.g. closing dialogs while an input is active).
      // Priority order: command palette → overlays/modals → editors → side panels → selection.
      if (event.code === 'Escape') {
        if (ui.showCommandPalette) {
          event.preventDefault();
          ui.closeCommandPalette();
        } else if (ui.showUndoHistoryPanel) {
          event.preventDefault();
          ui.setShowUndoHistoryPanel(false);
        } else if (ui.bounceInPlaceTrackId !== null) {
          event.preventDefault();
          ui.closeBounceInPlaceDialog();
        } else if (ui.showShortcutEditorDialog) {
          event.preventDefault();
          ui.setShowShortcutEditorDialog(false);
        } else if (ui.showKeyboardShortcutsDialog) {
          event.preventDefault();
          ui.setShowKeyboardShortcutsDialog(false);
        } else if (ui.showSettingsDialog) {
          event.preventDefault();
          ui.setShowSettingsDialog(false);
        } else if (ui.showExportDialog) {
          event.preventDefault();
          ui.setShowExportDialog(false);
        } else if (ui.showProjectListDialog) {
          event.preventDefault();
          ui.setShowProjectListDialog(false);
        } else if (ui.showNewProjectDialog) {
          event.preventDefault();
          ui.setShowNewProjectDialog(false);
        } else if (ui.showInstrumentPicker) {
          event.preventDefault();
          ui.setShowInstrumentPicker(false);
        } else if (ui.editingClipId !== null) {
          event.preventDefault();
          ui.setEditingClip(null);
        } else if (ui.showGenerationPanel) {
          event.preventDefault();
          ui.setShowGenerationPanel(false);
        } else if (ui.showAIAssistant) {
          event.preventDefault();
          ui.setShowAIAssistant(false);
        } else if (ui.showModelLibrary) {
          event.preventDefault();
          ui.setShowModelLibrary(false);
        } else if (ui.showVST3Panel) {
          event.preventDefault();
          ui.setShowVST3Panel(false);
        } else if (ui.showGenerationHistoryPanel) {
          event.preventDefault();
          ui.setShowGenerationHistoryPanel(false);
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

      if (isInputFocused(event)) return;

      const anyModalOpen =
        ui.showCommandPalette ||
        ui.editingClipId !== null ||
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
      if (matches('view.zoomReset')) {
        event.preventDefault();
        if (ui.keyboardContext.scope === 'timeline') ui.zoomReset();
        else ui.setPixelsPerSecond(DEFAULT_TIMELINE_PIXELS_PER_SECOND);
        return;
      }

      if (matches('project.settings')) { event.preventDefault(); if (!anyModalOpen) ui.openGenerationPanelView('settings'); return; }
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
              try {
                const consolidatedClip = await project.consolidateClips(trackIds[0], selectedIds);
                if (consolidatedClip) ui.selectClip(consolidatedClip.id, false);
              } catch { /* consolidation errors handled by the store */ }
            })();
          }
        }
        return;
      }

      if (matches('clips.generate')) {
        event.preventDefault();
        if (!anyModalOpen && !generation.isGenerating) {
          const [clipId] = ui.selectedClipIds;
          if (clipId) void import('../services/generationPipeline').then(m => m.generateSingleClip(clipId)).catch(err => console.error('Failed to generate clip', err));
        }
        return;
      }

      // Session duplicate (Cmd+D) — must be before the `if (mod) return` guard
      if (ui.keyboardContext.scope === 'session' && matches('session.duplicate')) {
        event.preventDefault();
        const slot = ui.selectedSessionSlot;
        if (slot && project.project) {
          const track = project.project.tracks.find((t) => t.id === slot.trackId);
          if (track) {
            const clip = getSessionClips(track)[slot.sceneIndex];
            if (clip) project.duplicateClip(clip.id);
          }
        }
        return;
      }

      // ── Clipboard: Copy / Cut / Paste ───────────────────────────
      // Must be before the `if (mod) return` guard since these use Cmd/Ctrl.

      // Shared helper: resolve selected clips with their track IDs
      const resolveSelectedClipEntries = () => {
        if (ui.selectedClipIds.size === 0 || !project.project) return [];
        return [...ui.selectedClipIds]
          .map((cid) => {
            for (const track of project.project!.tracks) {
              const clip = track.clips.find((c) => c.id === cid);
              if (clip) return { clip, trackId: track.id };
            }
            return null;
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);
      };

      // Shared helper: resolve selected piano roll notes
      const resolveSelectedNotes = () => {
        const clipId = ui.openPianoRollClipId;
        if (!clipId || ui.selectedPianoRollNoteIds.length === 0) return null;
        const clip = project.getClipById(clipId);
        if (!clip?.midiData) return null;
        const noteIdSet = new Set(ui.selectedPianoRollNoteIds);
        return { clipId, notes: clip.midiData.notes.filter((n) => noteIdSet.has(n.id)) };
      };

      if (matches('clips.copy') && !anyModalOpen) {
        event.preventDefault();
        if (ui.keyboardContext.scope === 'pianoRoll') {
          const resolved = resolveSelectedNotes();
          if (resolved) {
            const data = copyNotes(resolved.notes, resolved.clipId);
            if (data) ui.setClipboard(data);
          }
        } else {
          const entries = resolveSelectedClipEntries();
          const data = copyClips(entries);
          if (data) ui.setClipboard(data);
        }
        return;
      }

      if (matches('clips.cut') && !anyModalOpen) {
        event.preventDefault();
        if (ui.keyboardContext.scope === 'pianoRoll') {
          const resolved = resolveSelectedNotes();
          if (resolved) {
            const data = copyNotes(resolved.notes, resolved.clipId);
            if (data) {
              ui.setClipboard(data);
              // Batch deletions into a single undo entry
              project.beginDrag({ scope: 'pianoRoll', label: 'Cut notes', clipId: resolved.clipId });
              for (const noteId of ui.selectedPianoRollNoteIds) {
                project.removeMidiNote(resolved.clipId, noteId);
              }
              project.endDrag();
              ui.setSelectedPianoRollNoteIds([]);
            }
          }
        } else {
          const entries = resolveSelectedClipEntries();
          if (entries.length === 0) return;
          const data = copyClips(entries);
          if (data) {
            ui.setClipboard(data);
            const ids = [...ui.selectedClipIds];
            ui.deselectAll();
            // Batch deletions into a single undo entry
            project.beginDrag({ scope: 'arrangement', label: 'Cut clips' });
            ids.forEach((id) => project.removeClip(id));
            project.endDrag();
          }
        }
        return;
      }

      if (matches('clips.paste') && !anyModalOpen) {
        event.preventDefault();
        const clipboard = ui.clipboard;
        if (!clipboard) return;

        if (clipboard.type === 'notes' && ui.keyboardContext.scope === 'pianoRoll') {
          const clipId = ui.openPianoRollClipId;
          if (clipId) {
            const clip = project.getClipById(clipId);
            if (clip) {
              const bpm = project.project?.bpm ?? 120;
              const pasteBeat = (transport.currentTime - clip.startTime) * (bpm / 60);
              const newNotes = preparePasteNotes(clipboard, Math.max(0, pasteBeat));
              // Batch note additions into a single undo entry
              project.beginDrag({ scope: 'pianoRoll', label: 'Paste notes', clipId });
              for (const note of newNotes) {
                project.addMidiNote(clipId, note);
              }
              project.endDrag();
              ui.setSelectedPianoRollNoteIds(newNotes.map((n) => n.id));
            }
          }
        } else if (clipboard.type === 'clips') {
          const pastedClips = preparePasteClips(clipboard, transport.currentTime);
          const newIds = project.pasteClipsToTracks(pastedClips);
          if (newIds.length > 0) {
            ui.selectClips(newIds);
          }
        }
        return;
      }

      if (mod) return;
      if (anyModalOpen) return;

      // Session view keyboard shortcuts — must run BEFORE global transport/clip
      // handlers that share the same key combos (Enter, Digit0, Backspace, arrows).
      if (ui.keyboardContext.scope === 'session' && !event.shiftKey && !event.altKey) {
        const proj = project.project;
        if (proj) {
          const orderedTracks = [...proj.tracks].sort((a, b) => a.order - b.order);
          if (orderedTracks.length === 0) return;

          const sceneCount = Math.max(4, ...orderedTracks.map((t) => getSessionClips(t).length));
          const slot = ui.selectedSessionSlot;

          const isUp = matches('session.up');
          const isDown = !isUp && matches('session.down');
          const isLeft = !isUp && !isDown && matches('session.left');
          const isRight = !isUp && !isDown && !isLeft && matches('session.right');

          if (isUp || isDown || isLeft || isRight) {
            event.preventDefault();
            if (!slot) {
              ui.setSelectedSessionSlot({ trackId: orderedTracks[0].id, sceneIndex: 0 });
            } else {
              const trackIdx = Math.max(0, orderedTracks.findIndex((t) => t.id === slot.trackId));
              if (isUp) {
                const next = Math.max(0, trackIdx - 1);
                ui.setSelectedSessionSlot({ trackId: orderedTracks[next].id, sceneIndex: slot.sceneIndex });
              } else if (isDown) {
                const next = Math.min(orderedTracks.length - 1, trackIdx + 1);
                ui.setSelectedSessionSlot({ trackId: orderedTracks[next].id, sceneIndex: slot.sceneIndex });
              } else if (isLeft) {
                ui.setSelectedSessionSlot({ trackId: slot.trackId, sceneIndex: Math.max(0, slot.sceneIndex - 1) });
              } else {
                ui.setSelectedSessionSlot({ trackId: slot.trackId, sceneIndex: Math.min(sceneCount - 1, slot.sceneIndex + 1) });
              }
            }
            return;
          }

          if (slot) {
            if (matches('session.launch')) {
              event.preventDefault();
              const track = orderedTracks.find((t) => t.id === slot.trackId);
              if (track) {
                const clip = getSessionClips(track)[slot.sceneIndex];
                if (clip) {
                  const sceneId = proj.session?.scenes[slot.sceneIndex]?.id;
                  if (sceneId) {
                    useProjectStore.getState().launchSessionClip(track.id, sceneId);
                  }
                }
              }
              return;
            }

            if (matches('session.stop')) {
              event.preventDefault();
              useProjectStore.getState().stopSessionTrack(slot.trackId);
              return;
            }

            if (matches('session.delete')) {
              event.preventDefault();
              const track = orderedTracks.find((t) => t.id === slot.trackId);
              if (track) {
                const clip = getSessionClips(track)[slot.sceneIndex];
                if (clip) project.removeClip(clip.id);
              }
              return;
            }
          }
        }
      }

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
      if (matches('transport.home')) { event.preventDefault(); seek(0); return; }
      if (matches('transport.end')) {
        event.preventDefault();
        if (project.project) seek(project.project.totalDuration);
        return;
      }
      if (matches('transport.punchToggle')) { event.preventDefault(); transport.togglePunch(); return; }
      if (matches('transport.punchIn')) { event.preventDefault(); transport.setPunchIn(transport.currentTime); return; }
      if (matches('transport.punchOut')) { event.preventDefault(); transport.setPunchOut(transport.currentTime); return; }
      if (matches('transport.captureMidi')) {
        event.preventDefault();
        const captureService = getMidiCaptureService();
        const targetTrackId = transport.armedTrackIds[0];
        if (targetTrackId) {
          project.captureMidi(targetTrackId, transport.currentTime, captureService, { bars: 8, quantize: '1/16' });
        }
        return;
      }

      if (matches('transport.videoRecord')) {
        event.preventDefault();
        const vr = ui.videoRecording;
        if (vr.status === 'recording') ui.stopVideoRecording();
        else if (vr.status === 'idle' || vr.status === 'done' || vr.status === 'error') {
          void ui.startVideoRecording().catch((error) => {
            console.error('Failed to start video recording via keyboard shortcut.', error);
          });
        }
        return;
      }

      if (matches('panels.mixer')) { event.preventDefault(); ui.setShowMixer(!ui.showMixer); return; }
      if (matches('panels.smartControls')) { event.preventDefault(); ui.setShowSmartControls(!ui.showSmartControls); return; }
      if (matches('panels.library')) { event.preventDefault(); ui.setShowLibrary(!ui.showLibrary); return; }
      if (matches('panels.strudel')) { event.preventDefault(); ui.toggleStrudelPanel(); return; }
      if (matches('panels.loopBrowser')) { event.preventDefault(); ui.toggleLoopBrowser(); return; }
      if (matches('panels.trackList')) { event.preventDefault(); ui.toggleTrackListDisplayMode(); return; }
      if (matches('panels.tempoLane')) { event.preventDefault(); ui.toggleTempoLane(); return; }
      if (matches('panels.arrangementMarkers')) { event.preventDefault(); ui.toggleArrangementMarkers(); return; }
      if (matches('panels.generation')) { event.preventDefault(); ui.toggleGenerationPanel(); return; }
      if (matches('panels.generationHistory')) { event.preventDefault(); ui.toggleGenerationHistoryPanel(); return; }
      if (matches('panels.modelLibrary')) { event.preventDefault(); ui.toggleModelLibrary(); return; }
      if (matches('panels.clipInspector')) { event.preventDefault(); ui.toggleClipInspector(); return; }
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

      // Delete / Backspace: context-aware deletion
      // - Plain Delete/Backspace → delete selected clips (priority) or do nothing
      // - Cmd+Delete/Cmd+Backspace → delete selected tracks (with confirmation if multi-clip)
      const isDeleteOrBackspace = event.code === 'Backspace' || event.code === 'Delete';
      if (isDeleteOrBackspace && !event.shiftKey && !event.altKey) {
        if (mod) {
          // Cmd+Delete: delete selected tracks
          if (ui.selectedTrackIds.size > 0) {
            event.preventDefault();
            const trackIds = [...ui.selectedTrackIds];
            ui.deselectAllTracks();
            ui.requestDeleteTracks(trackIds);
            return;
          }
        } else {
          // Plain Delete: delete selected clips or clips in select window
          if (ui.selectedClipIds.size > 0) {
            event.preventDefault();
            const ids = [...ui.selectedClipIds];
            ui.deselectAll();
            ids.forEach((id) => project.removeClip(id));
            return;
          }
          // Delete clips within the select window (drag-select region)
          if (ui.selectWindow && project.project) {
            event.preventDefault();
            const sw = ui.selectWindow;
            const trackIdSet = new Set(sw.trackIds);
            const clipIds: string[] = [];
            for (const t of project.project.tracks) {
              if (!trackIdSet.has(t.id)) continue;
              for (const c of t.clips) {
                const clipEnd = c.startTime + c.duration;
                // Clip overlaps the window if it starts before window end AND ends after window start
                if (c.startTime < sw.endTime && clipEnd > sw.startTime) {
                  clipIds.push(c.id);
                }
              }
            }
            if (clipIds.length > 0) {
              ui.setSelectWindow(null);
              clipIds.forEach((id) => project.removeClip(id));
            }
            return;
          }
        }
      }

      if (matches('clips.enhance')) {
        const selected = [...ui.selectedClipIds];
        if (selected.length === 1) {
          event.preventDefault();
          const clipId = selected[0];
          const projectData = project.project;
          if (projectData) {
            const clipTrack = projectData.tracks.find((t) => t.clips.some((c) => c.id === clipId));
            if (clipTrack) {
              const clip = clipTrack.clips.find((c) => c.id === clipId);
              if (clip && clip.generationStatus === 'ready') {
                const sw = ui.selectWindow;
                let range: { start: number; end: number } | null = null;
                if (sw) {
                  const rs = Math.max(sw.startTime, clip.startTime);
                  const re = Math.min(sw.endTime, clip.startTime + clip.duration);
                  if (re > rs) range = { start: rs, end: re };
                }
                ui.openEnhancer(clipId, clipTrack.id, range);
              }
            }
          }
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

      if (matches('clips.splitAll')) {
        event.preventDefault();
        project.splitAllAtPlayhead(transport.currentTime);
        return;
      }

      if (matches('clips.insertTime')) {
        event.preventDefault();
        const sw = ui.selectWindow;
        if (sw) {
          project.insertTime(sw.startTime, sw.endTime - sw.startTime);
          ui.setSelectWindow(null);
        }
        return;
      }

      if (matches('clips.deleteTime')) {
        event.preventDefault();
        const sw = ui.selectWindow;
        if (sw) {
          project.deleteTimeRange(sw.startTime, sw.endTime);
          ui.setSelectWindow(null);
        }
        return;
      }

      if (matches('clips.duplicateSection')) {
        event.preventDefault();
        const sw = ui.selectWindow;
        if (sw) {
          project.duplicateTimeRange(sw.startTime, sw.endTime);
          ui.setSelectWindow(null);
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

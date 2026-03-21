import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';

export type CoreDawShortcutActionId =
  | 'transport.playPause'
  | 'transport.record'
  | 'transport.loop'
  | 'tracks.solo'
  | 'tracks.mute'
  | 'tracks.bypassEffects'
  | 'view.zoomToSelection'
  | 'view.zoomToFit';

export interface CoreDawShortcutRuntime {
  play: () => void;
  pause: () => void;
  toggleRecord: () => void | Promise<void>;
  toggleArmTrack?: (trackId: string, exclusive?: boolean) => void;
}

let runtime: CoreDawShortcutRuntime | null = null;

export function registerCoreDawShortcutRuntime(nextRuntime: CoreDawShortcutRuntime): () => void {
  runtime = nextRuntime;
  return () => {
    if (runtime === nextRuntime) {
      runtime = null;
    }
  };
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

function toggleFocusedTrackFlag(flag: 'muted' | 'soloed'): boolean {
  const ui = useUIStore.getState();
  if (!['timeline', 'mixer', 'pianoRoll'].includes(ui.keyboardContext.scope)) {
    return false;
  }

  const trackId = resolveFocusedTrackId();
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project || !trackId) return false;

  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return false;

  if (track.isGroup) {
    if (flag === 'muted') projectStore.setGroupMuted(trackId, !track.muted);
    else projectStore.setGroupSoloed(trackId, !track.soloed);
  } else {
    projectStore.updateTrack(trackId, { [flag]: !track[flag] });
  }

  ui.setKeyboardContext(ui.keyboardContext.scope, trackId);
  return true;
}

function toggleFocusedTrackEffectsBypass(): boolean {
  const ui = useUIStore.getState();
  if (!['timeline', 'mixer', 'pianoRoll'].includes(ui.keyboardContext.scope)) {
    return false;
  }

  const trackId = resolveFocusedTrackId();
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project || !trackId) return false;

  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.isGroup) return false;

  projectStore.toggleTrackEffectsBypass(trackId);
  ui.setKeyboardContext(ui.keyboardContext.scope, trackId);
  return true;
}

function canZoomArrangement(): boolean {
  const scope = useUIStore.getState().keyboardContext.scope;
  return scope === 'timeline';
}

export async function executeCoreDawShortcut(actionId: CoreDawShortcutActionId): Promise<boolean> {
  const transport = useTransportStore.getState();
  const ui = useUIStore.getState();

  switch (actionId) {
    case 'transport.playPause':
      if (!runtime) return false;
      if (transport.isPlaying) runtime.pause();
      else runtime.play();
      return true;
    case 'transport.record':
      if (!runtime) return false;
      if (!transport.isRecording) {
        const focusedTrackId = resolveFocusedTrackId();
        if (focusedTrackId && !transport.armedTrackIds.includes(focusedTrackId)) {
          runtime.toggleArmTrack?.(focusedTrackId, true);
          ui.setKeyboardContext(ui.keyboardContext.scope, focusedTrackId);
          return true;
        }
      }
      await runtime.toggleRecord();
      return true;
    case 'transport.loop':
      transport.toggleLoop();
      return true;
    case 'tracks.solo':
      return toggleFocusedTrackFlag('soloed');
    case 'tracks.mute':
      return toggleFocusedTrackFlag('muted');
    case 'tracks.bypassEffects':
      return toggleFocusedTrackEffectsBypass();
    case 'view.zoomToSelection':
      if (!canZoomArrangement()) return false;
      ui.zoomTimelineToSelection();
      return true;
    case 'view.zoomToFit':
      if (!canZoomArrangement()) return false;
      ui.zoomTimelineToProject();
      return true;
    default: {
      const exhaustiveCheck: never = actionId;
      return exhaustiveCheck;
    }
  }
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.closest('[contenteditable="true"], [role="textbox"]') !== null;
}

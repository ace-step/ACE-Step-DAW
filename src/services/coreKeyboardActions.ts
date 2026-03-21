import type { ShortcutContext } from '../types/shortcuts';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';
import { resolveFocusedTrackId } from './focusResolution';

const CORE_KEYBOARD_ACTION_IDS = [
  'transport.playPause',
  'transport.loop',
  'transport.record',
  'tracks.mute',
  'tracks.solo',
  'tracks.bypassEffects',
  'view.zoomToSelection',
  'view.zoomToFit',
] as const;

export type CoreKeyboardActionId = typeof CORE_KEYBOARD_ACTION_IDS[number];

export interface CoreKeyboardActionDeps {
  play: () => void | Promise<void>;
  pause: () => void | Promise<void>;
  toggleRecord: () => void | Promise<void>;
  toggleArmTrack: (trackId: string, exclusive?: boolean) => void;
}

const TRACK_SCOPES: ReadonlySet<ShortcutContext> = new Set(['timeline', 'mixer', 'pianoRoll']);

function isCoreKeyboardActionId(actionId: string): actionId is CoreKeyboardActionId {
  return CORE_KEYBOARD_ACTION_IDS.includes(actionId as CoreKeyboardActionId);
}

function toggleFocusedTrackFlag(flag: 'muted' | 'soloed'): boolean {
  const ui = useUIStore.getState();
  if (!TRACK_SCOPES.has(ui.keyboardContext.scope)) return false;

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

async function executeRecordAction({ toggleRecord, toggleArmTrack }: CoreKeyboardActionDeps): Promise<boolean> {
  const ui = useUIStore.getState();
  const transport = useTransportStore.getState();
  const focusedTrackId = resolveFocusedTrackId();

  if (transport.isRecording) {
    await toggleRecord();
    return true;
  }

  if (focusedTrackId && !transport.armedTrackIds.includes(focusedTrackId)) {
    toggleArmTrack(focusedTrackId, true);
    ui.setKeyboardContext(ui.keyboardContext.scope, focusedTrackId);
    return true;
  }

  if (transport.armedTrackIds.length > 0) {
    await toggleRecord();
    return true;
  }

  return false;
}

function toggleFocusedTrackEffectsBypass(): boolean {
  const ui = useUIStore.getState();
  if (!TRACK_SCOPES.has(ui.keyboardContext.scope)) return false;

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

export async function executeCoreKeyboardAction(
  actionId: CoreKeyboardActionId | string,
  deps: CoreKeyboardActionDeps,
): Promise<boolean> {
  if (!isCoreKeyboardActionId(actionId)) return false;

  const transport = useTransportStore.getState();
  const ui = useUIStore.getState();

  switch (actionId) {
    case 'transport.playPause':
      if (transport.isPlaying) await deps.pause();
      else await deps.play();
      return true;

    case 'transport.loop':
      transport.toggleLoop();
      return true;

    case 'transport.record':
      return executeRecordAction(deps);

    case 'tracks.mute':
      return toggleFocusedTrackFlag('muted');

    case 'tracks.solo':
      return toggleFocusedTrackFlag('soloed');

    case 'tracks.bypassEffects':
      return toggleFocusedTrackEffectsBypass();

    case 'view.zoomToSelection':
      if (ui.keyboardContext.scope !== 'timeline') return false;
      ui.zoomTimelineToSelection();
      return true;

    case 'view.zoomToFit':
      if (ui.keyboardContext.scope !== 'timeline') return false;
      ui.zoomTimelineToProject();
      return true;

    default:
      return false;
  }
}

export function createCoreKeyboardActions(deps: CoreKeyboardActionDeps) {
  return {
    execute: (actionId: CoreKeyboardActionId | string) => executeCoreKeyboardAction(actionId, deps),
  };
}

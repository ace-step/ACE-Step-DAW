/**
 * Stable public API barrel for the ACE-Step DAW.
 *
 * This module provides a single entry point for typed access to all DAW stores,
 * ensuring parity between UI interactions and agent/automation workflows.
 *
 * Usage:
 *   import { getDAWApi } from './api/dawApi';
 *   const api = getDAWApi();
 *   api.project.getState().addTrack('drums');
 *   api.transport.getState().play();
 */

import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';
import { useGenerationStore } from '../store/generationStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { useSessionStore } from '../store/sessionStore';
import { useShortcutsStore } from '../store/shortcutsStore';
import { createCoreKeyboardActions } from '../services/coreKeyboardActions';
import type { DAWStore } from '../types/dawActions';
import type { ProjectState } from '../store/projectStore';
import type { TransportState } from '../store/transportStore';
import type { UIState } from '../store/uiStore';
import type { GenerationState } from '../store/generationStore';
import type { CollaborationState } from '../store/collaborationStore';
import type { SessionState } from '../store/sessionStore';
import type { ShortcutsState } from '../store/shortcutsStore';

export interface DAWCommandApi {
  executeCoreShortcut: ReturnType<typeof createCoreKeyboardActions>['execute'];
}

/** Typed references to all DAW Zustand stores. */
export interface DAWApi {
  project: DAWStore<ProjectState>;
  transport: DAWStore<TransportState>;
  ui: DAWStore<UIState>;
  generation: DAWStore<GenerationState>;
  collaboration: DAWStore<CollaborationState>;
  session: DAWStore<SessionState>;
  shortcuts: DAWStore<ShortcutsState>;
  commands: DAWCommandApi;
}

/** Returns typed references to all DAW Zustand stores. */
export function getDAWApi(): DAWApi {
  const coreKeyboardActions = createCoreKeyboardActions({
    play: () => useTransportStore.getState().play(),
    pause: () => useTransportStore.getState().pause(),
    toggleRecord: () => useTransportStore.getState().setIsRecording(!useTransportStore.getState().isRecording),
    toggleArmTrack: (trackId, exclusive = true) => {
      useTransportStore.getState().toggleArmTrack(trackId, exclusive);
      const isArmed = useTransportStore.getState().armedTrackIds.includes(trackId);
      useProjectStore.getState().updateTrack(trackId, { armed: isArmed });
    },
  });

  return {
    project: useProjectStore,
    transport: useTransportStore,
    ui: useUIStore,
    generation: useGenerationStore,
    collaboration: useCollaborationStore,
    session: useSessionStore,
    shortcuts: useShortcutsStore,
    commands: {
      executeCoreShortcut: coreKeyboardActions.execute,
    },
  };
}

// Re-export types for consumers
export type {
  ProjectActions,
  TransportActions,
  UIActions,
  GenerationActions,
  CollaborationActions,
  SessionActions,
  ShortcutsActions,
  DAWActions,
  DAWStore,
  DAWGlobals,
  CommandPaletteGlobal,
  ProjectState,
  TransportState,
  UIState,
  GenerationState,
  CollaborationState,
  SessionState,
  ShortcutsState,
} from '../types/dawActions';

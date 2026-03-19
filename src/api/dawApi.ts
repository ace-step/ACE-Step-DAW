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
import type { DAWStore } from '../types/dawActions';
import type { ProjectState } from '../store/projectStore';
import type { TransportState } from '../store/transportStore';
import type { UIState } from '../store/uiStore';
import type { GenerationState } from '../store/generationStore';
import type { CollaborationState } from '../store/collaborationStore';
import type { SessionState } from '../store/sessionStore';
import type { ShortcutsState } from '../store/shortcutsStore';

/** Typed references to all DAW Zustand stores. */
export interface DAWApi {
  project: DAWStore<ProjectState>;
  transport: DAWStore<TransportState>;
  ui: DAWStore<UIState>;
  generation: DAWStore<GenerationState>;
  collaboration: DAWStore<CollaborationState>;
  session: DAWStore<SessionState>;
  shortcuts: DAWStore<ShortcutsState>;
}

/** Returns typed references to all DAW Zustand stores. */
export function getDAWApi(): DAWApi {
  return {
    project: useProjectStore,
    transport: useTransportStore,
    ui: useUIStore,
    generation: useGenerationStore,
    collaboration: useCollaborationStore,
    session: useSessionStore,
    shortcuts: useShortcutsStore,
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

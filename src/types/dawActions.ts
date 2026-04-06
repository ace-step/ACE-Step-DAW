/**
 * Typed DAW Action API — Issue #385
 *
 * This module defines the public typed interface for all DAW actions,
 * providing parity between UI interactions and agent/automation workflows.
 *
 * Usage:
 *   import type { ProjectActions, TransportActions, DAWGlobals } from '../types/dawActions';
 *
 * All action types are derived from the canonical store state interfaces,
 * so they stay in sync automatically.
 */

import type { StoreApi } from 'zustand';
import type { ProjectState } from '../store/projectStore';
import type { TransportState } from '../store/transportStore';
import type { UIState } from '../store/uiStore';
import type { GenerationState } from '../store/generationStore';
import type { CollaborationState } from '../store/collaborationStore';
import type { SessionState } from '../store/sessionStore';
import type { ShortcutsState } from '../store/shortcutsStore';
import type { CoreDawShortcutActionId } from '../services/coreDawShortcuts';
import type { CoreKeyboardActionId } from '../services/coreKeyboardActions';

// ---------------------------------------------------------------------------
// Helper: extract only function-typed keys from a state interface
// ---------------------------------------------------------------------------
type ActionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

// ---------------------------------------------------------------------------
// Per-store action interfaces (only the callable methods, not state fields)
// ---------------------------------------------------------------------------

/** Typed actions from the project store (tracks, clips, MIDI, effects, etc.). */
export type ProjectActions = Pick<ProjectState, ActionKeys<ProjectState>>;

/** Typed actions from the transport store (play, pause, seek, etc.). */
export type TransportActions = Pick<TransportState, ActionKeys<TransportState>>;

/** Typed actions from the UI store (selection, zoom, panels, etc.). */
export type UIActions = Pick<UIState, ActionKeys<UIState>>;

/** Typed actions from the generation store (AI generation jobs). */
export type GenerationActions = Pick<GenerationState, ActionKeys<GenerationState>>;

/** Typed actions from the collaboration store (sharing, collaborators). */
export type CollaborationActions = Pick<CollaborationState, ActionKeys<CollaborationState>>;

/** Typed actions from the session store (clip slots, scenes, MIDI capture). */
export type SessionActions = Pick<SessionState, ActionKeys<SessionState>>;

/** Typed actions from the shortcuts store (key bindings). */
export type ShortcutsActions = Pick<ShortcutsState, ActionKeys<ShortcutsState>>;

// ---------------------------------------------------------------------------
// Unified DAW action interface — all actions in a single contract
// ---------------------------------------------------------------------------

/** All DAW actions combined into a single typed contract. */
export interface DAWActions {
  project: ProjectActions;
  transport: TransportActions;
  ui: UIActions;
  generation: GenerationActions;
  collaboration: CollaborationActions;
  session: SessionActions;
  shortcuts: ShortcutsActions;
}

// ---------------------------------------------------------------------------
// Typed Zustand store references (for window.__store etc.)
// ---------------------------------------------------------------------------

/** A Zustand store reference with getState/setState/subscribe. */
export type DAWStore<T> = StoreApi<T> & { getState: () => T };

export type AgentProjectState = ProjectState & Pick<
  UIState,
  'activePianoRollTool'
  | 'setActivePianoRollTool'
  | 'togglePianoRollPencilTool'
  | 'showGenerationPanel'
  | 'setShowGenerationPanel'
  | 'toggleGenerationPanel'
  | 'zoomTimelineToSelection'
  | 'zoomTimelineToProject'
> & Pick<
  GenerationState,
  'generationForm'
  | 'jobs'
  | 'lastSubmittedRequest'
  | 'variationSession'
  | 'submitGenerationRequest'
> & {
  activePianoRollChordShape: UIState['activePianoRollChordShape'];
  setActivePianoRollChordShape: UIState['setActivePianoRollChordShape'];
};

// ---------------------------------------------------------------------------
// Global window augmentation for agent/automation access
// ---------------------------------------------------------------------------

/** Shape of the command palette global helper. */
export interface CommandPaletteGlobal {
  list: (query?: string) => ReturnType<UIState['getCommandPaletteRegistry']>;
  search: (query?: string) => ReturnType<UIState['searchCommandPalette']>;
  execute: (commandId: string) => ReturnType<UIState['executeCommandPaletteCommand']>;
  open: (query?: string) => void;
  close: () => void;
}

export interface CoreDawShortcutsGlobal {
  execute: (actionId: CoreDawShortcutActionId) => Promise<boolean>;
}

export interface KeyboardCommandsGlobal {
  execute: (actionId: CoreKeyboardActionId) => Promise<boolean>;
}

/** Type declarations for all globals exposed on `window` for agent/automation use. */
export interface DAWGlobals {
  __store: DAWStore<AgentProjectState>;
  __uiStore: DAWStore<UIState>;
  __assistantStore: DAWStore<UIState>;
  __transportStore: DAWStore<TransportState>;
  __collaborationStore: DAWStore<CollaborationState>;
  __generationStore: DAWStore<GenerationState>;
  __sessionStore: DAWStore<SessionState>;
  __shortcutsStore: DAWStore<ShortcutsState>;
  __coreDawShortcuts: CoreDawShortcutsGlobal;
  __getAudioEngine: () => unknown;
  __commandPalette: CommandPaletteGlobal;
  __keyboardCommands: KeyboardCommandsGlobal;
  __dawSummary: () => string;
  __dawStructure: () => unknown;
  __midiCaptureService: unknown;
  __strudelApi: {
    analyzePattern: (code: string, bars?: number) => Promise<{
      noteCount: number;
      instruments: string[];
      hasMelodicContent: boolean;
      pitchRange: [number, number];
      cycleLengthBars: number;
      rhythmicDensity: number;
      suggestedPrompt: string;
    }>;
    getTrackSummary: () => Array<{
      trackId: string;
      displayName: string;
      code: string;
      versionCount: number;
      cycleLength: number;
    }>;
    listPresets: () => Array<{
      name: string;
      genre: string;
      code: string;
      roles: { drums: string; bass: string; chords: string; melody: string };
    }>;
    updateTrackCode: (trackId: string, newCode: string, label?: string) => string | null;
    diffCode: (before: string, after: string) => {
      unified: string;
      summary: string;
      added: number;
      removed: number;
    };
    diffTrackVersion: (trackId: string, versionIndex: number) => {
      unified: string;
      summary: string;
      added: number;
      removed: number;
    } | null;
    listTemplates: () => Array<{
      id: string;
      genre: string;
      description: string;
      code: string;
      complexity: 'simple' | 'moderate' | 'complex';
      bpmRange: { min: number; max: number };
      instruments: string[];
      agentInstructions: string;
    }>;
    getTemplateByGenre: (genre: string) => unknown;
    getTemplatesByComplexity: (complexity: 'simple' | 'moderate' | 'complex') => unknown[];
    getTemplatesByBpmRange: (minBpm: number, maxBpm: number) => unknown[];
    getEventLog: (filter?: {
      event?: string;
      level?: 'debug' | 'info' | 'warn' | 'error';
      since?: number;
      limit?: number;
    }) => Array<{
      timestamp: number;
      event: string;
      level: string;
      data: Record<string, unknown>;
    }>;
    clearEventLog: () => void;
    subscribeToEvents: (callback: (entry: unknown) => void) => () => void;
  };
}

// Re-export the full state interfaces for consumers that need both state + actions
export type {
  ProjectState,
  TransportState,
  UIState,
  GenerationState,
  CollaborationState,
  SessionState,
  ShortcutsState,
};

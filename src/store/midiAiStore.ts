/**
 * Zustand store for MIDI AI generation in the Piano Roll (#739).
 *
 * Manages:
 * - Generation state (idle, generating, previewing)
 * - Selection region for infill/generation
 * - Locked note IDs (excluded from regeneration)
 * - Generated preview notes with accept/reject workflow
 * - Generation parameters (mode, temperature, model, etc.)
 */
import { create } from 'zustand';
import type { MidiNote } from '../types/project';
import type { MidiGenerationMode } from '../types/api';

export type MidiAiStatus = 'idle' | 'generating' | 'previewing' | 'error';

/** A generated MIDI variation awaiting user approval. */
export interface MidiAiVariation {
  /** Unique ID for this variation */
  id: string;
  /** Generated notes */
  notes: MidiNote[];
  /** Quality score from model (0.0–1.0) */
  score?: number;
  /** Model that produced this result */
  model: string;
}

export interface MidiAiState {
  /** Current status of the MIDI AI feature */
  status: MidiAiStatus;

  /** Error message when status is 'error' */
  error: string | null;

  /** Generation mode */
  mode: MidiGenerationMode;

  /** Selection region in beats (for infill mode) */
  selectionStartBeat: number | null;
  selectionEndBeat: number | null;

  /** IDs of notes locked from regeneration */
  lockedNoteIds: Set<string>;

  /** Generated variations awaiting approval */
  variations: MidiAiVariation[];

  /** Currently previewed variation index */
  activeVariationIndex: number;

  /** Clip ID being operated on */
  targetClipId: string | null;

  /** Track ID being operated on */
  targetTrackId: string | null;

  /** Temperature for sampling (0.0–2.0) */
  temperature: number;

  /** Number of variations to generate */
  numResults: number;

  /** Model to use */
  model: string;

  /** Style hint */
  style: string;

  /** Whether the AI generation panel is visible in the Piano Roll */
  panelOpen: boolean;

  // ─── Actions ──────────────────────────────────────────

  /** Open the AI generation panel for a clip */
  openPanel: (trackId: string, clipId: string) => void;

  /** Close the panel and reset state */
  closePanel: () => void;

  /** Set the generation mode */
  setMode: (mode: MidiGenerationMode) => void;

  /** Set the selection region (in beats) */
  setSelection: (startBeat: number, endBeat: number) => void;

  /** Clear the selection region */
  clearSelection: () => void;

  /** Toggle a note's locked state */
  toggleNoteLock: (noteId: string) => void;

  /** Lock specific notes */
  lockNotes: (noteIds: string[]) => void;

  /** Unlock specific notes */
  unlockNotes: (noteIds: string[]) => void;

  /** Clear all locked notes */
  clearLockedNotes: () => void;

  /** Set generation parameters */
  setTemperature: (temp: number) => void;
  setNumResults: (n: number) => void;
  setModel: (model: string) => void;
  setStyle: (style: string) => void;

  /** Start generation (sets status to 'generating') */
  startGeneration: () => void;

  /** Set generation results (transitions to 'previewing') */
  setVariations: (variations: MidiAiVariation[]) => void;

  /** Navigate between variations */
  setActiveVariation: (index: number) => void;
  nextVariation: () => void;
  prevVariation: () => void;

  /** Accept the current variation (caller applies notes to clip) */
  acceptVariation: () => MidiAiVariation | null;

  /** Reject all variations and return to idle */
  rejectVariations: () => void;

  /** Set error state */
  setError: (error: string) => void;

  /** Reset to idle (e.g., after error recovery) */
  reset: () => void;
}

const INITIAL_STATE = {
  status: 'idle' as MidiAiStatus,
  error: null,
  mode: 'infill' as MidiGenerationMode,
  selectionStartBeat: null,
  selectionEndBeat: null,
  lockedNoteIds: new Set<string>(),
  variations: [],
  activeVariationIndex: 0,
  targetClipId: null,
  targetTrackId: null,
  temperature: 1.0,
  numResults: 3,
  model: 'anticipatory-music-transformer',
  style: '',
  panelOpen: false,
};

export const useMidiAiStore = create<MidiAiState>((set, get) => ({
  ...INITIAL_STATE,
  // Need a mutable copy of lockedNoteIds
  lockedNoteIds: new Set<string>(),

  openPanel: (trackId, clipId) =>
    set({
      panelOpen: true,
      targetTrackId: trackId,
      targetClipId: clipId,
      status: 'idle',
      error: null,
      variations: [],
      activeVariationIndex: 0,
    }),

  closePanel: () =>
    set({
      ...INITIAL_STATE,
      lockedNoteIds: new Set<string>(),
    }),

  setMode: (mode) => set({ mode }),

  setSelection: (startBeat, endBeat) =>
    set({
      selectionStartBeat: Math.min(startBeat, endBeat),
      selectionEndBeat: Math.max(startBeat, endBeat),
    }),

  clearSelection: () =>
    set({ selectionStartBeat: null, selectionEndBeat: null }),

  toggleNoteLock: (noteId) => {
    const locked = new Set(get().lockedNoteIds);
    if (locked.has(noteId)) {
      locked.delete(noteId);
    } else {
      locked.add(noteId);
    }
    set({ lockedNoteIds: locked });
  },

  lockNotes: (noteIds) => {
    const locked = new Set(get().lockedNoteIds);
    for (const id of noteIds) locked.add(id);
    set({ lockedNoteIds: locked });
  },

  unlockNotes: (noteIds) => {
    const locked = new Set(get().lockedNoteIds);
    for (const id of noteIds) locked.delete(id);
    set({ lockedNoteIds: locked });
  },

  clearLockedNotes: () => set({ lockedNoteIds: new Set<string>() }),

  setTemperature: (temperature) =>
    set({ temperature: Math.max(0, Math.min(2, temperature)) }),

  setNumResults: (numResults) =>
    set({ numResults: Math.max(1, Math.min(8, numResults)) }),

  setModel: (model) => set({ model }),

  setStyle: (style) => set({ style }),

  startGeneration: () =>
    set({ status: 'generating', error: null, variations: [], activeVariationIndex: 0 }),

  setVariations: (variations) =>
    set({
      status: variations.length > 0 ? 'previewing' : 'idle',
      variations,
      activeVariationIndex: 0,
    }),

  setActiveVariation: (index) => {
    const { variations } = get();
    if (index >= 0 && index < variations.length) {
      set({ activeVariationIndex: index });
    }
  },

  nextVariation: () => {
    const { activeVariationIndex, variations } = get();
    if (activeVariationIndex < variations.length - 1) {
      set({ activeVariationIndex: activeVariationIndex + 1 });
    }
  },

  prevVariation: () => {
    const { activeVariationIndex } = get();
    if (activeVariationIndex > 0) {
      set({ activeVariationIndex: activeVariationIndex - 1 });
    }
  },

  acceptVariation: () => {
    const { variations, activeVariationIndex } = get();
    const variation = variations[activeVariationIndex] ?? null;
    set({
      status: 'idle',
      variations: [],
      activeVariationIndex: 0,
    });
    return variation;
  },

  rejectVariations: () =>
    set({
      status: 'idle',
      variations: [],
      activeVariationIndex: 0,
    }),

  setError: (error) => set({ status: 'error', error }),

  reset: () =>
    set({
      status: 'idle',
      error: null,
      variations: [],
      activeVariationIndex: 0,
    }),
}));

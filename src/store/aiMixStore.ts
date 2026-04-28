/**
 * Zustand store for AI Mixing (#738).
 *
 * Manages:
 * - Mix analysis status (idle, analyzing, reviewing)
 * - AI-suggested parameters vs current parameters (diff view)
 * - Accept/reject/tweak workflow for AI mix suggestions
 */
import { create } from 'zustand';
import type { AiMixMode, AiMixResult, TrackMixParams, MasterMixParams } from '../types/api';

export type AiMixStatus = 'idle' | 'analyzing' | 'reviewing' | 'error';

export interface AiMixState {
  /** Current status */
  status: AiMixStatus;

  /** Error message when status is 'error' */
  error: string | null;

  /** Mixing mode */
  mode: AiMixMode;

  /** Text prompt for 'text' mode */
  textPrompt: string;

  /** Target loudness in LUFS */
  targetLufs: number;

  /** AI-suggested mix result */
  suggestion: AiMixResult | null;

  /** Whether the AI Mix panel is visible */
  panelOpen: boolean;

  /** Which track's diff is expanded (null = all collapsed) */
  expandedTrackName: string | null;

  // ─── Actions ──────────────────────────────────────────

  /** Open the AI Mix panel */
  openPanel: () => void;

  /** Close the panel and reset */
  closePanel: () => void;

  /** Set mixing mode */
  setMode: (mode: AiMixMode) => void;

  /** Set text prompt */
  setTextPrompt: (prompt: string) => void;

  /** Set target loudness */
  setTargetLufs: (lufs: number) => void;

  /** Start analysis (sets status to 'analyzing') */
  startAnalysis: () => void;

  /** Set AI suggestion result (transitions to 'reviewing') */
  setSuggestion: (result: AiMixResult) => void;

  /** Accept all suggestions */
  acceptAll: () => AiMixResult | null;

  /** Accept suggestions for a single track */
  acceptTrack: (trackName: string) => TrackMixParams | null;

  /** Accept master bus suggestions */
  acceptMaster: () => MasterMixParams | null;

  /** Reject all suggestions */
  reject: () => void;

  /** Toggle expanded track diff */
  toggleTrackExpand: (trackName: string) => void;

  /** Set error state */
  setError: (error: string) => void;

  /** Reset to idle */
  reset: () => void;
}

export const useAiMixStore = create<AiMixState>((set, get) => ({
  status: 'idle',
  error: null,
  mode: 'auto',
  textPrompt: '',
  targetLufs: -14,
  suggestion: null,
  panelOpen: false,
  expandedTrackName: null,

  openPanel: () => set({ panelOpen: true, status: 'idle', error: null }),

  closePanel: () =>
    set({
      panelOpen: false,
      status: 'idle',
      error: null,
      suggestion: null,
      expandedTrackName: null,
    }),

  setMode: (mode) => set({ mode }),

  setTextPrompt: (textPrompt) => set({ textPrompt }),

  setTargetLufs: (targetLufs) =>
    set({ targetLufs: Math.max(-24, Math.min(-6, targetLufs)) }),

  startAnalysis: () =>
    set({ status: 'analyzing', error: null, suggestion: null }),

  setSuggestion: (result) =>
    set({ status: 'reviewing', suggestion: result }),

  acceptAll: () => {
    const result = get().suggestion;
    set({ status: 'idle', suggestion: null, expandedTrackName: null });
    return result;
  },

  acceptTrack: (trackName) => {
    const { suggestion } = get();
    if (!suggestion) return null;
    const params = suggestion.tracks[trackName] ?? null;
    if (params) {
      // Remove the accepted track from remaining suggestions
      const remaining = { ...suggestion.tracks };
      delete remaining[trackName];
      const hasRemainingTracks = Object.keys(remaining).length > 0;
      const hasRemainingMaster = Object.keys(suggestion.master).length > 0;
      const hasRemaining = hasRemainingTracks || hasRemainingMaster;
      set({
        suggestion: hasRemaining ? { ...suggestion, tracks: remaining } : null,
        status: hasRemaining ? 'reviewing' : 'idle',
      });
    }
    return params;
  },

  acceptMaster: () => {
    const { suggestion } = get();
    if (!suggestion) return null;
    const master = suggestion.master;
    const hasTrackSuggestions = Object.keys(suggestion.tracks).length > 0;
    set({
      suggestion: hasTrackSuggestions
        ? { ...suggestion, master: {} }
        : null,
      status: hasTrackSuggestions ? 'reviewing' : 'idle',
    });
    return master;
  },

  reject: () =>
    set({ status: 'idle', suggestion: null, expandedTrackName: null }),

  toggleTrackExpand: (trackName) => {
    const current = get().expandedTrackName;
    set({ expandedTrackName: current === trackName ? null : trackName });
  },

  setError: (error) => set({ status: 'error', error }),

  reset: () =>
    set({ status: 'idle', error: null, suggestion: null }),
}));

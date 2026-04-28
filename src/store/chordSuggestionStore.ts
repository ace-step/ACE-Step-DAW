/**
 * Zustand store for AI chord suggestions (ChordSeqAI integration).
 */
import { create } from 'zustand';
import type {
  ChordSuggestion,
  ChordSuggestionStatus,
  ChordModelVariant,
  ChordStyleCondition,
  ChordGenre,
  ChordDecade,
} from '../types/chordSuggestion';
import { getChordByIndex } from '../utils/chordVocabulary';

export interface ChordSuggestionState {
  /** Current chord progression as token indices. */
  progression: number[];

  /** Model prediction results — top suggestions for the next chord. */
  suggestions: ChordSuggestion[];

  /** Service status. */
  status: ChordSuggestionStatus;

  /** Error message if status is 'error'. */
  error: string | null;

  /** Selected model variant. */
  modelVariant: ChordModelVariant;

  /** Style conditioning for conditional models. */
  styleCondition: ChordStyleCondition;

  /** Number of top suggestions to show. */
  topK: number;

  /** Whether the suggestion panel is visible. */
  panelOpen: boolean;

  // ─── Actions ──────────────────────────────────────────

  /** Add a chord token to the progression and trigger prediction. */
  addChord: (tokenIndex: number) => void;

  /** Remove the last chord from the progression. */
  removeLastChord: () => void;

  /** Clear the entire progression. */
  clearProgression: () => void;

  /** Set the full progression (e.g., from loading a saved state). */
  setProgression: (tokens: number[]) => void;

  /** Update suggestions from worker prediction. */
  setSuggestions: (suggestions: Array<{ tokenIndex: number; probability: number }>) => void;

  /** Update status. */
  setStatus: (status: ChordSuggestionStatus) => void;

  /** Set error. */
  setError: (error: string) => void;

  /** Change model variant. */
  setModelVariant: (variant: ChordModelVariant) => void;

  /** Set genre weight. */
  setGenreWeight: (genre: ChordGenre, weight: number) => void;

  /** Set decade weight. */
  setDecadeWeight: (decade: ChordDecade, weight: number) => void;

  /** Clear all style conditioning. */
  clearStyleCondition: () => void;

  /** Set how many suggestions to show. */
  setTopK: (k: number) => void;

  /** Toggle the suggestion panel. */
  togglePanel: () => void;

  /** Open/close the suggestion panel explicitly. */
  setPanelOpen: (open: boolean) => void;
}

export const useChordSuggestionStore = create<ChordSuggestionState>((set) => ({
  progression: [],
  suggestions: [],
  status: 'idle',
  error: null,
  modelVariant: 'transformer-s',
  styleCondition: { genres: {}, decades: {} },
  topK: 8,
  panelOpen: false,

  addChord(tokenIndex: number) {
    set((state) => ({
      progression: [...state.progression, tokenIndex],
    }));
  },

  removeLastChord() {
    set((state) => ({
      progression: state.progression.slice(0, -1),
      suggestions: state.progression.length <= 1 ? [] : state.suggestions,
    }));
  },

  clearProgression() {
    set({ progression: [], suggestions: [] });
  },

  setProgression(tokens: number[]) {
    set({ progression: tokens });
  },

  setSuggestions(raw: Array<{ tokenIndex: number; probability: number }>) {
    const suggestions: ChordSuggestion[] = raw
      .map(({ tokenIndex, probability }) => {
        const token = getChordByIndex(tokenIndex);
        if (!token) return null;
        return { token, probability };
      })
      .filter((s): s is ChordSuggestion => s !== null);
    set({ suggestions, status: 'ready' });
  },

  setStatus(status: ChordSuggestionStatus) {
    set({ status });
  },

  setError(error: string) {
    set({ status: 'error', error });
  },

  setModelVariant(variant: ChordModelVariant) {
    set({ modelVariant: variant });
  },

  setGenreWeight(genre: ChordGenre, weight: number) {
    set((state) => ({
      styleCondition: {
        ...state.styleCondition,
        genres: { ...state.styleCondition.genres, [genre]: weight },
      },
    }));
  },

  setDecadeWeight(decade: ChordDecade, weight: number) {
    set((state) => ({
      styleCondition: {
        ...state.styleCondition,
        decades: { ...state.styleCondition.decades, [decade]: weight },
      },
    }));
  },

  clearStyleCondition() {
    set({ styleCondition: { genres: {}, decades: {} } });
  },

  setTopK(k: number) {
    set({ topK: Math.max(1, Math.min(20, k)) });
  },

  togglePanel() {
    set((state) => ({ panelOpen: !state.panelOpen }));
  },

  setPanelOpen(open: boolean) {
    set({ panelOpen: open });
  },
}));

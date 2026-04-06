/**
 * Zustand store for the AI Arrangement Assistant.
 * Manages detected sections, suggestions, and user interactions.
 */
import { create } from 'zustand';
import type {
  ArrangementSection,
  ArrangementSuggestion,
  ArrangementAnalysis,
} from '../types/arrangement';
import { analyzeArrangement } from '../services/arrangementAnalysis';
import { useProjectStore } from './projectStore';

export interface ArrangementAssistantState {
  /** Whether the assistant panel is visible. */
  isOpen: boolean;
  /** Whether analysis is in progress. */
  isAnalyzing: boolean;
  /** Detected sections from the last analysis. */
  sections: ArrangementSection[];
  /** Generated suggestions. */
  suggestions: ArrangementSuggestion[];
  /** Project metadata from the last analysis. */
  projectMeta: ArrangementAnalysis['projectMeta'] | null;
  /** Error message from the last analysis. */
  error: string | null;
  /** ID of the project that was last analyzed (for stale detection). */
  lastAnalyzedProjectId: string | null;

  // ─── Actions ────────────────────────────────────────────────
  /** Open/close the assistant panel. */
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Run arrangement analysis on the current project. */
  analyze: () => void;
  /** Accept a suggestion. */
  acceptSuggestion: (id: string) => void;
  /** Reject (dismiss) a suggestion. */
  rejectSuggestion: (id: string) => void;
  /** Clear all suggestions and sections. */
  clear: () => void;
}

/** Monotonic run counter to guard against stale setTimeout callbacks. */
let analysisRunId = 0;

export const useArrangementAssistantStore = create<ArrangementAssistantState>((set, get) => ({
  isOpen: false,
  isAnalyzing: false,
  sections: [],
  suggestions: [],
  projectMeta: null,
  error: null,
  lastAnalyzedProjectId: null,

  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  analyze: () => {
    const project = useProjectStore.getState().project;
    if (!project) {
      analysisRunId++;
      set({
        sections: [],
        suggestions: [],
        projectMeta: null,
        error: 'No project open',
        isAnalyzing: false,
        lastAnalyzedProjectId: null,
      });
      return;
    }

    const runId = ++analysisRunId;
    set({ isAnalyzing: true, error: null });

    // Yield to the event loop so the spinner renders before heavy sync work
    setTimeout(() => {
      // Guard: if a newer analyze() was called, discard this result
      if (runId !== analysisRunId) return;

      try {
        const analysis = analyzeArrangement(project);
        set({
          sections: analysis.sections,
          suggestions: analysis.suggestions,
          projectMeta: analysis.projectMeta,
          isAnalyzing: false,
          lastAnalyzedProjectId: project.id,
        });
      } catch (err) {
        set({
          sections: [],
          suggestions: [],
          projectMeta: null,
          error: err instanceof Error ? err.message : 'Analysis failed',
          isAnalyzing: false,
          lastAnalyzedProjectId: project.id,
        });
      }
    }, 0);
  },

  acceptSuggestion: (id) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, status: 'accepted' as const } : sg,
      ),
    })),

  rejectSuggestion: (id) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, status: 'rejected' as const } : sg,
      ),
    })),

  clear: () => {
    analysisRunId++;
    set({
      isAnalyzing: false,
      sections: [],
      suggestions: [],
      projectMeta: null,
      error: null,
      lastAnalyzedProjectId: null,
    });
  },
}));

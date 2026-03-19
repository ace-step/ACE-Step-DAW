import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIChatMessage } from '../types/aiAssistant';
import type { InlineSuggestion } from '../types/suggestions';
import { useProjectStore } from './projectStore';
import { useTransportStore } from './transportStore';
import type { AIChatContext } from '../utils/aiAssistantContext';
import { buildAssistantContext } from '../utils/aiAssistantContext';
import { getAssistantSuggestions, streamAssistantResponse } from '../services/aiAssistantService';

function createAssistantMessage(role: AIChatMessage['role'], content: string): AIChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

interface UIState {
  pixelsPerSecond: number;
  snapEnabled: boolean;
  scrollX: number;
  scrollY: number;
  selectedClipIds: Set<string>;
  editingClipId: string | null;
  showNewProjectDialog: boolean;
  showInstrumentPicker: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  showProjectListDialog: boolean;
  /** Controls the BatchGenerateModal — lifted from GenerationPanel so keyboard shortcuts can open it. */
  batchGenerateMode: 'silence' | 'context' | null;
  /** Optional time range pre-filled into BatchGenerateModal when opened from a lane drag-select or context menu. */
  batchGenerateInitialRange: { startTime: number; duration: number } | null;
  showKeyboardShortcutsDialog: boolean;
  showShortcutEditorDialog: boolean;
  showMixer: boolean;
  mixerHeight: number;
  showAssetsPanel: boolean;
  assetsPanelWidth: number;
  trackListWidth: number;
  /** Global context window set by Option/Alt+drag on the timeline. */
  contextWindow: { startTime: number; endTime: number; trackIds: string[] } | null;
  /** Multi-track select window set by Cmd/Ctrl+drag on the timeline. */
  selectWindow: { startTime: number; endTime: number; trackIds: string[] } | null;
  /** Track whose inspector panel is currently expanded. */
  expandedTrackId: string | null;
  /** Track whose sequencer editor is currently open (bottom panel). */
  openSequencerTrackId: string | null;
  openDrumMachineTrackId: string | null;
  openPianoRollTrackId: string | null;
  openPianoRollClipId: string | null;
  openEffectChainTrackId: string | null;
  openMidiEffectChainTrackId: string | null;
  drumMachineEditorHeight: number;
  sequencerEditorHeight: number;
  pianoRollHeight: number;
  effectChainHeight: number;
  showSmartControls: boolean;
  showLibrary: boolean;
  /** Which bottom editor is visible: null = none, 'smart' = smart controls, 'editor' = region editor */
  activeBottomPanel: 'smart' | 'editor' | 'pianoRoll' | 'effects' | 'drumMachine' | null;

  // Tempo lane
  showTempoLane: boolean;

  // Loop Browser
  loopBrowserOpen: boolean;
  loopBrowserCategory: 'All' | 'Drums' | 'Bass' | 'Keys' | 'Synth';
  loopBrowserSearch: string;
  previewingLoopId: string | null;

  // Cover / Repaint modals
  coverClipId: string | null;
  repaintClipId: string | null;
  repaintRange: { start: number; end: number } | null;

  // Vocal2BGM / Audio Analysis
  vocal2bgmClipId: string | null;
  analysisClipId: string | null;
  stemSeparationClipId: string | null;

  // Spectrum analyzer & loudness metering
  showSpectrumAnalyzer: boolean;

  // Quantize dialog
  showQuantizeDialog: boolean;
  /** Clip ID + selected note IDs passed from the piano roll to the quantize dialog. */
  quantizeTarget: { clipId: string; noteIds: string[] } | null;

  // Generate pattern dialog
  showGeneratePatternDialog: boolean;
  generatePatternClipId: string | null;

  // AI Assistant
  showAIAssistant: boolean;
  aiChatMessages: AIChatMessage[];
  aiAssistantStreaming: boolean;
  aiAssistantSuggestions: string[];
  aiAssistantError: string | null;

  // Inline AI regeneration & suggestions
  regionRegenerateTarget: { startTime: number; endTime: number; trackIds: string[] } | null;
  inlineSuggestions: InlineSuggestion[];
  suggestionFrequency: 'off' | 'subtle' | 'active';

  setPixelsPerSecond: (pps: number) => void;
  toggleSnap: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  deselectAll: () => void;
  setEditingClip: (clipId: string | null) => void;
  setShowNewProjectDialog: (v: boolean) => void;
  setShowInstrumentPicker: (v: boolean) => void;
  setShowExportDialog: (v: boolean) => void;
  setShowSettingsDialog: (v: boolean) => void;
  setShowProjectListDialog: (v: boolean) => void;
  setBatchGenerateMode: (mode: 'silence' | 'context' | null) => void;
  setBatchGenerateInitialRange: (v: { startTime: number; duration: number } | null) => void;
  setShowKeyboardShortcutsDialog: (v: boolean) => void;
  setShowShortcutEditorDialog: (v: boolean) => void;
  setShowMixer: (v: boolean) => void;
  setMixerHeight: (v: number) => void;
  setShowAssetsPanel: (v: boolean) => void;
  setAssetsPanelWidth: (v: number) => void;
  setTrackListWidth: (v: number) => void;
  setContextWindow: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setSelectWindow: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setExpandedTrackId: (id: string | null) => void;
  setOpenSequencerTrackId: (id: string | null) => void;
  setOpenDrumMachineTrackId: (id: string | null) => void;
  setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
  setOpenEffectChainTrackId: (id: string | null) => void;
  setOpenMidiEffectChainTrackId: (id: string | null) => void;
  setDrumMachineEditorHeight: (v: number) => void;
  setSequencerEditorHeight: (v: number) => void;
  setPianoRollHeight: (v: number) => void;
  setEffectChainHeight: (v: number) => void;
  setShowSmartControls: (v: boolean) => void;
  setShowLibrary: (v: boolean) => void;
  setActiveBottomPanel: (v: 'smart' | 'editor' | 'pianoRoll' | 'effects' | 'drumMachine' | null) => void;

  // Tempo lane
  toggleTempoLane: () => void;

  // Loop Browser
  toggleLoopBrowser: () => void;
  setLoopBrowserCategory: (v: 'All' | 'Drums' | 'Bass' | 'Keys' | 'Synth') => void;
  setLoopBrowserSearch: (v: string) => void;
  setPreviewingLoopId: (id: string | null) => void;

  // Cover / Repaint modals
  setCoverModal: (clipId: string | null) => void;
  setRepaintModal: (clipId: string | null, range?: { start: number; end: number } | null) => void;

  // Vocal2BGM / Audio Analysis
  setVocal2BGMModal: (clipId: string | null) => void;
  setAnalysisPanel: (clipId: string | null) => void;
  setStemSeparationModal: (clipId: string | null) => void;

  // Spectrum analyzer & loudness metering
  setShowSpectrumAnalyzer: (v: boolean) => void;
  toggleSpectrumAnalyzer: () => void;

  // Quantize dialog
  setShowQuantizeDialog: (v: boolean) => void;
  setQuantizeTarget: (target: { clipId: string; noteIds: string[] } | null) => void;
  openQuantizeDialog: (clipId: string, noteIds: string[]) => void;

  // Generate pattern dialog
  setShowGeneratePatternDialog: (v: boolean) => void;
  openGeneratePatternDialog: (clipId: string) => void;

  // AI Assistant
  toggleAIAssistant: () => void;
  setShowAIAssistant: (v: boolean) => void;
  addAIChatMessage: (msg: AIChatMessage) => void;
  clearAIChatMessages: () => void;
  setAIAssistantStreaming: (v: boolean) => void;
  updateAIChatMessage: (id: string, updater: (message: AIChatMessage) => AIChatMessage) => void;
  refreshAIAssistantSuggestions: () => void;
  askAIAssistant: (question: string, options?: { delayMs?: number }) => Promise<void>;

  // Inline AI regeneration & suggestions
  setRegionRegenerateTarget: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setInlineSuggestions: (v: InlineSuggestion[]) => void;
  dismissInlineSuggestion: (id: string) => void;
  clearInlineSuggestions: () => void;
  setSuggestionFrequency: (v: 'off' | 'subtle' | 'active') => void;
}

const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
  pixelsPerSecond: 50,
  snapEnabled: true,
  scrollX: 0,
  scrollY: 0,
  selectedClipIds: new Set(),
  editingClipId: null,
  showNewProjectDialog: false,
  showInstrumentPicker: false,
  showExportDialog: false,
  showSettingsDialog: false,
  showProjectListDialog: false,
  batchGenerateMode: null,
  batchGenerateInitialRange: null,
  showKeyboardShortcutsDialog: false,
  showShortcutEditorDialog: false,
  showMixer: false,
  mixerHeight: 420,
  showAssetsPanel: false,
  assetsPanelWidth: 240,
  trackListWidth: 220,
  contextWindow: null,
  selectWindow: null,
  expandedTrackId: null,
  openSequencerTrackId: null,
  openDrumMachineTrackId: null,
  openPianoRollTrackId: null,
  openPianoRollClipId: null,
  openEffectChainTrackId: null,
  openMidiEffectChainTrackId: null,
  drumMachineEditorHeight: 400,
  sequencerEditorHeight: 320,
  pianoRollHeight: 360,
  effectChainHeight: 320,
  showSmartControls: false,
  showLibrary: false,
  activeBottomPanel: null,

  showTempoLane: false,

  loopBrowserOpen: false,
  loopBrowserCategory: 'All',
  loopBrowserSearch: '',
  previewingLoopId: null,

  coverClipId: null,
  repaintClipId: null,
  repaintRange: null,

  vocal2bgmClipId: null,
  analysisClipId: null,
  stemSeparationClipId: null,

  showSpectrumAnalyzer: false,

  showQuantizeDialog: false,
  quantizeTarget: null,

  showGeneratePatternDialog: false,
  generatePatternClipId: null,

  showAIAssistant: false,
  aiChatMessages: [],
  aiAssistantStreaming: false,
  aiAssistantSuggestions: [],
  aiAssistantError: null,

  regionRegenerateTarget: null,
  inlineSuggestions: [],
  suggestionFrequency: 'subtle',

  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  zoomIn: () =>
    set((s) => {
      const idx = ZOOM_LEVELS.findIndex((z) => z >= s.pixelsPerSecond);
      const next = idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : s.pixelsPerSecond;
      return { pixelsPerSecond: next };
    }),

  zoomOut: () =>
    set((s) => {
      const idx = ZOOM_LEVELS.findIndex((z) => z >= s.pixelsPerSecond);
      const prev = idx > 0 ? ZOOM_LEVELS[idx - 1] : s.pixelsPerSecond;
      return { pixelsPerSecond: prev };
    }),

  setScrollX: (x) => set({ scrollX: x }),
  setScrollY: (y) => set({ scrollY: y }),

  selectClip: (clipId, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedClipIds);
        if (next.has(clipId)) next.delete(clipId);
        else next.add(clipId);
        return { selectedClipIds: next };
      }
      return { selectedClipIds: new Set([clipId]) };
    }),

  selectClips: (clipIds) => set({ selectedClipIds: new Set(clipIds) }),

  deselectAll: () => set({ selectedClipIds: new Set() }),

  setEditingClip: (clipId) => set({ editingClipId: clipId }),
  setShowNewProjectDialog: (v) => set({ showNewProjectDialog: v }),
  setShowInstrumentPicker: (v) => set({ showInstrumentPicker: v }),
  setShowExportDialog: (v) => set({ showExportDialog: v }),
  setShowSettingsDialog: (v) => set({ showSettingsDialog: v }),
  setShowProjectListDialog: (v) => set({ showProjectListDialog: v }),
  setBatchGenerateMode: (mode) => set(mode === null
    ? { batchGenerateMode: null, batchGenerateInitialRange: null }
    : { batchGenerateMode: mode }),
  setBatchGenerateInitialRange: (v) => set({ batchGenerateInitialRange: v }),
  setShowKeyboardShortcutsDialog: (v) => set({ showKeyboardShortcutsDialog: v }),
  setShowShortcutEditorDialog: (v) => set({ showShortcutEditorDialog: v }),
  setShowMixer: (v) => set({ showMixer: v }),
  setMixerHeight: (v) => set({ mixerHeight: Math.min(500, Math.max(160, v)) }),
  setShowAssetsPanel: (v) => set({ showAssetsPanel: v }),
  setAssetsPanelWidth: (v) => set({ assetsPanelWidth: Math.min(500, Math.max(160, v)) }),
  setTrackListWidth: (v) => set({ trackListWidth: Math.min(400, Math.max(120, v)) }),
  setContextWindow: (v) => set({ contextWindow: v }),
  setSelectWindow: (v) => set({ selectWindow: v }),
  setExpandedTrackId: (id) => set({ expandedTrackId: id }),
  setOpenSequencerTrackId: (id) => set({ openSequencerTrackId: id, activeBottomPanel: id ? 'editor' : null }),
  setOpenDrumMachineTrackId: (id) => set({ openDrumMachineTrackId: id, activeBottomPanel: id ? 'drumMachine' : null }),
  setOpenPianoRoll: (trackId, clipId = null) => set({
    openPianoRollTrackId: trackId,
    openPianoRollClipId: clipId,
    activeBottomPanel: trackId ? 'pianoRoll' : null,
  }),
  setOpenEffectChainTrackId: (id) => set({
    openEffectChainTrackId: id,
    activeBottomPanel: id ? 'effects' : null,
  }),
  setOpenMidiEffectChainTrackId: (id) => set({
    openMidiEffectChainTrackId: id,
    activeBottomPanel: id ? 'effects' : null,
  }),
  setDrumMachineEditorHeight: (v) => set({ drumMachineEditorHeight: Math.min(600, Math.max(300, v)) }),
  setSequencerEditorHeight: (v) => set({ sequencerEditorHeight: Math.min(600, Math.max(200, v)) }),
  setPianoRollHeight: (v) => set({ pianoRollHeight: Math.min(700, Math.max(220, v)) }),
  setEffectChainHeight: (v) => set({ effectChainHeight: Math.min(520, Math.max(180, v)) }),
  setShowSmartControls: (v) => set({ showSmartControls: v }),
  setShowLibrary: (v) => set({ showLibrary: v }),
  setActiveBottomPanel: (v) => set({ activeBottomPanel: v }),

  toggleTempoLane: () => set((s) => ({ showTempoLane: !s.showTempoLane })),

  toggleLoopBrowser: () => set((s) => ({ loopBrowserOpen: !s.loopBrowserOpen })),
  setLoopBrowserCategory: (v) => set({ loopBrowserCategory: v }),
  setLoopBrowserSearch: (v) => set({ loopBrowserSearch: v }),
  setPreviewingLoopId: (id) => set({ previewingLoopId: id }),

  setCoverModal: (clipId) => set({ coverClipId: clipId }),
  setRepaintModal: (clipId, range = null) => set({ repaintClipId: clipId, repaintRange: range }),

  setVocal2BGMModal: (clipId) => set({ vocal2bgmClipId: clipId }),
  setAnalysisPanel: (clipId) => set({ analysisClipId: clipId }),
  setStemSeparationModal: (clipId) => set({ stemSeparationClipId: clipId }),

  setShowSpectrumAnalyzer: (v) => set({ showSpectrumAnalyzer: v }),
  toggleSpectrumAnalyzer: () => set((s) => ({ showSpectrumAnalyzer: !s.showSpectrumAnalyzer })),

  setShowQuantizeDialog: (v) => set(v ? { showQuantizeDialog: v } : { showQuantizeDialog: false, quantizeTarget: null }),
  setQuantizeTarget: (target) => set({ quantizeTarget: target }),
  openQuantizeDialog: (clipId, noteIds) => set({ showQuantizeDialog: true, quantizeTarget: { clipId, noteIds } }),

  setShowGeneratePatternDialog: (v) => set(v ? { showGeneratePatternDialog: v } : { showGeneratePatternDialog: false, generatePatternClipId: null }),
  openGeneratePatternDialog: (clipId) => set({ showGeneratePatternDialog: true, generatePatternClipId: clipId }),

  toggleAIAssistant: () => set((state) => {
    const nextShow = !state.showAIAssistant;
    return nextShow
      ? {
          showAIAssistant: true,
          aiAssistantSuggestions: getAssistantSuggestions(getAssistantContext(state)),
          aiAssistantError: null,
        }
      : { showAIAssistant: false };
  }),
  setShowAIAssistant: (v) => set((state) => (
    v
      ? {
          showAIAssistant: true,
          aiAssistantSuggestions: getAssistantSuggestions(getAssistantContext(state)),
          aiAssistantError: null,
        }
      : { showAIAssistant: false }
  )),
  addAIChatMessage: (msg) => set((s) => ({ aiChatMessages: [...s.aiChatMessages, msg] })),
  clearAIChatMessages: () => set((state) => ({
    aiChatMessages: [],
    aiAssistantError: null,
    aiAssistantSuggestions: getAssistantSuggestions(getAssistantContext(state)),
  })),
  setAIAssistantStreaming: (v) => set({ aiAssistantStreaming: v }),
  updateAIChatMessage: (id, updater) => set((state) => ({
    aiChatMessages: state.aiChatMessages.map((message) => (
      message.id === id ? updater(message) : message
    )),
  })),
  refreshAIAssistantSuggestions: () => set((state) => ({
    aiAssistantSuggestions: getAssistantSuggestions(getAssistantContext(state)),
  })),
  askAIAssistant: async (question, options) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const userMessage = createAssistantMessage('user', trimmed);
    const assistantMessage = createAssistantMessage('assistant', '');
    const context = getAssistantContext(get());

    set((state) => ({
      showAIAssistant: true,
      aiAssistantStreaming: true,
      aiAssistantError: null,
      aiChatMessages: [...state.aiChatMessages, userMessage, assistantMessage],
      aiAssistantSuggestions: getAssistantSuggestions(context),
    }));

    try {
      for await (const chunk of streamAssistantResponse(trimmed, context, options?.delayMs)) {
        set((state) => ({
          aiChatMessages: state.aiChatMessages.map((message) => (
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant response failed.';
      set((state) => ({
        aiAssistantError: message,
        aiChatMessages: state.aiChatMessages.map((item) => (
          item.id === assistantMessage.id
            ? { ...item, content: 'I ran into an error while preparing the reply. Please try again.' }
            : item
        )),
      }));
    } finally {
      set((state) => ({
        aiAssistantStreaming: false,
        aiAssistantSuggestions: getAssistantSuggestions(getAssistantContext(state)),
      }));
    }
  },

  setRegionRegenerateTarget: (v) => set({ regionRegenerateTarget: v }),
  setInlineSuggestions: (v) => set({ inlineSuggestions: v }),
  dismissInlineSuggestion: (id) => set((s) => ({
    inlineSuggestions: s.inlineSuggestions.filter((sg) => sg.id !== id),
  })),
  clearInlineSuggestions: () => set({ inlineSuggestions: [] }),
  setSuggestionFrequency: (v) => set({ suggestionFrequency: v }),
}),
    {
      name: 'ace-step-daw-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Panel open/close states
        showMixer: state.showMixer,
        showLibrary: state.showLibrary,
        loopBrowserOpen: state.loopBrowserOpen,
        showSmartControls: state.showSmartControls,
        // Panel sizes
        mixerHeight: state.mixerHeight,
        drumMachineEditorHeight: state.drumMachineEditorHeight,
        sequencerEditorHeight: state.sequencerEditorHeight,
        pianoRollHeight: state.pianoRollHeight,
        effectChainHeight: state.effectChainHeight,
        assetsPanelWidth: state.assetsPanelWidth,
        trackListWidth: state.trackListWidth,
        // Zoom level
        pixelsPerSecond: state.pixelsPerSecond,
        // Snap
        snapEnabled: state.snapEnabled,
        // Spectrum analyzer
        showSpectrumAnalyzer: state.showSpectrumAnalyzer,
        // Loop Browser preference
        loopBrowserCategory: state.loopBrowserCategory,
        // AI Assistant
        showAIAssistant: state.showAIAssistant,
        // Inline suggestions
        suggestionFrequency: state.suggestionFrequency,
      }),
    },
  ),
);

function getAssistantContext(state: UIState): AIChatContext {
  return buildAssistantContext(useProjectStore.getState().project, state, useTransportStore.getState());
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIChatMessage } from '../types/aiAssistant';
import type { InlineSuggestion } from '../types/suggestions';
import type { PianoRollTool } from '../components/pianoroll/PianoRollConstants';
import { useProjectStore } from './projectStore';
import type { HistoryScope } from './projectStore';
import { useTransportStore } from './transportStore';
import type { AIChatContext } from '../utils/aiAssistantContext';
import { buildAssistantContext } from '../utils/aiAssistantContext';
import { getAssistantSuggestions, streamAssistantResponse } from '../services/aiAssistantService';
import type { ShortcutContext } from '../types/shortcuts';
import { CHORD_SHAPES } from '../utils/chords';
import {
  buildCommandPaletteCommands,
  buildCommandPaletteRegistry,
  searchCommandsForQuery,
  type CommandPaletteRegistryEntry,
  type CommandPaletteSearchResult,
} from '../services/commandPalette';
import type { HistoryTarget } from './projectStore';

function createAssistantMessage(role: AIChatMessage['role'], content: string): AIChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

export type PianoRollChordShape = (typeof CHORD_SHAPES)[number]['abbr'];

const DEFAULT_PIANO_ROLL_CHORD_SHAPE: PianoRollChordShape = 'maj';
const VALID_PIANO_ROLL_CHORD_SHAPES = new Set<string>(CHORD_SHAPES.map((shape) => shape.abbr));

function clampPianoRollChordShape(abbr: string): PianoRollChordShape {
  return VALID_PIANO_ROLL_CHORD_SHAPES.has(abbr)
    ? (abbr as PianoRollChordShape)
    : DEFAULT_PIANO_ROLL_CHORD_SHAPE;
}

export interface UIState {
  mainView: 'arrangement' | 'session';
  keyboardContext: { scope: ShortcutContext; trackId: string | null };
  arrangementView: 'arrangement' | 'session';
  pixelsPerSecond: number;
  snapEnabled: boolean;
  scrollX: number;
  scrollY: number;
  selectedClipIds: Set<string>;
  selectedTrackIds: Set<string>;
  /** Tracks whether the user's last selection was on clips or tracks, for context-aware Cmd+A and Delete. */
  lastSelectionContext: 'tracks' | 'clips' | null;
  editingClipId: string | null;
  showNewProjectDialog: boolean;
  showInstrumentPicker: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  showProjectListDialog: boolean;
  bounceInPlaceTrackId: string | null;
  /** Controls the BatchGenerateModal — lifted from GenerationPanel so keyboard shortcuts can open it. */
  batchGenerateMode: 'silence' | 'context' | null;
  /** Optional time range pre-filled into BatchGenerateModal when opened from a lane drag-select or context menu. */
  batchGenerateInitialRange: { startTime: number; duration: number } | null;
  showKeyboardShortcutsDialog: boolean;
  showShortcutEditorDialog: boolean;
  showCommandPalette: boolean;
  commandPaletteQuery: string;
  recentCommandIds: string[];
  showUndoHistoryPanel: boolean;
  historyFocusScope: HistoryScope;
  historyFocusTrackId: string | null;
  historyFocusClipId: string | null;
  showMixer: boolean;
  mixerHeight: number;
  showAssetsPanel: boolean;
  assetsPanelWidth: number;
  trackListWidth: number;
  /** Global context window set by Option/Alt+drag on the timeline. */
  contextWindow: { startTime: number; endTime: number; trackIds: string[] } | null;
  /** Multi-track select window set by Cmd/Ctrl+drag on the timeline. */
  selectWindow: { startTime: number; endTime: number; trackIds: string[] } | null;
  /** Latest timeline viewport request consumed by the arrangement surface. */
  timelineZoomRequest: { id: number; mode: 'selection' | 'project' } | null;
  /** Track whose inspector panel is currently expanded. */
  expandedTrackId: string | null;
  /** Track whose sequencer editor is currently open (bottom panel). */
  openSequencerTrackId: string | null;
  openDrumMachineTrackId: string | null;
  openPianoRollTrackId: string | null;
  openPianoRollClipId: string | null;
  selectedPianoRollNoteIds: string[];
  activePianoRollTool: PianoRollTool;
  /** Abbreviation of the currently selected chord shape for chord stamp (e.g. 'maj', 'min', '7', 'dim'). */
  activeChordShape: PianoRollChordShape;
  /** Alias for activeChordShape — used by PianoRoll component and tests. */
  activePianoRollChordShape: PianoRollChordShape;
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

  // Playhead focus — true when timeline area is focused (after click-to-seek)
  timelineFocused: boolean;

  // Auto-scroll — follow playhead during playback
  autoScrollEnabled: boolean;
  userScrolledDuringPlayback: boolean;

  // Loop Browser
  loopBrowserOpen: boolean;
  loopBrowserCategory: 'All' | 'Drums' | 'Bass' | 'Keys' | 'Synth';
  loopBrowserSearch: string;
  previewingLoopId: string | null;

  // Music Enhancer floating panel
  musicEnhancerOpen: boolean;

  // Cover / Repaint modals
  coverClipId: string | null;
  repaintClipId: string | null;
  repaintRange: { start: number; end: number } | null;

  // Vocal2BGM / Audio Analysis
  vocal2bgmClipId: string | null;
  analysisClipId: string | null;
  stemSeparationClipId: string | null;
  audioToMidiClipId: string | null;

  // Spectrum analyzer & loudness metering
  showSpectrumAnalyzer: boolean;

  // Quantize dialog
  showQuantizeDialog: boolean;
  /** Clip ID + selected note IDs passed from the piano roll to the quantize dialog. */
  quantizeTarget: { clipId: string; noteIds: string[] } | null;
  /** Preview positions for quantize: noteId → { startBeat, durationBeats }. Canvas uses these to override rendering. */
  quantizePreviewPositions: Record<string, { startBeat: number; durationBeats: number }> | null;

  // Generate pattern dialog
  showGeneratePatternDialog: boolean;
  generatePatternClipId: string | null;

  // Add Layer Panel (floating, no backdrop)
  addLayerOpen: boolean;

  // Model Library Panel
  showModelLibrary: boolean;

  // Generation Side Panel
  showGenerationPanel: boolean;
  showGenerationHistoryPanel: boolean;

  // AI Assistant
  showAIAssistant: boolean;
  aiChatMessages: AIChatMessage[];
  aiAssistantStreaming: boolean;
  aiAssistantSuggestions: string[];
  aiAssistantError: string | null;
  showOnboarding: boolean;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  workspaceComplexity: 'simple' | 'standard' | 'advanced';
  activeTutorialStep: number | null;
  tutorialCompleted: boolean;
  tutorialSkipped: boolean;
  dismissedOnboardingTipIds: string[];

  // Inline AI regeneration & suggestions
  regionRegenerateTarget: { startTime: number; endTime: number; trackIds: string[] } | null;
  inlineSuggestions: InlineSuggestion[];
  suggestionFrequency: 'off' | 'subtle' | 'active';

  setMainView: (view: 'arrangement' | 'session') => void;
  toggleMainView: () => void;
  setPixelsPerSecond: (pps: number) => void;
  setKeyboardContext: (scope: ShortcutContext, trackId?: string | null) => void;
  toggleArrangementView: () => void;
  setArrangementView: (view: 'arrangement' | 'session') => void;
  toggleSnap: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  selectTrack: (trackId: string, multi?: boolean) => void;
  selectTracks: (trackIds: string[]) => void;
  deselectAllTracks: () => void;
  deselectAll: () => void;
  setEditingClip: (clipId: string | null) => void;
  setShowNewProjectDialog: (v: boolean) => void;
  setShowInstrumentPicker: (v: boolean) => void;
  setShowExportDialog: (v: boolean) => void;
  setShowSettingsDialog: (v: boolean) => void;
  setShowProjectListDialog: (v: boolean) => void;
  openBounceInPlaceDialog: (trackId: string) => void;
  closeBounceInPlaceDialog: () => void;
  setBatchGenerateMode: (mode: 'silence' | 'context' | null) => void;
  setBatchGenerateInitialRange: (v: { startTime: number; duration: number } | null) => void;
  setShowKeyboardShortcutsDialog: (v: boolean) => void;
  setShowShortcutEditorDialog: (v: boolean) => void;
  openCommandPalette: (query?: string) => void;
  closeCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;
  getCommandPaletteRegistry: (query?: string) => CommandPaletteRegistryEntry[];
  searchCommandPalette: (query?: string) => CommandPaletteSearchResult[];
  executeCommandPaletteCommand: (commandId: string) => Promise<boolean>;
  setShowUndoHistoryPanel: (v: boolean) => void;
  setHistoryFocusScope: (scope: HistoryScope, target?: HistoryTarget) => void;
  setShowMixer: (v: boolean) => void;
  setMixerHeight: (v: number) => void;
  setShowAssetsPanel: (v: boolean) => void;
  setAssetsPanelWidth: (v: number) => void;
  setTrackListWidth: (v: number) => void;
  setContextWindow: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setSelectWindow: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  zoomTimelineToSelection: () => void;
  zoomTimelineToProject: () => void;
  setExpandedTrackId: (id: string | null) => void;
  setOpenSequencerTrackId: (id: string | null) => void;
  setOpenDrumMachineTrackId: (id: string | null) => void;
  setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
  setSelectedPianoRollNoteIds: (noteIds: string[]) => void;
  setActivePianoRollTool: (tool: PianoRollTool) => void;
  setActiveChordShape: (abbr: PianoRollChordShape | string) => void;
  /** Alias for setActiveChordShape. */
  setActivePianoRollChordShape: (abbr: PianoRollChordShape | string) => void;
  togglePianoRollPencilTool: () => void;
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

  // Playhead focus
  setTimelineFocused: (focused: boolean) => void;

  // Auto-scroll
  setAutoScrollEnabled: (enabled: boolean) => void;
  setUserScrolledDuringPlayback: (scrolled: boolean) => void;
  toggleAutoScroll: () => void;

  // Loop Browser
  toggleLoopBrowser: () => void;
  setLoopBrowserCategory: (v: 'All' | 'Drums' | 'Bass' | 'Keys' | 'Synth') => void;
  setLoopBrowserSearch: (v: string) => void;
  setPreviewingLoopId: (id: string | null) => void;

  // Music Enhancer floating panel
  setMusicEnhancerOpen: (open: boolean) => void;

  // Cover / Repaint modals
  setCoverModal: (clipId: string | null) => void;
  setRepaintModal: (clipId: string | null, range?: { start: number; end: number } | null) => void;

  // Vocal2BGM / Audio Analysis
  setVocal2BGMModal: (clipId: string | null) => void;
  setAnalysisPanel: (clipId: string | null) => void;
  setStemSeparationModal: (clipId: string | null) => void;
  setAudioToMidiModal: (clipId: string | null) => void;

  // Spectrum analyzer & loudness metering
  setShowSpectrumAnalyzer: (v: boolean) => void;
  toggleSpectrumAnalyzer: () => void;

  // Quantize dialog
  setShowQuantizeDialog: (v: boolean) => void;
  setQuantizeTarget: (target: { clipId: string; noteIds: string[] } | null) => void;
  openQuantizeDialog: (clipId: string, noteIds: string[]) => void;
  setQuantizePreviewPositions: (positions: Record<string, { startBeat: number; durationBeats: number }> | null) => void;

  // Generate pattern dialog
  setShowGeneratePatternDialog: (v: boolean) => void;
  openGeneratePatternDialog: (clipId: string) => void;

  // Add Layer Panel
  setAddLayerOpen: (v: boolean) => void;

  // Model Library Panel
  toggleModelLibrary: () => void;
  setShowModelLibrary: (v: boolean) => void;

  // Generation Side Panel
  toggleGenerationPanel: () => void;
  setShowGenerationPanel: (v: boolean) => void;
  toggleGenerationHistoryPanel: () => void;
  setShowGenerationHistoryPanel: (v: boolean) => void;

  // Command Palette
  setShowCommandPalette: (v: boolean) => void;
  toggleCommandPalette: () => void;

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
  setShowOnboarding: (v: boolean) => void;
  applyWorkspaceComplexity: (tier: 'simple' | 'standard' | 'advanced') => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
  startTutorial: () => void;
  nextTutorialStep: () => void;
  finishTutorial: () => void;
  skipTutorial: () => void;
  dismissOnboardingTip: (id: string) => void;
}

const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];
const TUTORIAL_STEP_COUNT = 5;

function getComplexityDefaults(tier: 'simple' | 'standard' | 'advanced') {
  switch (tier) {
    case 'simple':
      return {
        workspaceComplexity: tier,
        showMixer: false,
        showLibrary: false,
        loopBrowserOpen: false,
        showSmartControls: true,
        showTempoLane: false,
        trackListWidth: 200,
        pixelsPerSecond: 50,
      };
    case 'advanced':
      return {
        workspaceComplexity: tier,
        showMixer: true,
        showLibrary: true,
        loopBrowserOpen: true,
        showSmartControls: false,
        showTempoLane: true,
        trackListWidth: 250,
        pixelsPerSecond: 100,
      };
    case 'standard':
    default:
      return {
        workspaceComplexity: tier,
        showMixer: false,
        showLibrary: false,
        loopBrowserOpen: false,
        showSmartControls: false,
        showTempoLane: false,
        trackListWidth: 220,
        pixelsPerSecond: 50,
      };
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
  mainView: 'arrangement',
  keyboardContext: { scope: 'timeline', trackId: null },
  arrangementView: 'arrangement',
  pixelsPerSecond: 50,
  snapEnabled: true,
  scrollX: 0,
  scrollY: 0,
  selectedClipIds: new Set(),
  selectedTrackIds: new Set(),
  lastSelectionContext: null,
  editingClipId: null,
  showNewProjectDialog: false,
  showInstrumentPicker: false,
  showExportDialog: false,
  showSettingsDialog: false,
  showProjectListDialog: false,
  bounceInPlaceTrackId: null,
  batchGenerateMode: null,
  batchGenerateInitialRange: null,
  showKeyboardShortcutsDialog: false,
  showShortcutEditorDialog: false,
  showCommandPalette: false,
  commandPaletteQuery: '',
  recentCommandIds: [],
  showUndoHistoryPanel: false,
  historyFocusScope: 'arrangement',
  historyFocusTrackId: null,
  historyFocusClipId: null,
  showMixer: false,
  mixerHeight: 420,
  showAssetsPanel: false,
  assetsPanelWidth: 240,
  trackListWidth: 220,
  contextWindow: null,
  selectWindow: null,
  timelineZoomRequest: null,
  expandedTrackId: null,
  openSequencerTrackId: null,
  openDrumMachineTrackId: null,
  openPianoRollTrackId: null,
  openPianoRollClipId: null,
  selectedPianoRollNoteIds: [],
  activePianoRollTool: 'select',
  activeChordShape: DEFAULT_PIANO_ROLL_CHORD_SHAPE,
  activePianoRollChordShape: DEFAULT_PIANO_ROLL_CHORD_SHAPE,
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
  timelineFocused: false,

  autoScrollEnabled: true,
  userScrolledDuringPlayback: false,

  loopBrowserOpen: false,
  loopBrowserCategory: 'All',
  loopBrowserSearch: '',
  previewingLoopId: null,

  musicEnhancerOpen: false,

  coverClipId: null,
  repaintClipId: null,
  repaintRange: null,

  vocal2bgmClipId: null,
  analysisClipId: null,
  stemSeparationClipId: null,
  audioToMidiClipId: null,

  showSpectrumAnalyzer: false,

  showQuantizeDialog: false,
  quantizeTarget: null,
  quantizePreviewPositions: null,

  showGeneratePatternDialog: false,
  generatePatternClipId: null,

  addLayerOpen: false,

  showModelLibrary: false,

  showGenerationPanel: false,
  showGenerationHistoryPanel: false,

  showAIAssistant: false,
  aiChatMessages: [],
  aiAssistantStreaming: false,
  aiAssistantSuggestions: [],
  aiAssistantError: null,
  showOnboarding: false,
  onboardingCompleted: false,
  onboardingSkipped: false,
  workspaceComplexity: 'standard',
  activeTutorialStep: null,
  tutorialCompleted: false,
  tutorialSkipped: false,
  dismissedOnboardingTipIds: [],

  regionRegenerateTarget: null,
  inlineSuggestions: [],
  suggestionFrequency: 'subtle',

  setMainView: (mainView) => set({ mainView, arrangementView: mainView }),
  toggleMainView: () => set((s) => {
    const nextView = s.mainView === 'arrangement' ? 'session' : 'arrangement';
    return { mainView: nextView, arrangementView: nextView };
  }),
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),
  setKeyboardContext: (scope, trackId = null) => set((state) => ({
    keyboardContext: {
      scope,
      trackId: trackId ?? state.keyboardContext.trackId,
    },
  })),
  toggleArrangementView: () => set((state) => {
    const nextView = state.arrangementView === 'arrangement' ? 'session' : 'arrangement';
    return { arrangementView: nextView, mainView: nextView };
  }),
  setArrangementView: (view) => set({ arrangementView: view, mainView: view }),
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
        return { selectedClipIds: next, lastSelectionContext: 'clips' as const };
      }
      return { selectedClipIds: new Set([clipId]), lastSelectionContext: 'clips' as const };
    }),

  selectClips: (clipIds) => set({ selectedClipIds: new Set(clipIds), lastSelectionContext: 'clips' as const }),

  selectTrack: (trackId, multi) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedTrackIds);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return { selectedTrackIds: next, lastSelectionContext: 'tracks' as const };
      }
      return { selectedTrackIds: new Set([trackId]), lastSelectionContext: 'tracks' as const };
    }),

  selectTracks: (trackIds) => set({ selectedTrackIds: new Set(trackIds), lastSelectionContext: 'tracks' as const }),

  deselectAllTracks: () => set({ selectedTrackIds: new Set() }),

  deselectAll: () => set({ selectedClipIds: new Set(), selectedTrackIds: new Set(), lastSelectionContext: null }),

  setEditingClip: (clipId) => set({ editingClipId: clipId }),
  setShowNewProjectDialog: (v) => set({ showNewProjectDialog: v }),
  setShowInstrumentPicker: (v) => set({ showInstrumentPicker: v }),
  setShowExportDialog: (v) => set({ showExportDialog: v }),
  setShowSettingsDialog: (v) => set({ showSettingsDialog: v }),
  setShowProjectListDialog: (v) => set({ showProjectListDialog: v }),
  openBounceInPlaceDialog: (trackId) => set({ bounceInPlaceTrackId: trackId }),
  closeBounceInPlaceDialog: () => set({ bounceInPlaceTrackId: null }),
  setBatchGenerateMode: (mode) => set(mode === null
    ? { batchGenerateMode: null, batchGenerateInitialRange: null }
    : { batchGenerateMode: mode }),
  setBatchGenerateInitialRange: (v) => set({ batchGenerateInitialRange: v }),
  setShowKeyboardShortcutsDialog: (v) => set({ showKeyboardShortcutsDialog: v }),
  setShowShortcutEditorDialog: (v) => set({ showShortcutEditorDialog: v }),
  openCommandPalette: (query = '') => set({ showCommandPalette: true, commandPaletteQuery: query }),
  closeCommandPalette: () => set({ showCommandPalette: false, commandPaletteQuery: '' }),
  setCommandPaletteQuery: (query) => set({ commandPaletteQuery: query }),
  getCommandPaletteRegistry: (query) => {
    const state = get();
    return buildCommandPaletteRegistry(buildCommandPaletteContext(state), query ?? state.commandPaletteQuery);
  },
  searchCommandPalette: (query) => {
    const state = get();
    return searchCommandsForQuery(query ?? state.commandPaletteQuery, buildCommandPaletteContext(state), state.recentCommandIds);
  },
  executeCommandPaletteCommand: async (commandId) => {
    const state = get();
    const commands = buildCommandPaletteCommands(buildCommandPaletteContext(state));
    const extraCommands = searchCommandsForQuery(state.commandPaletteQuery, buildCommandPaletteContext(state), state.recentCommandIds);
    const command =
      commands.find((item) => item.id === commandId)
      ?? extraCommands.find((item) => item.id === commandId);

    if (!command) return false;

    await command.execute();

    set((current) => ({
      showCommandPalette: false,
      commandPaletteQuery: '',
      recentCommandIds: [commandId, ...current.recentCommandIds.filter((id) => id !== commandId)].slice(0, 8),
    }));

    return true;
  },
  setShowUndoHistoryPanel: (v) => set({ showUndoHistoryPanel: v }),
  setHistoryFocusScope: (scope, target) => set((state) => {
    const resolvedTrackId =
      target?.trackId
      ?? (scope === 'track'
        ? state.openSequencerTrackId ?? state.openDrumMachineTrackId ?? state.openMidiEffectChainTrackId ?? state.expandedTrackId ?? state.keyboardContext.trackId
        : scope === 'pianoRoll'
          ? state.openPianoRollTrackId
          : null);
    const resolvedClipId = target?.clipId ?? (scope === 'pianoRoll' ? state.openPianoRollClipId : null);

    return {
      historyFocusScope: scope,
      historyFocusTrackId: resolvedTrackId ?? null,
      historyFocusClipId: resolvedClipId ?? null,
    };
  }),
  setShowMixer: (v) => set({ showMixer: v }),
  setMixerHeight: (v) => set({ mixerHeight: Math.min(500, Math.max(160, v)) }),
  setShowAssetsPanel: (v) => set({ showAssetsPanel: v }),
  setAssetsPanelWidth: (v) => set({ assetsPanelWidth: Math.min(500, Math.max(160, v)) }),
  setTrackListWidth: (v) => set({ trackListWidth: Math.min(400, Math.max(120, v)) }),
  setContextWindow: (v) => set({ contextWindow: v }),
  setSelectWindow: (v) => set({ selectWindow: v }),
  zoomTimelineToSelection: () => set((state) => ({
    timelineZoomRequest: {
      id: (state.timelineZoomRequest?.id ?? 0) + 1,
      mode: 'selection',
    },
  })),
  zoomTimelineToProject: () => set((state) => ({
    timelineZoomRequest: {
      id: (state.timelineZoomRequest?.id ?? 0) + 1,
      mode: 'project',
    },
  })),
  setExpandedTrackId: (id) => set({ expandedTrackId: id }),
  setOpenSequencerTrackId: (id) => set({
    openSequencerTrackId: id,
    activeBottomPanel: id ? 'editor' : null,
    historyFocusScope: id ? 'track' : 'arrangement',
    historyFocusTrackId: id,
    historyFocusClipId: null,
  }),
  setOpenDrumMachineTrackId: (id) => set((state) => ({
    keyboardContext: id
      ? { scope: 'drumMachine' as const, trackId: id }
      : { scope: 'timeline' as const, trackId: state.keyboardContext.trackId },
    openDrumMachineTrackId: id,
    activeBottomPanel: id ? 'drumMachine' : null,
    historyFocusScope: id ? 'track' : 'arrangement',
    historyFocusTrackId: id,
    historyFocusClipId: null,
  })),
  setOpenPianoRoll: (trackId, clipId = null) => set((state) => ({
    keyboardContext: trackId ? { scope: 'pianoRoll', trackId } : state.keyboardContext,
    openPianoRollTrackId: trackId,
    openPianoRollClipId: clipId,
    selectedPianoRollNoteIds: [],
    activeBottomPanel: trackId ? 'pianoRoll' : null,
    historyFocusScope: trackId ? 'pianoRoll' : 'arrangement',
    historyFocusTrackId: trackId,
    historyFocusClipId: clipId,
  })),
  setSelectedPianoRollNoteIds: (noteIds) => set({ selectedPianoRollNoteIds: [...noteIds] }),
  setActivePianoRollTool: (tool) => set({ activePianoRollTool: tool }),
  setActiveChordShape: (abbr) => {
    const clamped = clampPianoRollChordShape(abbr);
    set({ activeChordShape: clamped, activePianoRollChordShape: clamped });
  },
  setActivePianoRollChordShape: (abbr) => {
    const clamped = clampPianoRollChordShape(abbr);
    set({ activeChordShape: clamped, activePianoRollChordShape: clamped });
  },
  togglePianoRollPencilTool: () => set((state) => ({
    activePianoRollTool: state.activePianoRollTool === 'pencil' ? 'select' : 'pencil',
  })),
  setOpenEffectChainTrackId: (id) => set({
    openEffectChainTrackId: id,
    activeBottomPanel: id ? 'effects' : null,
    historyFocusScope: id ? 'mixer' : 'arrangement',
    historyFocusTrackId: id,
    historyFocusClipId: null,
  }),
  setOpenMidiEffectChainTrackId: (id) => set({
    openMidiEffectChainTrackId: id,
    activeBottomPanel: id ? 'effects' : null,
    historyFocusScope: id ? 'track' : 'arrangement',
    historyFocusTrackId: id,
    historyFocusClipId: null,
  }),
  setDrumMachineEditorHeight: (v) => set({ drumMachineEditorHeight: Math.min(600, Math.max(300, v)) }),
  setSequencerEditorHeight: (v) => set({ sequencerEditorHeight: Math.min(600, Math.max(200, v)) }),
  setPianoRollHeight: (v) => set({ pianoRollHeight: Math.min(700, Math.max(220, v)) }),
  setEffectChainHeight: (v) => set({ effectChainHeight: Math.min(520, Math.max(180, v)) }),
  setShowSmartControls: (v) => set({ showSmartControls: v }),
  setShowLibrary: (v) => set({ showLibrary: v }),
  setActiveBottomPanel: (v) => set({ activeBottomPanel: v }),

  toggleTempoLane: () => set((s) => ({ showTempoLane: !s.showTempoLane })),
  setTimelineFocused: (focused) => set({ timelineFocused: focused }),

  setAutoScrollEnabled: (enabled) => set({ autoScrollEnabled: enabled }),
  setUserScrolledDuringPlayback: (scrolled) => set({ userScrolledDuringPlayback: scrolled }),
  toggleAutoScroll: () => set((s) => ({ autoScrollEnabled: !s.autoScrollEnabled })),

  toggleLoopBrowser: () => set((s) => ({ loopBrowserOpen: !s.loopBrowserOpen })),
  setLoopBrowserCategory: (v) => set({ loopBrowserCategory: v }),
  setLoopBrowserSearch: (v) => set({ loopBrowserSearch: v }),
  setPreviewingLoopId: (id) => set({ previewingLoopId: id }),

  setMusicEnhancerOpen: (open) => set({ musicEnhancerOpen: open }),

  setCoverModal: (clipId) => set({ coverClipId: clipId }),
  setRepaintModal: (clipId, range = null) => set({ repaintClipId: clipId, repaintRange: range }),

  setVocal2BGMModal: (clipId) => set({ vocal2bgmClipId: clipId }),
  setAnalysisPanel: (clipId) => set({ analysisClipId: clipId }),
  setStemSeparationModal: (clipId) => set({ stemSeparationClipId: clipId }),
  setAudioToMidiModal: (clipId) => set({ audioToMidiClipId: clipId }),

  setShowSpectrumAnalyzer: (v) => set({ showSpectrumAnalyzer: v }),
  toggleSpectrumAnalyzer: () => set((s) => ({ showSpectrumAnalyzer: !s.showSpectrumAnalyzer })),

  setShowQuantizeDialog: (v) => set(v ? { showQuantizeDialog: v } : { showQuantizeDialog: false, quantizeTarget: null, quantizePreviewPositions: null }),
  setQuantizeTarget: (target) => set({ quantizeTarget: target }),
  openQuantizeDialog: (clipId, noteIds) => set({ showQuantizeDialog: true, quantizeTarget: { clipId, noteIds } }),
  setQuantizePreviewPositions: (positions) => set({ quantizePreviewPositions: positions }),

  setShowGeneratePatternDialog: (v) => set(v ? { showGeneratePatternDialog: v } : { showGeneratePatternDialog: false, generatePatternClipId: null }),
  openGeneratePatternDialog: (clipId) => set({ showGeneratePatternDialog: true, generatePatternClipId: clipId }),

  setAddLayerOpen: (v) => set({ addLayerOpen: v }),

  toggleModelLibrary: () => set((s) => ({ showModelLibrary: !s.showModelLibrary })),
  setShowModelLibrary: (v) => set({ showModelLibrary: v }),

  toggleGenerationPanel: () => set((s) => ({ showGenerationPanel: !s.showGenerationPanel })),
  setShowGenerationPanel: (v) => set({ showGenerationPanel: v }),
  toggleGenerationHistoryPanel: () => set((s) => ({ showGenerationHistoryPanel: !s.showGenerationHistoryPanel })),
  setShowGenerationHistoryPanel: (v) => set({ showGenerationHistoryPanel: v }),

  setShowCommandPalette: (v) => set({ showCommandPalette: v }),
  toggleCommandPalette: () => set((s) => ({ showCommandPalette: !s.showCommandPalette })),

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
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  applyWorkspaceComplexity: (tier) => set(getComplexityDefaults(tier)),
  completeOnboarding: () => set({
    onboardingCompleted: true,
    onboardingSkipped: false,
    showOnboarding: false,
  }),
  skipOnboarding: () => set({
    onboardingSkipped: true,
    showOnboarding: false,
    activeTutorialStep: null,
    tutorialSkipped: true,
  }),
  startTutorial: () => set((state) => (
    state.tutorialCompleted || state.tutorialSkipped
      ? {}
      : { activeTutorialStep: 0 }
  )),
  nextTutorialStep: () => set((state) => {
    if (state.activeTutorialStep === null) return {};
    if (state.activeTutorialStep >= TUTORIAL_STEP_COUNT - 1) {
      return {
        activeTutorialStep: null,
        tutorialCompleted: true,
        tutorialSkipped: false,
      };
    }
    return { activeTutorialStep: state.activeTutorialStep + 1 };
  }),
  finishTutorial: () => set({
    activeTutorialStep: null,
    tutorialCompleted: true,
    tutorialSkipped: false,
  }),
  skipTutorial: () => set({
    activeTutorialStep: null,
    tutorialSkipped: true,
  }),
  dismissOnboardingTip: (id) => set((state) => (
    state.dismissedOnboardingTipIds.includes(id)
      ? {}
      : { dismissedOnboardingTipIds: [...state.dismissedOnboardingTipIds, id] }
  )),
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
        keyboardContext: state.keyboardContext,
        activePianoRollTool: state.activePianoRollTool,
        activeChordShape: state.activeChordShape,
        activePianoRollChordShape: state.activePianoRollChordShape,
        // Panel sizes
        mixerHeight: state.mixerHeight,
        drumMachineEditorHeight: state.drumMachineEditorHeight,
        sequencerEditorHeight: state.sequencerEditorHeight,
        pianoRollHeight: state.pianoRollHeight,
        effectChainHeight: state.effectChainHeight,
        assetsPanelWidth: state.assetsPanelWidth,
        trackListWidth: state.trackListWidth,
        // Zoom level
        arrangementView: state.arrangementView,
        mainView: state.mainView,
        pixelsPerSecond: state.pixelsPerSecond,
        // Snap
        snapEnabled: state.snapEnabled,
        // Spectrum analyzer
        showSpectrumAnalyzer: state.showSpectrumAnalyzer,
        // Loop Browser preference
        loopBrowserCategory: state.loopBrowserCategory,
        // Model Library panel
        showModelLibrary: state.showModelLibrary,
        // Generation panel
        showGenerationPanel: state.showGenerationPanel,
        showGenerationHistoryPanel: state.showGenerationHistoryPanel,
        // AI Assistant
        showAIAssistant: state.showAIAssistant,
        // Onboarding
        onboardingCompleted: state.onboardingCompleted,
        onboardingSkipped: state.onboardingSkipped,
        workspaceComplexity: state.workspaceComplexity,
        tutorialCompleted: state.tutorialCompleted,
        tutorialSkipped: state.tutorialSkipped,
        dismissedOnboardingTipIds: state.dismissedOnboardingTipIds,
        // Inline suggestions
        suggestionFrequency: state.suggestionFrequency,
        // Command palette
        recentCommandIds: state.recentCommandIds,
      }),
    },
  ),
);

function getAssistantContext(state: UIState): AIChatContext {
  return buildAssistantContext(useProjectStore.getState().project, state, useTransportStore.getState());
}

function buildCommandPaletteContext(state: UIState) {
  const projectStore = useProjectStore.getState();
  const transportStore = useTransportStore.getState();
  const runtime = (window as unknown as Record<string, unknown>).__commandPaletteRuntime as
    | { play?: () => void | Promise<void>; pause?: () => void | Promise<void>; stop?: () => void | Promise<void> }
    | undefined;

  return {
    project: projectStore.project,
    selectedClipIds: [...state.selectedClipIds],
    selectedTrackIds: [...state.selectedTrackIds],
    currentTime: transportStore.currentTime,
    isPlaying: transportStore.isPlaying,
    showMixer: state.showMixer,
    showLibrary: state.showLibrary,
    showSmartControls: state.showSmartControls,
    showAIAssistant: state.showAIAssistant,
    loopBrowserOpen: state.loopBrowserOpen,
    showTempoLane: state.showTempoLane,
    loopEnabled: transportStore.loopEnabled,
    metronomeEnabled: transportStore.metronomeEnabled,
    expandedTrackId: state.expandedTrackId,
    openPianoRollTrackId: state.openPianoRollTrackId,
    openSequencerTrackId: state.openSequencerTrackId,
    openDrumMachineTrackId: state.openDrumMachineTrackId,
    actions: {
      play: runtime?.play ?? transportStore.play,
      pause: runtime?.pause ?? transportStore.pause,
      stop: runtime?.stop ?? transportStore.stop,
      toggleLoop: transportStore.toggleLoop,
      toggleMetronome: transportStore.toggleMetronome,
      setShowNewProjectDialog: state.setShowNewProjectDialog,
      setShowProjectListDialog: state.setShowProjectListDialog,
      setShowSettingsDialog: state.setShowSettingsDialog,
      setShowExportDialog: state.setShowExportDialog,
      setShowKeyboardShortcutsDialog: state.setShowKeyboardShortcutsDialog,
      setShowLibrary: state.setShowLibrary,
      setShowMixer: state.setShowMixer,
      setShowSmartControls: state.setShowSmartControls,
      toggleLoopBrowser: state.toggleLoopBrowser,
      toggleTempoLane: state.toggleTempoLane,
      toggleAIAssistant: state.toggleAIAssistant,
      zoomTimelineToSelection: state.zoomTimelineToSelection,
      zoomTimelineToProject: state.zoomTimelineToProject,
      setBatchGenerateMode: state.setBatchGenerateMode,
      addTrack: projectStore.addTrack,
      addTrackEffect: projectStore.addTrackEffect,
      updateProject: projectStore.updateProject,
      updateTrack: projectStore.updateTrack,
      updateTrackMixer: projectStore.updateTrackMixer,
      updateTrackEffect: projectStore.updateTrackEffect,
      duplicateClip: (clipId: string) => {
        projectStore.duplicateClip(clipId);
      },
      splitClip: projectStore.splitClip,
      splitClipAtZeroCrossing: projectStore.splitClipAtZeroCrossing,
      removeClip: projectStore.removeClip,
      setEditingClip: state.setEditingClip,
      deselectAll: state.deselectAll,
    },
  };
}

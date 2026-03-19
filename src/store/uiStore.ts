import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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

  // Quantize dialog
  showQuantizeDialog: boolean;
  /** Clip ID + selected note IDs passed from the piano roll to the quantize dialog. */
  quantizeTarget: { clipId: string; noteIds: string[] } | null;

  // Generate pattern dialog
  showGeneratePatternDialog: boolean;
  generatePatternClipId: string | null;

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

  // Quantize dialog
  setShowQuantizeDialog: (v: boolean) => void;
  setQuantizeTarget: (target: { clipId: string; noteIds: string[] } | null) => void;
  openQuantizeDialog: (clipId: string, noteIds: string[]) => void;

  // Generate pattern dialog
  setShowGeneratePatternDialog: (v: boolean) => void;
  openGeneratePatternDialog: (clipId: string) => void;
}

const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
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

  showQuantizeDialog: false,
  quantizeTarget: null,

  showGeneratePatternDialog: false,
  generatePatternClipId: null,

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

  setShowQuantizeDialog: (v) => set(v ? { showQuantizeDialog: v } : { showQuantizeDialog: false, quantizeTarget: null }),
  setQuantizeTarget: (target) => set({ quantizeTarget: target }),
  openQuantizeDialog: (clipId, noteIds) => set({ showQuantizeDialog: true, quantizeTarget: { clipId, noteIds } }),

  setShowGeneratePatternDialog: (v) => set(v ? { showGeneratePatternDialog: v } : { showGeneratePatternDialog: false, generatePatternClipId: null }),
  openGeneratePatternDialog: (clipId) => set({ showGeneratePatternDialog: true, generatePatternClipId: clipId }),
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
        // Loop Browser preference
        loopBrowserCategory: state.loopBrowserCategory,
      }),
    },
  ),
);

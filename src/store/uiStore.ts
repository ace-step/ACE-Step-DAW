import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InlineSuggestion } from '../types/suggestions';
import type { PianoRollTool } from '../components/pianoroll/PianoRollConstants';
import { useProjectStore } from './projectStore';
import type { HistoryScope } from './projectStore';
import { useTransportStore } from './transportStore';
import type { ShortcutContext } from '../types/shortcuts';
import type { ThemeId } from '../themes/themeTokens';
import type { EnhancementNode, EnhancementSession } from '../types/enhance';
import type { ClipboardData } from '../services/clipboardService';
import type { SynthPresetDefinition, SynthPresetCategory } from '../data/synthPresets';
import type { InstrumentPreset } from '../data/instrumentPresets';
import type { LoopCategory } from '../engine/LoopLibrary';
import { CHORD_SHAPES } from '../utils/chords';
import {
  TRACK_LIST_COLLAPSED_WIDTH,
  TRACK_LIST_DEFAULT_WIDTH,
  clampTrackListWidth,
} from '../constants/trackList';
import {
  buildCommandPaletteCommands,
  buildCommandPaletteRegistry,
  searchCommandsForQuery,
  type CommandPaletteRegistryEntry,
  type CommandPaletteSearchResult,
} from '../services/commandPalette';
import type { HistoryTarget } from './projectStore';
import {
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
} from '../utils/timelineZoom';

export type PianoRollChordShape = (typeof CHORD_SHAPES)[number]['abbr'];
export type GenerationPanelView = 'textToMusic' | 'multiTrack' | 'history' | 'settings';

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
  timelineViewportWidth: number;
  snapEnabled: boolean;
  scrollX: number;
  scrollY: number;
  selectedClipIds: Set<string>;
  selectedTrackIds: Set<string>;
  /** Tracks whether the user's last selection was on clips or tracks, for context-aware Cmd+A and Delete. */
  lastSelectionContext: 'tracks' | 'clips' | null;
  /** Internal clipboard for copy/cut/paste of clips or MIDI notes. */
  clipboard: ClipboardData | null;
  editingClipId: string | null;
  editingText2MusicClipId: string | null;
  showNewProjectDialog: boolean;
  showInstrumentPicker: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  showProjectListDialog: boolean;
  bounceInPlaceTrackId: string | null;
  /** Track IDs pending deletion — non-null means the confirmation dialog is open. */
  pendingDeleteTrackIds: string[] | null;
  /** Remembers the active multi-track generation mode inside the unified Generate panel. */
  batchGenerateMode: 'silence' | 'context' | null;
  /** Optional time range pre-filled into the multi-track view when opened from a lane drag-select or context menu. */
  batchGenerateInitialRange: { startTime: number; duration: number } | null;
  showKeyboardShortcutsDialog: boolean;
  showShortcutEditorDialog: boolean;
  showVirtualKeyboard: boolean;
  showCommandPalette: boolean;
  commandPaletteQuery: string;
  recentCommandIds: string[];
  showUndoHistoryPanel: boolean;
  showMidiControllerPanel: boolean;
  showTrackPresetManager: boolean;
  grooveStrength: number;
  historyFocusScope: HistoryScope;
  historyFocusTrackId: string | null;
  historyFocusClipId: string | null;
  showMixer: boolean;
  showClipInspector: boolean;
  mixerHeight: number;
  showAssetsPanel: boolean;
  assetsPanelWidth: number;
  trackListDisplayMode: 'expanded' | 'collapsed';
  trackListWidth: number;
  expandedTrackListWidth: number;
  /** Global context window set by Option/Alt+drag on the timeline. */
  contextWindow: { startTime: number; endTime: number; trackIds: string[] } | null;
  /** Multi-track select window set by Cmd/Ctrl+drag on the timeline. */
  selectWindow: {
    startTime: number;
    endTime: number;
    trackIds: string[];
    /** The lane where the user started the drag, used for row-aware follow-up actions. */
    primaryTrackId?: string;
    /** Absolute visual row index inside the arrangement lane stack. */
    targetRowIndex?: number;
  } | null;
  /** Latest timeline viewport request consumed by the arrangement surface. */
  timelineZoomRequest: { id: number; mode: 'selection' | 'project' | 'stepIn' | 'stepOut' | 'reset' } | null;
  /** Track whose inspector panel is currently expanded. */
  expandedTrackId: string | null;
  /** Track whose sequencer editor is currently open (bottom panel). */
  openSequencerTrackId: string | null;
  openDrumMachineTrackId: string | null;
  openStrudelEditorTrackId: string | null;
  /** Whether the Strudel REPL panel is open. */
  strudelPanelOpen: boolean;
  openPianoRollTrackId: string | null;
  openPianoRollClipId: string | null;
  selectedPianoRollNoteIds: string[];
  activePianoRollTool: PianoRollTool;
  /** Whether ghost notes from other tracks are visible in the piano roll. */
  showGhostNotes: boolean;
  /** Abbreviation of the currently selected chord shape for chord stamp (e.g. 'maj', 'min', '7', 'dim'). */
  activeChordShape: PianoRollChordShape;
  /** Alias for activeChordShape — used by PianoRoll component and tests. */
  activePianoRollChordShape: PianoRollChordShape;
  openEffectChainTrackId: string | null;
  openMidiEffectChainTrackId: string | null;
  drumMachineEditorHeight: number;
  sequencerEditorHeight: number;
  pianoRollHeight: number;
  /** Active expression lane type in piano roll (MPE). */
  pianoRollExpressionType: 'pitchBend' | 'timbre' | 'pressure';
  effectChainHeight: number;
  virtualKeyboardOctave: number;
  virtualKeyboardVelocity: number;
  virtualKeyboardPressedPitches: number[];
  showSmartControls: boolean;
  showLibrary: boolean;

  // Status bar
  statusBarAutoHide: boolean;
  /** Which bottom editor is visible: null = none, 'smart' = smart controls, 'editor' = region editor */
  activeBottomPanel: 'smart' | 'editor' | 'pianoRoll' | 'effects' | 'drumMachine' | 'strudel' | null;

  // Tempo lane
  showTempoLane: boolean;

  // Arrangement markers
  showArrangementMarkers: boolean;

  // Playhead focus — true when timeline area is focused (after click-to-seek)
  timelineFocused: boolean;

  // Auto-scroll — follow playhead during playback
  autoScrollEnabled: boolean;
  userScrolledDuringPlayback: boolean;

  // Loop Browser
  loopBrowserOpen: boolean;
  loopBrowserCategory: 'All' | LoopCategory;
  loopBrowserSearch: string;
  previewingLoopId: string | null;
  recentlyUsedLoopIds: string[];

  // Unified Enhance Panel (replaces musicEnhancerOpen, coverClipId, repaintClipId, repaintRange)
  enhancerOpen: boolean;
  enhancerTarget: {
    clipId: string;
    trackId: string;
    range: { start: number; end: number } | null;
    mode: 'cover' | 'repaint';
  } | null;

  // Iterative Enhancement Session (version tree / chaining)
  enhancementSession: EnhancementSession | null;

  // Vocal2BGM / Audio Analysis
  vocal2bgmClipId: string | null;
  analysisClipId: string | null;
  stemSeparationClipId: string | null;
  audioToMidiClipId: string | null;

  // Vocal Replacement modal
  vocalReplacementClipId: string | null;

  // Hum-to-Song modal
  showHumToSongModal: boolean;

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
  editingLegoClipId: string | null;

  // Model Library Panel
  showModelLibrary: boolean;

  // Custom Models Panel (Fine-Tuning)
  showCustomModels: boolean;

  // Generation Side Panel
  showGenerationPanel: boolean;
  showGenerationHistoryPanel: boolean;
  generationPanelView: GenerationPanelView;

  // VST3 Plugin Browser Panel
  showVST3Panel: boolean;

  // AI Assistant (Claude Code terminal)
  showAIAssistant: boolean;
  workspaceComplexity: 'simple' | 'standard' | 'advanced';

  // Audio Slice Mode
  /** Clip ID currently in slice editing mode (null = inactive). */
  sliceModeClipId: string | null;
  /** Slice marker positions in seconds relative to clip start, keyed by clip ID. */
  sliceMarkersByClip: Record<string, number[]>;

  // DSP backend preference
  dspBackend: 'auto' | 'wasm' | 'tonejs';
  setDspBackend: (mode: 'auto' | 'wasm' | 'tonejs') => void;

  // Accessibility
  reducedMotion: boolean;
  /** True when user explicitly toggled reduced motion in Settings (vs OS default). */
  reducedMotionOverride: boolean;
  highContrastMode: boolean;
  colorBlindMode: boolean;
  setReducedMotion: (v: boolean) => void;
  /** Set reduced motion AND mark it as a user override. */
  setReducedMotionManual: (v: boolean) => void;
  setHighContrastMode: (v: boolean) => void;
  setColorBlindMode: (v: boolean) => void;

  // Theme
  theme: ThemeId;

  // Inline AI regeneration & suggestions
  regionRegenerateTarget: { startTime: number; endTime: number; trackIds: string[] } | null;
  inlineSuggestions: InlineSuggestion[];
  suggestionFrequency: 'off' | 'subtle' | 'active';

  // Playhead DOM cache — avoids per-frame layout queries in SelectedTrackCursor
  trackLaneRects: Map<string, { top: number; height: number }>;

  // Session view keyboard navigation
  selectedSessionSlot: { trackId: string; sceneIndex: number } | null;

  // Video recording
  videoRecording: {
    status: 'idle' | 'requesting' | 'recording' | 'stopping' | 'done' | 'error';
    duration: number;
    blob: Blob | null;
    mimeType: string | null;
    error: string | null;
  };
  videoRecordingSettings: {
    micEnabled: boolean;
    micDeviceId: string | null;
    micVolume: number;
    quality: 'low' | 'medium' | 'high';
  };
  setVideoRecordingSettings: (patch: Partial<UIState['videoRecordingSettings']>) => void;
  startVideoRecording: () => Promise<void>;
  stopVideoRecording: () => void;
  dismissVideoRecording: () => void;

  setMainView: (view: 'arrangement' | 'session') => void;
  toggleMainView: () => void;
  setPixelsPerSecond: (pps: number) => void;
  setTimelineViewportWidth: (width: number) => void;
  setKeyboardContext: (scope: ShortcutContext, trackId?: string | null) => void;
  toggleArrangementView: () => void;
  setArrangementView: (view: 'arrangement' | 'session') => void;
  toggleSnap: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  selectTrack: (trackId: string, multi?: boolean) => void;
  selectTracks: (trackIds: string[]) => void;
  deselectAllTracks: () => void;
  deselectAll: () => void;
  setClipboard: (data: ClipboardData | null) => void;
  setEditingClip: (clipId: string | null) => void;
  setEditingText2MusicClipId: (clipId: string | null) => void;
  setShowNewProjectDialog: (v: boolean) => void;
  setShowInstrumentPicker: (v: boolean) => void;
  setShowExportDialog: (v: boolean) => void;
  setShowSettingsDialog: (v: boolean) => void;
  setShowProjectListDialog: (v: boolean) => void;
  openBounceInPlaceDialog: (trackId: string) => void;
  closeBounceInPlaceDialog: () => void;
  requestDeleteTracks: (trackIds: string[]) => void;
  confirmDeleteTracks: () => void;
  cancelDeleteTracks: () => void;
  setBatchGenerateMode: (mode: 'silence' | 'context' | null) => void;
  setBatchGenerateInitialRange: (v: { startTime: number; duration: number } | null) => void;
  setShowKeyboardShortcutsDialog: (v: boolean) => void;
  setShowShortcutEditorDialog: (v: boolean) => void;
  setShowVirtualKeyboard: (v: boolean) => void;
  toggleVirtualKeyboard: () => void;
  openCommandPalette: (query?: string) => void;
  closeCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;
  getCommandPaletteRegistry: (query?: string) => CommandPaletteRegistryEntry[];
  searchCommandPalette: (query?: string) => CommandPaletteSearchResult[];
  executeCommandPaletteCommand: (commandId: string) => Promise<boolean>;
  setShowUndoHistoryPanel: (v: boolean) => void;
  setShowMidiControllerPanel: (v: boolean) => void;
  setShowTrackPresetManager: (v: boolean) => void;
  setGrooveStrength: (v: number) => void;
  setHistoryFocusScope: (scope: HistoryScope, target?: HistoryTarget) => void;
  setShowMixer: (v: boolean) => void;
  setShowClipInspector: (v: boolean) => void;
  toggleClipInspector: () => void;
  setMixerHeight: (v: number) => void;
  setShowAssetsPanel: (v: boolean) => void;
  setAssetsPanelWidth: (v: number) => void;
  setTrackListDisplayMode: (mode: 'expanded' | 'collapsed') => void;
  toggleTrackListDisplayMode: () => void;
  setTrackListWidth: (v: number) => void;
  setContextWindow: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setSelectWindow: (v: {
    startTime: number;
    endTime: number;
    trackIds: string[];
    primaryTrackId?: string;
    targetRowIndex?: number;
  } | null) => void;
  zoomTimelineToSelection: () => void;
  zoomTimelineToProject: () => void;
  setExpandedTrackId: (id: string | null) => void;
  setOpenSequencerTrackId: (id: string | null) => void;
  setOpenDrumMachineTrackId: (id: string | null) => void;
  setOpenStrudelEditor: (trackId: string | null) => void;
  toggleStrudelPanel: () => void;
  setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
  setSelectedPianoRollNoteIds: (noteIds: string[]) => void;
  setActivePianoRollTool: (tool: PianoRollTool) => void;
  toggleGhostNotes: () => void;
  setShowGhostNotes: (v: boolean) => void;
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
  setVirtualKeyboardOctave: (v: number) => void;
  adjustVirtualKeyboardOctave: (delta: number) => void;
  setVirtualKeyboardVelocity: (v: number) => void;
  adjustVirtualKeyboardVelocity: (delta: number) => void;
  pressVirtualKeyboardPitch: (pitch: number) => void;
  releaseVirtualKeyboardPitch: (pitch: number) => void;
  clearVirtualKeyboardPressedPitches: () => void;
  setShowSmartControls: (v: boolean) => void;
  setStatusBarAutoHide: (v: boolean) => void;
  setShowLibrary: (v: boolean) => void;
  setActiveBottomPanel: (v: 'smart' | 'editor' | 'pianoRoll' | 'effects' | 'drumMachine' | null) => void;

  // Tempo lane
  toggleTempoLane: () => void;

  // Arrangement markers
  toggleArrangementMarkers: () => void;

  // Playhead focus
  setTimelineFocused: (focused: boolean) => void;

  // Auto-scroll
  setAutoScrollEnabled: (enabled: boolean) => void;
  setUserScrolledDuringPlayback: (scrolled: boolean) => void;
  toggleAutoScroll: () => void;

  // Loop Browser
  toggleLoopBrowser: () => void;
  setLoopBrowserCategory: (v: 'All' | LoopCategory) => void;
  setLoopBrowserSearch: (v: string) => void;
  setPreviewingLoopId: (id: string | null) => void;
  addRecentlyUsedLoop: (id: string) => void;

  // Unified Enhance Panel
  openEnhancer: (clipId: string, trackId: string, range?: { start: number; end: number } | null) => void;
  openEnhancerFromSelection: () => void;
  closeEnhancer: () => void;

  // Iterative Enhancement Session
  startEnhancementSession: (clipId: string) => void;
  addEnhancementNode: (node: Omit<EnhancementNode, 'id' | 'createdAt'>) => string;
  setActiveEnhancementNode: (nodeId: string | null) => void;
  rollbackToNode: (nodeId: string) => void;
  clearEnhancementSession: () => void;

  // Vocal2BGM / Audio Analysis
  setVocal2BGMModal: (clipId: string | null) => void;
  setAnalysisPanel: (clipId: string | null) => void;
  setStemSeparationModal: (clipId: string | null) => void;
  setAudioToMidiModal: (clipId: string | null) => void;

  // Vocal Replacement modal
  setVocalReplacementModal: (clipId: string | null) => void;

  // Hum-to-Song modal
  setShowHumToSongModal: (show: boolean) => void;

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
  setEditingLegoClipId: (id: string | null) => void;
  openAddLayerForClip: (clipId: string) => void;

  // Model Library Panel
  toggleModelLibrary: () => void;
  setShowModelLibrary: (v: boolean) => void;

  // Custom Models Panel (Fine-Tuning)
  toggleCustomModels: () => void;
  setShowCustomModels: (v: boolean) => void;

  // Generation Side Panel
  toggleGenerationPanel: () => void;
  setShowGenerationPanel: (v: boolean) => void;
  setGenerationPanelView: (view: GenerationPanelView) => void;
  openGenerationPanelView: (view: GenerationPanelView) => void;
  toggleGenerationHistoryPanel: () => void;
  setShowGenerationHistoryPanel: (v: boolean) => void;

  // Command Palette
  setShowCommandPalette: (v: boolean) => void;
  toggleCommandPalette: () => void;

  // VST3 Plugin Browser Panel
  toggleVST3Panel: () => void;
  setShowVST3Panel: (v: boolean) => void;

  // AI Assistant (Claude Code terminal)
  toggleAIAssistant: () => void;
  setShowAIAssistant: (v: boolean) => void;

  // Theme
  setTheme: (theme: ThemeId) => void;

  // Inline AI regeneration & suggestions
  setRegionRegenerateTarget: (v: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
  setInlineSuggestions: (v: InlineSuggestion[]) => void;
  dismissInlineSuggestion: (id: string) => void;
  clearInlineSuggestions: () => void;
  setSuggestionFrequency: (v: 'off' | 'subtle' | 'active') => void;
  applyWorkspaceComplexity: (tier: 'simple' | 'standard' | 'advanced') => void;

  // Audio Slice Mode actions
  /** Enter slice mode for a clip (shows slice markers on waveform). */
  enterSliceMode: (clipId: string) => void;
  /** Exit slice mode. */
  exitSliceMode: () => void;
  /** Add a slice marker at a time position (seconds) for the current slice-mode clip. */
  addSliceMarker: (clipId: string, timeSec: number) => void;
  /** Remove a slice marker by index for a clip. */
  removeSliceMarker: (clipId: string, index: number) => void;
  /** Set all slice markers for a clip (e.g. from auto-detect). */
  setSliceMarkers: (clipId: string, markers: number[]) => void;

  // Session view keyboard navigation
  setSelectedSessionSlot: (slot: { trackId: string; sceneIndex: number } | null) => void;
  clearSelectedSessionSlot: () => void;

  // Playhead DOM cache
  setTrackLaneRect: (trackId: string, rect: { top: number; height: number }) => void;
  removeTrackLaneRect: (trackId: string) => void;

  // Synth Preset Browser
  userSynthPresets: SynthPresetDefinition[];
  saveSynthPreset: (
    name: string,
    category: SynthPresetCategory,
    params: Pick<SynthPresetDefinition, 'waveform' | 'envelope' | 'filter' | 'detuneCents' | 'glideTime' | 'outputGain' | 'legacyPreset'>,
  ) => SynthPresetDefinition;
  deleteUserSynthPreset: (presetId: string) => void;

  // Unified instrument presets (all instrument kinds)
  userInstrumentPresets: InstrumentPreset[];
  saveInstrumentPreset: (preset: InstrumentPreset) => void;
  deleteInstrumentPreset: (presetId: string) => void;
}

const MIN_VIRTUAL_KEYBOARD_OCTAVE = 1;
const MAX_VIRTUAL_KEYBOARD_OCTAVE = 7;
const MIN_VIRTUAL_KEYBOARD_VELOCITY = 16;
const MAX_VIRTUAL_KEYBOARD_VELOCITY = 127;

function clampVirtualKeyboardOctave(value: number) {
  return Math.min(MAX_VIRTUAL_KEYBOARD_OCTAVE, Math.max(MIN_VIRTUAL_KEYBOARD_OCTAVE, Math.round(value)));
}

function clampVirtualKeyboardVelocity(value: number) {
  return Math.min(MAX_VIRTUAL_KEYBOARD_VELOCITY, Math.max(MIN_VIRTUAL_KEYBOARD_VELOCITY, Math.round(value)));
}

function getComplexityDefaults(tier: 'simple' | 'standard' | 'advanced') {
  switch (tier) {
    case 'simple':
      return {
        workspaceComplexity: tier,
        showMixer: false,
        showClipInspector: false,
        showLibrary: false,
        loopBrowserOpen: false,
        showSmartControls: true,
        showTempoLane: false,
        trackListWidth: 200,
        expandedTrackListWidth: 200,
        trackListDisplayMode: 'expanded' as const,
        pixelsPerSecond: 50,
      };
    case 'advanced':
      return {
        workspaceComplexity: tier,
        showMixer: true,
        showClipInspector: false,
        showLibrary: true,
        loopBrowserOpen: true,
        showSmartControls: false,
        showTempoLane: true,
        trackListWidth: 250,
        expandedTrackListWidth: 250,
        trackListDisplayMode: 'expanded' as const,
        pixelsPerSecond: 100,
      };
    case 'standard':
    default:
      return {
        workspaceComplexity: tier,
        showMixer: false,
        showClipInspector: false,
        showLibrary: false,
        loopBrowserOpen: false,
        showSmartControls: false,
        showTempoLane: false,
        trackListWidth: TRACK_LIST_DEFAULT_WIDTH,
        expandedTrackListWidth: TRACK_LIST_DEFAULT_WIDTH,
        trackListDisplayMode: 'expanded' as const,
        pixelsPerSecond: 50,
      };
  }
}

/** State slice that closes every right-side panel. Spread this when opening one. */
const ALL_RIGHT_PANELS_CLOSED = {
  showMixer: false,
  loopBrowserOpen: false,
  showGenerationPanel: false,
  showGenerationHistoryPanel: false,
  showModelLibrary: false,
  showCustomModels: false,
  showAIAssistant: false,
  showVST3Panel: false,
} as const;

/** State slice that closes every modal dialog. Spread this when opening one. */
const ALL_MODALS_CLOSED = {
  showSettingsDialog: false,
  showKeyboardShortcutsDialog: false,
  showShortcutEditorDialog: false,
  showExportDialog: false,
  showProjectListDialog: false,
  showNewProjectDialog: false,
  showInstrumentPicker: false,
  bounceInPlaceTrackId: null,
  showCommandPalette: false,
} as const;

/**
 * Returns true if any modal-level dialog is currently open.
 * Use this to guard lower-priority keyboard shortcuts (e.g. Escape-to-close on panels).
 */
export function isAnyModalOpen(): boolean {
  const s = useUIStore.getState();
  return !!(
    s.showCommandPalette
    || s.showSettingsDialog
    || s.showKeyboardShortcutsDialog
    || s.showShortcutEditorDialog
    || s.showExportDialog
    || s.showProjectListDialog
    || s.showNewProjectDialog
    || s.showInstrumentPicker
    || s.showQuantizeDialog
    || s.showGeneratePatternDialog
    || s.bounceInPlaceTrackId
    || s.pendingDeleteTrackIds
  );
}

// Module-scope reference for the active video recorder instance (avoids window globals)
let _activeVideoRecorder: import('../services/videoRecorder').VideoRecorderService | null = null;

/** Typed accessor for the global audio engine — avoids inline casts in every action. */
function _getAudioEngine(): { getAudioStream: () => MediaStream; disposeAudioStream: () => void } | undefined {
  const getter = (window as unknown as Record<string, unknown>).__getAudioEngine as (() => unknown) | undefined;
  return getter?.() as ReturnType<typeof _getAudioEngine>;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
  mainView: 'arrangement',
  keyboardContext: { scope: 'timeline', trackId: null },
  arrangementView: 'arrangement',
  pixelsPerSecond: DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  timelineViewportWidth: 0,
  snapEnabled: true,
  scrollX: 0,
  scrollY: 0,
  selectedClipIds: new Set(),
  selectedTrackIds: new Set(),
  lastSelectionContext: null,
  clipboard: null,
  editingClipId: null,
  editingText2MusicClipId: null,
  showNewProjectDialog: false,
  showInstrumentPicker: false,
  showExportDialog: false,
  showSettingsDialog: false,
  showProjectListDialog: false,
  bounceInPlaceTrackId: null,
  pendingDeleteTrackIds: null,
  batchGenerateMode: null,
  batchGenerateInitialRange: null,
  showKeyboardShortcutsDialog: false,
  showShortcutEditorDialog: false,
  showVirtualKeyboard: false,
  showCommandPalette: false,
  commandPaletteQuery: '',
  recentCommandIds: [],
  showUndoHistoryPanel: false,
  showMidiControllerPanel: false,
  showTrackPresetManager: false,
  grooveStrength: 100,
  historyFocusScope: 'arrangement',
  historyFocusTrackId: null,
  historyFocusClipId: null,
  showMixer: false,
  showClipInspector: false,
  mixerHeight: 420,
  showAssetsPanel: false,
  assetsPanelWidth: 240,
  trackListDisplayMode: 'expanded',
  trackListWidth: TRACK_LIST_DEFAULT_WIDTH,
  expandedTrackListWidth: TRACK_LIST_DEFAULT_WIDTH,
  contextWindow: null,
  selectWindow: null,
  timelineZoomRequest: null,
  expandedTrackId: null,
  openSequencerTrackId: null,
  openDrumMachineTrackId: null,
  openStrudelEditorTrackId: null,
  strudelPanelOpen: false,
  openPianoRollTrackId: null,
  openPianoRollClipId: null,
  selectedPianoRollNoteIds: [],
  activePianoRollTool: 'select',
  showGhostNotes: false,
  activeChordShape: DEFAULT_PIANO_ROLL_CHORD_SHAPE,
  activePianoRollChordShape: DEFAULT_PIANO_ROLL_CHORD_SHAPE,
  openEffectChainTrackId: null,
  openMidiEffectChainTrackId: null,
  drumMachineEditorHeight: 400,
  sequencerEditorHeight: 320,
  pianoRollHeight: 360,
  pianoRollExpressionType: 'pitchBend' as const,
  effectChainHeight: 320,
  virtualKeyboardOctave: 4,
  virtualKeyboardVelocity: 96,
  virtualKeyboardPressedPitches: [],
  showSmartControls: false,
  showLibrary: false,
  statusBarAutoHide: false,
  activeBottomPanel: null,

  showTempoLane: false,
  showArrangementMarkers: true,
  timelineFocused: false,

  autoScrollEnabled: true,
  userScrolledDuringPlayback: false,

  loopBrowserOpen: false,
  loopBrowserCategory: 'All',
  loopBrowserSearch: '',
  recentlyUsedLoopIds: [],
  previewingLoopId: null,

  enhancerOpen: false,
  enhancerTarget: null,

  enhancementSession: null,

  vocal2bgmClipId: null,
  analysisClipId: null,
  stemSeparationClipId: null,
  audioToMidiClipId: null,

  vocalReplacementClipId: null,

  showHumToSongModal: false,

  showSpectrumAnalyzer: false,

  showQuantizeDialog: false,
  quantizeTarget: null,
  quantizePreviewPositions: null,

  showGeneratePatternDialog: false,
  generatePatternClipId: null,

  addLayerOpen: false,
  editingLegoClipId: null,

  showModelLibrary: false,
  showCustomModels: false,

  showGenerationPanel: false,
  showGenerationHistoryPanel: false,
  generationPanelView: 'textToMusic',

  showVST3Panel: false,

  showAIAssistant: false,
  workspaceComplexity: 'standard',

  sliceModeClipId: null,
  sliceMarkersByClip: {},

  dspBackend: 'auto',

  reducedMotion: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  reducedMotionOverride: false,
  highContrastMode: false,
  colorBlindMode: false,

  theme: 'ableton',

  regionRegenerateTarget: null,
  inlineSuggestions: [],
  suggestionFrequency: 'subtle',

  trackLaneRects: new Map(),

  selectedSessionSlot: null,

  videoRecording: { status: 'idle', duration: 0, blob: null, mimeType: null, error: null },
  videoRecordingSettings: { micEnabled: false, micDeviceId: null, micVolume: 0.8, quality: 'medium' },
  setVideoRecordingSettings: (patch) => set((s) => ({ videoRecordingSettings: { ...s.videoRecordingSettings, ...patch } })),
  startVideoRecording: async () => {
    const { VideoRecorderService } = await import('../services/videoRecorder');
    if (!VideoRecorderService.isSupported()) {
      set({ videoRecording: { status: 'error', duration: 0, blob: null, mimeType: null, error: 'Video recording is not supported in this browser.' } });
      return;
    }
    const audioEngine = _getAudioEngine();
    if (!audioEngine) {
      set({ videoRecording: { status: 'error', duration: 0, blob: null, mimeType: null, error: 'Audio engine is not initialized.' } });
      return;
    }
    const settings = get().videoRecordingSettings;
    const qualityMap = { low: 1_000_000, medium: 2_500_000, high: 5_000_000 } as const;
    const audioBrMap = { low: 96_000, medium: 128_000, high: 192_000 } as const;
    // Get mic stream if enabled
    let micStream: MediaStream | undefined;
    if (settings.micEnabled) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true,
        });
      } catch {
        // Mic unavailable — continue without it
      }
    }
    const recorder = new VideoRecorderService();
    _activeVideoRecorder = recorder;
    recorder.onStateChange = (state) => set({ videoRecording: { ...state } });
    await recorder.startRecording(audioEngine.getAudioStream(), {
      videoBitsPerSecond: qualityMap[settings.quality],
      audioBitsPerSecond: audioBrMap[settings.quality],
      micStream,
      micVolume: settings.micVolume,
    });
  },
  stopVideoRecording: () => {
    // Do NOT dispose audio stream here — onstop fires asynchronously and
    // needs the stream alive to flush the final audio data chunk.
    _activeVideoRecorder?.stopRecording();
  },
  dismissVideoRecording: () => {
    _activeVideoRecorder?.dismiss();
    _activeVideoRecorder = null;
    _getAudioEngine()?.disposeAudioStream();
    set({ videoRecording: { status: 'idle', duration: 0, blob: null, mimeType: null, error: null } });
  },

  setMainView: (mainView) => set({ mainView, arrangementView: mainView }),
  toggleMainView: () => set((s) => {
    const nextView = s.mainView === 'arrangement' ? 'session' : 'arrangement';
    return { mainView: nextView, arrangementView: nextView };
  }),
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),
  setTimelineViewportWidth: (timelineViewportWidth) => set({ timelineViewportWidth }),
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
    set((state) => ({
      timelineZoomRequest: {
        id: (state.timelineZoomRequest?.id ?? 0) + 1,
        mode: 'stepIn',
      },
    })),

  zoomOut: () =>
    set((state) => ({
      timelineZoomRequest: {
        id: (state.timelineZoomRequest?.id ?? 0) + 1,
        mode: 'stepOut',
      },
    })),

  zoomReset: () =>
    set((state) => ({
      timelineZoomRequest: {
        id: (state.timelineZoomRequest?.id ?? 0) + 1,
        mode: 'reset',
      },
    })),

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

  setClipboard: (data) => set({ clipboard: data }),

  setEditingClip: (clipId) => set({ editingClipId: clipId }),
  setEditingText2MusicClipId: (clipId: string | null) => set({ editingText2MusicClipId: clipId }),
  setShowNewProjectDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showNewProjectDialog: true } : { showNewProjectDialog: false }),
  setShowInstrumentPicker: (v) => set(v ? { ...ALL_MODALS_CLOSED, showInstrumentPicker: true } : { showInstrumentPicker: false }),
  setShowExportDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showExportDialog: true } : { showExportDialog: false }),
  setShowSettingsDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showSettingsDialog: true } : { showSettingsDialog: false }),
  setDspBackend: (mode) => set({ dspBackend: mode }),
  setReducedMotion: (v) => set({ reducedMotion: v }),
  setReducedMotionManual: (v) => set({ reducedMotion: v, reducedMotionOverride: true }),
  setHighContrastMode: (v) => set({ highContrastMode: v }),
  setColorBlindMode: (v) => set({ colorBlindMode: v }),
  setTheme: (theme) => set({ theme }),
  setShowProjectListDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showProjectListDialog: true } : { showProjectListDialog: false }),
  openBounceInPlaceDialog: (trackId) => set({ bounceInPlaceTrackId: trackId }),
  closeBounceInPlaceDialog: () => set({ bounceInPlaceTrackId: null }),
  requestDeleteTracks: (trackIds) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    // Check if any track has 2+ clips — if so, show confirmation dialog
    const needsConfirmation = trackIds.some((tid) => {
      const track = project.tracks.find((t) => t.id === tid);
      return track && track.clips.length >= 2;
    });
    if (needsConfirmation) {
      set({ pendingDeleteTrackIds: trackIds });
    } else {
      // Delete immediately
      useProjectStore.getState().removeTracks(trackIds);
    }
  },
  confirmDeleteTracks: () => {
    const { pendingDeleteTrackIds } = get();
    if (pendingDeleteTrackIds) {
      useProjectStore.getState().removeTracks(pendingDeleteTrackIds);
      set({ pendingDeleteTrackIds: null });
    }
  },
  cancelDeleteTracks: () => set({ pendingDeleteTrackIds: null }),
  setBatchGenerateMode: (mode) => set(mode === null
    ? { batchGenerateMode: null, batchGenerateInitialRange: null }
    : {
        ...ALL_RIGHT_PANELS_CLOSED,
        batchGenerateMode: mode,
        showGenerationPanel: true,
        showGenerationHistoryPanel: false,
        generationPanelView: 'multiTrack',
      }),
  setBatchGenerateInitialRange: (v) => set({ batchGenerateInitialRange: v }),
  setShowKeyboardShortcutsDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showKeyboardShortcutsDialog: true } : { showKeyboardShortcutsDialog: false }),
  setShowShortcutEditorDialog: (v) => set(v ? { ...ALL_MODALS_CLOSED, showShortcutEditorDialog: true } : { showShortcutEditorDialog: false }),
  setShowVirtualKeyboard: (v) => set((state) => (
    v
      ? { showVirtualKeyboard: true }
      : { showVirtualKeyboard: false, virtualKeyboardPressedPitches: [] }
  )),
  toggleVirtualKeyboard: () => set((state) => ({
    showVirtualKeyboard: !state.showVirtualKeyboard,
    virtualKeyboardPressedPitches: state.showVirtualKeyboard ? [] : state.virtualKeyboardPressedPitches,
  })),
  openCommandPalette: (query = '') => set({ ...ALL_MODALS_CLOSED, showCommandPalette: true, commandPaletteQuery: query }),
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
  setShowMidiControllerPanel: (v) => set({ showMidiControllerPanel: v }),
  setShowTrackPresetManager: (v) => set({ showTrackPresetManager: v }),
  setGrooveStrength: (v) => set((state) => ({
    grooveStrength: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : state.grooveStrength,
  })),
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
  setShowMixer: (v) => set(v ? { ...ALL_RIGHT_PANELS_CLOSED, showMixer: true } : { showMixer: false }),
  setShowClipInspector: (v) => set({ showClipInspector: v }),
  toggleClipInspector: () => set((s) => ({ showClipInspector: !s.showClipInspector })),
  setMixerHeight: (v) => set({ mixerHeight: Math.min(500, Math.max(160, v)) }),
  setShowAssetsPanel: (v) => set({ showAssetsPanel: v }),
  setAssetsPanelWidth: (v) => set({ assetsPanelWidth: Math.min(500, Math.max(160, v)) }),
  setTrackListDisplayMode: (mode) => set((state) => {
    if (mode === 'collapsed') {
      return {
        trackListDisplayMode: 'collapsed',
        trackListWidth: TRACK_LIST_COLLAPSED_WIDTH,
      };
    }

    const expandedTrackListWidth = clampTrackListWidth(state.expandedTrackListWidth);
    return {
      trackListDisplayMode: 'expanded',
      expandedTrackListWidth,
      trackListWidth: expandedTrackListWidth,
    };
  }),
  toggleTrackListDisplayMode: () => set((state) => {
    if (state.trackListDisplayMode === 'collapsed') {
      const expandedTrackListWidth = clampTrackListWidth(state.expandedTrackListWidth);
      return {
        trackListDisplayMode: 'expanded',
        expandedTrackListWidth,
        trackListWidth: expandedTrackListWidth,
      };
    }

    return {
      trackListDisplayMode: 'collapsed',
      expandedTrackListWidth: clampTrackListWidth(state.trackListWidth),
      trackListWidth: TRACK_LIST_COLLAPSED_WIDTH,
    };
  }),
  setTrackListWidth: (v) => set({
    trackListDisplayMode: 'expanded',
    trackListWidth: clampTrackListWidth(v),
    expandedTrackListWidth: clampTrackListWidth(v),
  }),
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
  setOpenStrudelEditor: (trackId) => set((state) => ({
    keyboardContext: trackId
      ? { scope: 'strudel' as const, trackId }
      : { scope: 'timeline' as const, trackId: state.keyboardContext.trackId },
    openStrudelEditorTrackId: trackId,
    strudelPanelOpen: Boolean(trackId),
    activeBottomPanel: trackId ? 'strudel' : null,
    historyFocusScope: trackId ? 'track' : 'arrangement',
    historyFocusTrackId: trackId,
    historyFocusClipId: null,
  })),
  toggleStrudelPanel: () => set((state) => ({
    strudelPanelOpen: !state.strudelPanelOpen,
    activeBottomPanel: !state.strudelPanelOpen ? 'strudel' : null,
    keyboardContext: !state.strudelPanelOpen
      ? { scope: 'strudel' as const, trackId: state.openStrudelEditorTrackId }
      : { scope: 'timeline' as const, trackId: state.keyboardContext.trackId },
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
  toggleGhostNotes: () => set((state) => ({ showGhostNotes: !state.showGhostNotes })),
  setShowGhostNotes: (v) => set({ showGhostNotes: v }),
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
  setVirtualKeyboardOctave: (v) => set({ virtualKeyboardOctave: clampVirtualKeyboardOctave(v) }),
  adjustVirtualKeyboardOctave: (delta) => set((state) => ({
    virtualKeyboardOctave: clampVirtualKeyboardOctave(state.virtualKeyboardOctave + delta),
  })),
  setVirtualKeyboardVelocity: (v) => set({ virtualKeyboardVelocity: clampVirtualKeyboardVelocity(v) }),
  adjustVirtualKeyboardVelocity: (delta) => set((state) => ({
    virtualKeyboardVelocity: clampVirtualKeyboardVelocity(state.virtualKeyboardVelocity + delta),
  })),
  pressVirtualKeyboardPitch: (pitch) => set((state) => (
    state.virtualKeyboardPressedPitches.includes(pitch)
      ? {}
      : { virtualKeyboardPressedPitches: [...state.virtualKeyboardPressedPitches, pitch].sort((a, b) => a - b) }
  )),
  releaseVirtualKeyboardPitch: (pitch) => set((state) => ({
    virtualKeyboardPressedPitches: state.virtualKeyboardPressedPitches.filter((value) => value !== pitch),
  })),
  clearVirtualKeyboardPressedPitches: () => set({ virtualKeyboardPressedPitches: [] }),
  setShowSmartControls: (v) => set({ showSmartControls: v }),
  setStatusBarAutoHide: (v) => set({ statusBarAutoHide: v }),
  setShowLibrary: (v) => set({ showLibrary: v }),
  setActiveBottomPanel: (v) => set({ activeBottomPanel: v }),

  toggleTempoLane: () => set((s) => ({ showTempoLane: !s.showTempoLane })),
  toggleArrangementMarkers: () => set((s) => ({ showArrangementMarkers: !s.showArrangementMarkers })),
  setTimelineFocused: (focused) => set({ timelineFocused: focused }),

  setAutoScrollEnabled: (enabled) => set({ autoScrollEnabled: enabled }),
  setUserScrolledDuringPlayback: (scrolled) => set({ userScrolledDuringPlayback: scrolled }),
  toggleAutoScroll: () => set((s) => ({ autoScrollEnabled: !s.autoScrollEnabled })),

  toggleLoopBrowser: () => set((s) => s.loopBrowserOpen ? { loopBrowserOpen: false } : { ...ALL_RIGHT_PANELS_CLOSED, loopBrowserOpen: true }),
  setLoopBrowserCategory: (v) => set({ loopBrowserCategory: v }),
  setLoopBrowserSearch: (v) => set({ loopBrowserSearch: v }),
  setPreviewingLoopId: (id) => set({ previewingLoopId: id }),
  addRecentlyUsedLoop: (id) => set((s) => {
    const filtered = s.recentlyUsedLoopIds.filter((x) => x !== id);
    return { recentlyUsedLoopIds: [id, ...filtered].slice(0, 20) };
  }),

  openEnhancer: (clipId, trackId, range = null) => {
    const clip = useProjectStore.getState().getClipById(clipId);
    if (!clip) return;
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    // Auto-infer mode: if range exists and doesn't cover full clip → repaint
    let mode: 'cover' | 'repaint' = 'cover';
    if (range) {
      const coversFullClip = range.start <= clipStart + 0.01 && range.end >= clipEnd - 0.01;
      if (!coversFullClip) mode = 'repaint';
    }
    set({ enhancerOpen: true, enhancerTarget: { clipId, trackId, range, mode } });
  },
  openEnhancerFromSelection: () => {
    const { selectWindow } = get();
    if (!selectWindow) {
      // Open with no clip — panel will show guidance
      set({ enhancerOpen: true, enhancerTarget: null });
      return;
    }
    const project = useProjectStore.getState().project;
    if (!project) return;
    // Find first overlapping clip
    for (const track of project.tracks) {
      if (!selectWindow.trackIds.includes(track.id)) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clip.startTime < selectWindow.endTime && clipEnd > selectWindow.startTime) {
          const range = { start: selectWindow.startTime, end: selectWindow.endTime };
          get().openEnhancer(clip.id, track.id, range);
          return;
        }
      }
    }
    // No clip found in selection — open with guidance
    set({ enhancerOpen: true, enhancerTarget: null });
  },
  closeEnhancer: () => set({ enhancerOpen: false, enhancerTarget: null, enhancementSession: null }),

  startEnhancementSession: (clipId) => {
    const session: EnhancementSession = {
      id: `enhance-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clipId,
      nodes: [],
      activeNodeId: null,
    };
    set({ enhancementSession: session });
  },

  addEnhancementNode: (nodeData) => {
    const id = `enh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const node: EnhancementNode = {
      ...nodeData,
      id,
      createdAt: Date.now(),
    };
    const session = get().enhancementSession;
    if (!session) return id;
    set({
      enhancementSession: {
        ...session,
        nodes: [...session.nodes, node],
        activeNodeId: id,
      },
    });
    return id;
  },

  setActiveEnhancementNode: (nodeId) => {
    const session = get().enhancementSession;
    if (!session) return;
    if (nodeId !== null && !session.nodes.some((n) => n.id === nodeId)) return;
    set({
      enhancementSession: {
        ...session,
        activeNodeId: nodeId,
      },
    });
  },

  rollbackToNode: (nodeId) => {
    // Alias for setActiveEnhancementNode — semantically loads an earlier version as active
    get().setActiveEnhancementNode(nodeId);
  },

  clearEnhancementSession: () => set({ enhancementSession: null }),

  setVocal2BGMModal: (clipId) => set({ vocal2bgmClipId: clipId }),
  setAnalysisPanel: (clipId) => set({ analysisClipId: clipId }),
  setStemSeparationModal: (clipId) => set({ stemSeparationClipId: clipId }),
  setAudioToMidiModal: (clipId) => set({ audioToMidiClipId: clipId }),

  setVocalReplacementModal: (clipId) => set({ vocalReplacementClipId: clipId }),

  setShowHumToSongModal: (show) => set({ showHumToSongModal: show }),

  setShowSpectrumAnalyzer: (v) => set({ showSpectrumAnalyzer: v }),
  toggleSpectrumAnalyzer: () => set((s) => ({ showSpectrumAnalyzer: !s.showSpectrumAnalyzer })),

  setShowQuantizeDialog: (v) => set(v ? { showQuantizeDialog: v } : { showQuantizeDialog: false, quantizeTarget: null, quantizePreviewPositions: null }),
  setQuantizeTarget: (target) => set({ quantizeTarget: target }),
  openQuantizeDialog: (clipId, noteIds) => set({ showQuantizeDialog: true, quantizeTarget: { clipId, noteIds } }),
  setQuantizePreviewPositions: (positions) => set({ quantizePreviewPositions: positions }),

  setShowGeneratePatternDialog: (v) => set(v ? { showGeneratePatternDialog: v } : { showGeneratePatternDialog: false, generatePatternClipId: null }),
  openGeneratePatternDialog: (clipId) => set({ showGeneratePatternDialog: true, generatePatternClipId: clipId }),

  setAddLayerOpen: (v) => set({ addLayerOpen: v, ...(v ? {} : { editingLegoClipId: null }) }),
  setEditingLegoClipId: (id) => set({ editingLegoClipId: id }),
  openAddLayerForClip: (clipId) => set({ addLayerOpen: true, editingLegoClipId: clipId }),

  toggleModelLibrary: () => set((s) => s.showModelLibrary ? { showModelLibrary: false } : { ...ALL_RIGHT_PANELS_CLOSED, showModelLibrary: true }),
  setShowModelLibrary: (v) => set(v ? { ...ALL_RIGHT_PANELS_CLOSED, showModelLibrary: true } : { showModelLibrary: false }),

  toggleCustomModels: () => set((s) => s.showCustomModels ? { showCustomModels: false } : { ...ALL_RIGHT_PANELS_CLOSED, showCustomModels: true }),
  setShowCustomModels: (v: boolean) => set(v ? { ...ALL_RIGHT_PANELS_CLOSED, showCustomModels: true } : { showCustomModels: false }),

  toggleGenerationPanel: () => set((s) => s.showGenerationPanel ? { showGenerationPanel: false } : { ...ALL_RIGHT_PANELS_CLOSED, showGenerationPanel: true }),
  setShowGenerationPanel: (v) => set(v ? { ...ALL_RIGHT_PANELS_CLOSED, showGenerationPanel: true } : { showGenerationPanel: false }),
  setGenerationPanelView: (view) => set({ generationPanelView: view }),
  openGenerationPanelView: (view) => set({
    ...ALL_RIGHT_PANELS_CLOSED,
    showGenerationPanel: true,
    showGenerationHistoryPanel: false,
    generationPanelView: view,
  }),
  toggleGenerationHistoryPanel: () => set((s) => (
    s.showGenerationPanel && s.generationPanelView === 'history'
      ? { showGenerationPanel: false, showGenerationHistoryPanel: false }
      : {
          ...ALL_RIGHT_PANELS_CLOSED,
          showGenerationPanel: true,
          showGenerationHistoryPanel: false,
          generationPanelView: 'history',
        }
  )),
  setShowGenerationHistoryPanel: (v) => set((s) => (
    v
      ? {
          ...ALL_RIGHT_PANELS_CLOSED,
          showGenerationPanel: true,
          showGenerationHistoryPanel: false,
          generationPanelView: 'history',
        }
      : (s.showGenerationPanel && s.generationPanelView === 'history')
        ? { showGenerationPanel: false, showGenerationHistoryPanel: false }
        : { showGenerationHistoryPanel: false }
  )),

  setShowCommandPalette: (v) => set(v ? { ...ALL_MODALS_CLOSED, showCommandPalette: true, commandPaletteQuery: '' } : { showCommandPalette: false }),
  toggleCommandPalette: () => set((s) => s.showCommandPalette ? { showCommandPalette: false } : { ...ALL_MODALS_CLOSED, showCommandPalette: true }),

  toggleVST3Panel: () => set((s) => s.showVST3Panel ? { showVST3Panel: false } : { ...ALL_RIGHT_PANELS_CLOSED, showVST3Panel: true }),
  setShowVST3Panel: (v) => set(v ? { ...ALL_RIGHT_PANELS_CLOSED, showVST3Panel: true } : { showVST3Panel: false }),

  toggleAIAssistant: () => set((state) => (
    state.showAIAssistant
      ? { showAIAssistant: false }
      : { ...ALL_RIGHT_PANELS_CLOSED, showAIAssistant: true }
  )),
  setShowAIAssistant: (v) => set(
    v ? { ...ALL_RIGHT_PANELS_CLOSED, showAIAssistant: true } : { showAIAssistant: false },
  ),
  setRegionRegenerateTarget: (v) => set({ regionRegenerateTarget: v }),
  setInlineSuggestions: (v) => set({ inlineSuggestions: v }),
  dismissInlineSuggestion: (id) => set((s) => ({
    inlineSuggestions: s.inlineSuggestions.filter((sg) => sg.id !== id),
  })),
  clearInlineSuggestions: () => set({ inlineSuggestions: [] }),
  setSuggestionFrequency: (v) => set({ suggestionFrequency: v }),
  applyWorkspaceComplexity: (tier) => set(getComplexityDefaults(tier)),

  enterSliceMode: (clipId) => set({ sliceModeClipId: clipId }),
  exitSliceMode: () => set({ sliceModeClipId: null }),
  addSliceMarker: (clipId, timeSec) =>
    set((s) => {
      const existing = s.sliceMarkersByClip[clipId] ?? [];
      const updated = [...existing, timeSec].sort((a, b) => a - b);
      return { sliceMarkersByClip: { ...s.sliceMarkersByClip, [clipId]: updated } };
    }),
  removeSliceMarker: (clipId, index) =>
    set((s) => {
      const existing = s.sliceMarkersByClip[clipId] ?? [];
      const updated = existing.filter((_, i) => i !== index);
      return { sliceMarkersByClip: { ...s.sliceMarkersByClip, [clipId]: updated } };
    }),
  setSliceMarkers: (clipId, markers) =>
    set((s) => ({
      sliceMarkersByClip: { ...s.sliceMarkersByClip, [clipId]: [...markers].sort((a, b) => a - b) },
    })),

  setSelectedSessionSlot: (slot) => set({ selectedSessionSlot: slot }),
  clearSelectedSessionSlot: () => set({ selectedSessionSlot: null }),

  setTrackLaneRect: (trackId, rect) =>
    set((s) => {
      const prev = s.trackLaneRects.get(trackId);
      if (prev && prev.top === rect.top && prev.height === rect.height) return s;
      const next = new Map(s.trackLaneRects);
      next.set(trackId, rect);
      return { trackLaneRects: next };
    }),
  removeTrackLaneRect: (trackId) =>
    set((s) => {
      const next = new Map(s.trackLaneRects);
      next.delete(trackId);
      return { trackLaneRects: next };
    }),

  // Synth Preset Browser
  userSynthPresets: [],
  saveSynthPreset: (name, category, params) => {
    const preset: SynthPresetDefinition = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      category,
      isFactory: false,
      waveform: params.waveform,
      envelope: params.envelope,
      legacyPreset: params.legacyPreset,
      ...(params.filter ? { filter: params.filter } : {}),
      ...(params.detuneCents !== undefined ? { detuneCents: params.detuneCents } : {}),
      ...(params.glideTime !== undefined ? { glideTime: params.glideTime } : {}),
      ...(params.outputGain !== undefined ? { outputGain: params.outputGain } : {}),
    };
    set((s) => ({ userSynthPresets: [...s.userSynthPresets, preset] }));
    return preset;
  },
  deleteUserSynthPreset: (presetId) =>
    set((s) => ({
      userSynthPresets: s.userSynthPresets.filter((p) => p.id !== presetId),
    })),

  // Unified instrument presets
  userInstrumentPresets: [],
  saveInstrumentPreset: (preset) =>
    set((s) => ({ userInstrumentPresets: [...s.userInstrumentPresets, preset] })),
  deleteInstrumentPreset: (presetId) =>
    set((s) => ({
      userInstrumentPresets: s.userInstrumentPresets.filter((p) => p.id !== presetId),
    })),
}),
    {
      name: 'ace-step-daw-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Panel open/close states
        showMixer: state.showMixer,
        showClipInspector: state.showClipInspector,
        showLibrary: state.showLibrary,
        loopBrowserOpen: state.loopBrowserOpen,
        showVirtualKeyboard: state.showVirtualKeyboard,
        showMidiControllerPanel: state.showMidiControllerPanel,
        showSmartControls: state.showSmartControls,
        statusBarAutoHide: state.statusBarAutoHide,
        keyboardContext: state.keyboardContext,
        activePianoRollTool: state.activePianoRollTool,
        showGhostNotes: state.showGhostNotes,
        activeChordShape: state.activeChordShape,
        activePianoRollChordShape: state.activePianoRollChordShape,
        // Panel sizes
        mixerHeight: state.mixerHeight,
        drumMachineEditorHeight: state.drumMachineEditorHeight,
        sequencerEditorHeight: state.sequencerEditorHeight,
        pianoRollHeight: state.pianoRollHeight,
        pianoRollExpressionType: state.pianoRollExpressionType,
        effectChainHeight: state.effectChainHeight,
        virtualKeyboardOctave: state.virtualKeyboardOctave,
        virtualKeyboardVelocity: state.virtualKeyboardVelocity,
        assetsPanelWidth: state.assetsPanelWidth,
        trackListDisplayMode: state.trackListDisplayMode,
        trackListWidth: state.trackListWidth,
        expandedTrackListWidth: state.expandedTrackListWidth,
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
        recentlyUsedLoopIds: state.recentlyUsedLoopIds,
        // Model Library panel
        showModelLibrary: state.showModelLibrary,
        // Custom Models panel
        showCustomModels: state.showCustomModels,
        // Generation panel
        showGenerationPanel: state.showGenerationPanel,
        showGenerationHistoryPanel: state.showGenerationHistoryPanel,
        generationPanelView: state.generationPanelView,
        // AI Assistant
        showAIAssistant: state.showAIAssistant,
        // Workspace
        workspaceComplexity: state.workspaceComplexity,
        // Inline suggestions
        suggestionFrequency: state.suggestionFrequency,
        // Command palette
        recentCommandIds: state.recentCommandIds,
        // DSP backend
        dspBackend: state.dspBackend,
        // Accessibility
        reducedMotion: state.reducedMotion,
        reducedMotionOverride: state.reducedMotionOverride,
        highContrastMode: state.highContrastMode,
        colorBlindMode: state.colorBlindMode,
        // Theme
        theme: state.theme,
        // Synth presets
        userSynthPresets: state.userSynthPresets,
        userInstrumentPresets: state.userInstrumentPresets,
        // Video recording settings
        videoRecordingSettings: state.videoRecordingSettings,
        // Groove pool
        grooveStrength: state.grooveStrength,
      }),
    },
  ),
);

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
    punchEnabled: transportStore.punchEnabled,
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
      togglePunch: transportStore.togglePunch,
      setShowNewProjectDialog: state.setShowNewProjectDialog,
      setShowProjectListDialog: state.setShowProjectListDialog,
      openGenerationSettings: () => state.openGenerationPanelView('settings'),
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
      reverseClip: projectStore.reverseClip,
      normalizeClip: projectStore.normalizeClip,
      adjustClipGain: projectStore.adjustClipGain,
      setEditingClip: state.setEditingClip,
      deselectAll: state.deselectAll,
      openEnhancer: state.openEnhancer,
    },
  };
}

/** Compute total height of visible bottom panels (editors + mixer). */
export function getBottomPanelHeight(state: UIState): number {
  let height = 0;
  switch (state.activeBottomPanel) {
    case 'smart': height = 140; break;
    case 'editor': height = state.sequencerEditorHeight; break;
    case 'pianoRoll': height = state.pianoRollHeight; break;
    case 'effects': height = state.effectChainHeight; break;
    case 'drumMachine': height = state.drumMachineEditorHeight; break;
    case 'strudel': height = 300; break;
    default: break;
  }
  if (state.showMixer) {
    // Mixer renders at Math.max(mixerHeight, 360) — use the same floor
    height += Math.max(state.mixerHeight, 360);
  }
  if (state.showClipInspector) {
    height += 280; // matches ClipInspectorPanel maxHeight
  }
  return height;
}

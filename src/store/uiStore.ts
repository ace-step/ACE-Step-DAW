import { create } from 'zustand';

interface UIState {
  pixelsPerSecond: number;
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
  /** Global context window set by Cmd+drag on the timeline. */
  contextWindow: { startTime: number; endTime: number } | null;
  /** Multi-track select window set by non-Cmd drag on the timeline. */
  selectWindow: { startTime: number; endTime: number } | null;
  /** Track whose inspector panel is currently expanded. */
  expandedTrackId: string | null;

  setPixelsPerSecond: (pps: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
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
  setContextWindow: (v: { startTime: number; endTime: number } | null) => void;
  setSelectWindow: (v: { startTime: number; endTime: number } | null) => void;
  setExpandedTrackId: (id: string | null) => void;
}

const ZOOM_LEVELS = [10, 25, 50, 100, 200, 500];

export const useUIStore = create<UIState>((set) => ({
  pixelsPerSecond: 50,
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
  mixerHeight: 260,
  contextWindow: null,
  selectWindow: null,
  expandedTrackId: null,

  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),

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
  setMixerHeight: (v) => set({ mixerHeight: Math.min(450, Math.max(160, v)) }),
  setContextWindow: (v) => set({ contextWindow: v }),
  setSelectWindow: (v) => set({ selectWindow: v }),
  setExpandedTrackId: (id) => set({ expandedTrackId: id }),
}));

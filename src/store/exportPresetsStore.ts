/**
 * Export Presets Store — Zustand store with localStorage persistence.
 * Manages export configuration presets and stem group presets.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ExportPreset,
  StemGroupPreset,
  ExportPresetsState,
  ExportPresetsActions,
} from '../types/exportPresets';

/** Generate a short unique ID. */
function generateId(): string {
  return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const BUILT_IN_PRESETS: ExportPreset[] = [
  {
    id: 'builtin-quick-mp3',
    name: 'Quick MP3',
    description: 'Fast MP3 export at highest quality with auto-filled metadata',
    builtIn: true,
    format: 'mp3',
    sampleRate: 44100,
    bitDepth: 16,
    mp3Bitrate: 320,
    oggQuality: 0.5,
    autoFillMetadata: true,
    batchFormats: [],
  },
  {
    id: 'builtin-master-wav',
    name: 'Master WAV 24-bit',
    description: 'High-quality master for distribution or further processing',
    builtIn: true,
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    mp3Bitrate: 320,
    oggQuality: 0.5,
    autoFillMetadata: true,
    batchFormats: [],
  },
  {
    id: 'builtin-stems',
    name: 'Stems for Mixing',
    description: 'Export individual stems as 24-bit WAV for external mixing',
    builtIn: true,
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    mp3Bitrate: 320,
    oggQuality: 0.5,
    autoFillMetadata: false,
    batchFormats: [],
  },
  {
    id: 'builtin-all-formats',
    name: 'All Formats Bundle',
    description: 'Export as WAV + MP3 + FLAC in one action',
    builtIn: true,
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    mp3Bitrate: 320,
    oggQuality: 0.5,
    autoFillMetadata: true,
    batchFormats: ['mp3', 'flac'],
  },
];

export const BUILT_IN_STEM_GROUPS: StemGroupPreset[] = [
  {
    id: 'builtin-rhythm',
    name: 'Rhythm Section',
    trackIds: [],
    builtIn: true,
  },
  {
    id: 'builtin-melody',
    name: 'Melody & Vocals',
    trackIds: [],
    builtIn: true,
  },
];

const initialState: ExportPresetsState = {
  presets: [...BUILT_IN_PRESETS],
  stemGroupPresets: [...BUILT_IN_STEM_GROUPS],
  lastUsedPresetId: null,
};

export const useExportPresetsStore = create<ExportPresetsState & ExportPresetsActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addPreset: (preset) => {
        const id = generateId();
        const newPreset: ExportPreset = { ...preset, id, builtIn: false };
        set((state) => ({ presets: [...state.presets, newPreset] }));
        return id;
      },

      updatePreset: (id, updates) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id && !p.builtIn ? { ...p, ...updates } : p,
          ),
        }));
      },

      deletePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id || p.builtIn),
          lastUsedPresetId: state.lastUsedPresetId === id ? null : state.lastUsedPresetId,
        }));
      },

      getPresetById: (id) => {
        return get().presets.find((p) => p.id === id);
      },

      setLastUsedPresetId: (id) => {
        set({ lastUsedPresetId: id });
      },

      addStemGroupPreset: (preset) => {
        const id = generateId();
        const newGroup: StemGroupPreset = { ...preset, id, builtIn: false };
        set((state) => ({ stemGroupPresets: [...state.stemGroupPresets, newGroup] }));
        return id;
      },

      updateStemGroupPreset: (id, updates) => {
        set((state) => ({
          stemGroupPresets: state.stemGroupPresets.map((g) =>
            g.id === id && !g.builtIn ? { ...g, ...updates } : g,
          ),
        }));
      },

      deleteStemGroupPreset: (id) => {
        set((state) => ({
          stemGroupPresets: state.stemGroupPresets.filter((g) => g.id !== id || g.builtIn),
        }));
      },

      getStemGroupPresetById: (id) => {
        return get().stemGroupPresets.find((g) => g.id === id);
      },

      resetToDefaults: () => {
        set({ ...initialState });
      },
    }),
    {
      name: 'ace-daw-export-presets',
      partialize: (state) => ({
        presets: state.presets,
        stemGroupPresets: state.stemGroupPresets,
        lastUsedPresetId: state.lastUsedPresetId,
      }),
    },
  ),
);

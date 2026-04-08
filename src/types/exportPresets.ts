/**
 * Types for the Export Enhancement Suite.
 * Covers export presets, stem group presets, and enhanced metadata.
 */

import type { ExportFormat, ExportMetadata, Mp3Bitrate, SampleRateOption, BitDepth } from '../utils/audioEncoders';

/**
 * Re-export ExportMetadata which now includes bpm and key fields.
 * Kept as a named alias for clarity in export-preset contexts.
 */
export type ExportMetadataExtended = ExportMetadata;

/** A saved export configuration preset. */
export interface ExportPreset {
  id: string;
  name: string;
  description?: string;
  /** Whether this is a built-in preset (cannot be deleted/renamed). */
  builtIn: boolean;
  format: ExportFormat;
  sampleRate: SampleRateOption;
  bitDepth: BitDepth;
  mp3Bitrate: Mp3Bitrate;
  oggQuality: number;
  /** Whether to auto-fill metadata from project settings. */
  autoFillMetadata: boolean;
  /** Additional formats for batch export (empty = single format). */
  batchFormats: ExportFormat[];
}

/** A saved stem group selection. */
export interface StemGroupPreset {
  id: string;
  name: string;
  /** Track IDs included in this group. Empty = use at-export-time selection. */
  trackIds: string[];
  /** Whether this is a built-in preset. */
  builtIn: boolean;
}

/** State shape for the export presets store. */
export interface ExportPresetsState {
  presets: ExportPreset[];
  stemGroupPresets: StemGroupPreset[];
  lastUsedPresetId: string | null;
}

/** Actions for the export presets store. */
export interface ExportPresetsActions {
  addPreset: (preset: Omit<ExportPreset, 'id' | 'builtIn'>) => string;
  updatePreset: (id: string, updates: Partial<Omit<ExportPreset, 'id' | 'builtIn'>>) => void;
  deletePreset: (id: string) => void;
  getPresetById: (id: string) => ExportPreset | undefined;
  setLastUsedPresetId: (id: string | null) => void;
  addStemGroupPreset: (preset: Omit<StemGroupPreset, 'id' | 'builtIn'>) => string;
  updateStemGroupPreset: (id: string, updates: Partial<Omit<StemGroupPreset, 'id' | 'builtIn'>>) => void;
  deleteStemGroupPreset: (id: string) => void;
  getStemGroupPresetById: (id: string) => StemGroupPreset | undefined;
  resetToDefaults: () => void;
}

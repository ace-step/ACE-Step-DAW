import { describe, it, expect, beforeEach } from 'vitest';
import { useExportPresetsStore, BUILT_IN_PRESETS, BUILT_IN_STEM_GROUPS } from '../exportPresetsStore';

describe('exportPresetsStore', () => {
  beforeEach(() => {
    useExportPresetsStore.getState().resetToDefaults();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('contains built-in presets on init', () => {
      const { presets } = useExportPresetsStore.getState();
      expect(presets.length).toBeGreaterThanOrEqual(4);
      expect(presets.every((p) => p.builtIn)).toBe(true);
    });

    it('contains built-in stem group presets on init', () => {
      const { stemGroupPresets } = useExportPresetsStore.getState();
      expect(stemGroupPresets.length).toBeGreaterThanOrEqual(2);
    });

    it('has Quick MP3 preset with correct defaults', () => {
      const preset = useExportPresetsStore.getState().presets.find((p) => p.name === 'Quick MP3');
      expect(preset).toBeDefined();
      expect(preset!.format).toBe('mp3');
      expect(preset!.mp3Bitrate).toBe(320);
      expect(preset!.autoFillMetadata).toBe(true);
      expect(preset!.batchFormats).toEqual([]);
    });

    it('has Master WAV 24-bit preset', () => {
      const preset = useExportPresetsStore.getState().presets.find((p) => p.name === 'Master WAV 24-bit');
      expect(preset).toBeDefined();
      expect(preset!.format).toBe('wav');
      expect(preset!.bitDepth).toBe(24);
      expect(preset!.sampleRate).toBe(48000);
    });

    it('has Stems for Mixing preset', () => {
      const preset = useExportPresetsStore.getState().presets.find((p) => p.name === 'Stems for Mixing');
      expect(preset).toBeDefined();
      expect(preset!.format).toBe('wav');
      expect(preset!.bitDepth).toBe(24);
    });

    it('has All Formats Bundle preset with batch formats', () => {
      const preset = useExportPresetsStore.getState().presets.find((p) => p.name === 'All Formats Bundle');
      expect(preset).toBeDefined();
      expect(preset!.batchFormats.length).toBeGreaterThanOrEqual(2);
      expect(preset!.batchFormats).toContain('mp3');
      expect(preset!.batchFormats).toContain('flac');
    });

    it('has null lastUsedPresetId initially', () => {
      expect(useExportPresetsStore.getState().lastUsedPresetId).toBeNull();
    });
  });

  describe('preset CRUD', () => {
    it('addPreset creates a user preset with generated id', () => {
      const id = useExportPresetsStore.getState().addPreset({
        name: 'My Custom',
        format: 'flac',
        sampleRate: 44100,
        bitDepth: 24,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        autoFillMetadata: false,
        batchFormats: [],
      });
      expect(id).toBeTruthy();
      const preset = useExportPresetsStore.getState().getPresetById(id);
      expect(preset).toBeDefined();
      expect(preset!.name).toBe('My Custom');
      expect(preset!.builtIn).toBe(false);
    });

    it('updatePreset modifies an existing user preset', () => {
      const id = useExportPresetsStore.getState().addPreset({
        name: 'Temp',
        format: 'wav',
        sampleRate: 48000,
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        autoFillMetadata: false,
        batchFormats: [],
      });
      useExportPresetsStore.getState().updatePreset(id, { name: 'Updated', format: 'mp3' });
      const preset = useExportPresetsStore.getState().getPresetById(id);
      expect(preset!.name).toBe('Updated');
      expect(preset!.format).toBe('mp3');
    });

    it('updatePreset does not modify built-in presets', () => {
      const builtIn = useExportPresetsStore.getState().presets.find((p) => p.builtIn)!;
      const originalName = builtIn.name;
      useExportPresetsStore.getState().updatePreset(builtIn.id, { name: 'Hacked' });
      const after = useExportPresetsStore.getState().getPresetById(builtIn.id);
      expect(after!.name).toBe(originalName);
    });

    it('deletePreset removes a user preset', () => {
      const id = useExportPresetsStore.getState().addPreset({
        name: 'To Delete',
        format: 'wav',
        sampleRate: 48000,
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        autoFillMetadata: false,
        batchFormats: [],
      });
      useExportPresetsStore.getState().deletePreset(id);
      expect(useExportPresetsStore.getState().getPresetById(id)).toBeUndefined();
    });

    it('deletePreset does not remove built-in presets', () => {
      const builtIn = useExportPresetsStore.getState().presets.find((p) => p.builtIn)!;
      const countBefore = useExportPresetsStore.getState().presets.length;
      useExportPresetsStore.getState().deletePreset(builtIn.id);
      expect(useExportPresetsStore.getState().presets.length).toBe(countBefore);
    });

    it('getPresetById returns undefined for unknown id', () => {
      expect(useExportPresetsStore.getState().getPresetById('nonexistent')).toBeUndefined();
    });

    it('setLastUsedPresetId persists the value', () => {
      const id = useExportPresetsStore.getState().presets[0].id;
      useExportPresetsStore.getState().setLastUsedPresetId(id);
      expect(useExportPresetsStore.getState().lastUsedPresetId).toBe(id);
    });
  });

  describe('stem group preset CRUD', () => {
    it('addStemGroupPreset creates a user stem group', () => {
      const id = useExportPresetsStore.getState().addStemGroupPreset({
        name: 'My Drums',
        trackIds: ['track-1', 'track-2'],
      });
      const group = useExportPresetsStore.getState().getStemGroupPresetById(id);
      expect(group).toBeDefined();
      expect(group!.name).toBe('My Drums');
      expect(group!.trackIds).toEqual(['track-1', 'track-2']);
      expect(group!.builtIn).toBe(false);
    });

    it('updateStemGroupPreset modifies name and trackIds', () => {
      const id = useExportPresetsStore.getState().addStemGroupPreset({
        name: 'Old',
        trackIds: [],
      });
      useExportPresetsStore.getState().updateStemGroupPreset(id, {
        name: 'New',
        trackIds: ['track-3'],
      });
      const group = useExportPresetsStore.getState().getStemGroupPresetById(id);
      expect(group!.name).toBe('New');
      expect(group!.trackIds).toEqual(['track-3']);
    });

    it('deleteStemGroupPreset removes a user stem group', () => {
      const id = useExportPresetsStore.getState().addStemGroupPreset({
        name: 'Temp',
        trackIds: [],
      });
      useExportPresetsStore.getState().deleteStemGroupPreset(id);
      expect(useExportPresetsStore.getState().getStemGroupPresetById(id)).toBeUndefined();
    });

    it('deleteStemGroupPreset does not remove built-in groups', () => {
      const builtIn = useExportPresetsStore.getState().stemGroupPresets.find((g) => g.builtIn);
      if (!builtIn) return; // skip if no built-in groups
      const countBefore = useExportPresetsStore.getState().stemGroupPresets.length;
      useExportPresetsStore.getState().deleteStemGroupPreset(builtIn.id);
      expect(useExportPresetsStore.getState().stemGroupPresets.length).toBe(countBefore);
    });
  });

  describe('resetToDefaults', () => {
    it('restores built-in presets and removes user presets', () => {
      useExportPresetsStore.getState().addPreset({
        name: 'Custom',
        format: 'wav',
        sampleRate: 48000,
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        autoFillMetadata: false,
        batchFormats: [],
      });
      useExportPresetsStore.getState().resetToDefaults();
      const { presets } = useExportPresetsStore.getState();
      expect(presets.every((p) => p.builtIn)).toBe(true);
      expect(presets.length).toBe(BUILT_IN_PRESETS.length);
    });
  });

  describe('localStorage persistence', () => {
    it('persists user presets across store recreations', () => {
      const id = useExportPresetsStore.getState().addPreset({
        name: 'Persistent',
        format: 'flac',
        sampleRate: 44100,
        bitDepth: 24,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        autoFillMetadata: true,
        batchFormats: ['mp3'],
      });

      // Simulate store recreation by reading persisted state
      const stored = localStorage.getItem('ace-daw-export-presets');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.presets.some((p: { id: string }) => p.id === id)).toBe(true);
    });
  });
});

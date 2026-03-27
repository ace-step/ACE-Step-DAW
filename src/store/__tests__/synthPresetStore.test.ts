import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';
import { FACTORY_SYNTH_PRESETS } from '../../data/synthPresets';

describe('uiStore — synth preset storage', () => {
  beforeEach(() => {
    useUIStore.setState({ userSynthPresets: [] });
  });

  it('starts with empty userSynthPresets', () => {
    expect(useUIStore.getState().userSynthPresets).toEqual([]);
  });

  it('saveSynthPreset adds a user preset', () => {
    const { saveSynthPreset } = useUIStore.getState();
    const saved = saveSynthPreset('My Bass', 'Bass', {
      waveform: 'sawtooth',
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
      legacyPreset: 'bass',
    });

    expect(saved.name).toBe('My Bass');
    expect(saved.category).toBe('Bass');
    expect(saved.isFactory).toBe(false);
    expect(saved.id).toMatch(/^user-/);
    expect(saved.waveform).toBe('sawtooth');
    expect(saved.legacyPreset).toBe('bass');

    const presets = useUIStore.getState().userSynthPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(saved.id);
  });

  it('saveSynthPreset preserves filter params when provided', () => {
    const { saveSynthPreset } = useUIStore.getState();
    const saved = saveSynthPreset('Filtered Lead', 'Lead', {
      waveform: 'square',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 2000 },
      legacyPreset: 'lead',
    });

    expect(saved.filter).toEqual({ enabled: true, type: 'lowpass', cutoffHz: 2000 });
  });

  it('deleteUserSynthPreset removes a preset by id', () => {
    const { saveSynthPreset } = useUIStore.getState();
    const saved = saveSynthPreset('Temp', 'Pad', {
      waveform: 'sine',
      envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 2.0 },
      legacyPreset: 'pad',
    });

    expect(useUIStore.getState().userSynthPresets).toHaveLength(1);

    useUIStore.getState().deleteUserSynthPreset(saved.id);
    expect(useUIStore.getState().userSynthPresets).toHaveLength(0);
  });

  it('deleteUserSynthPreset is a no-op for unknown ids', () => {
    const { saveSynthPreset } = useUIStore.getState();
    saveSynthPreset('Keep', 'Bass', {
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
      legacyPreset: 'bass',
    });

    useUIStore.getState().deleteUserSynthPreset('nonexistent');
    expect(useUIStore.getState().userSynthPresets).toHaveLength(1);
  });

  it('cannot delete factory presets via deleteUserSynthPreset', () => {
    const factoryId = FACTORY_SYNTH_PRESETS[0].id;
    useUIStore.getState().deleteUserSynthPreset(factoryId);
    // Factory presets live in FACTORY_SYNTH_PRESETS, not in userSynthPresets
    expect(useUIStore.getState().userSynthPresets).toEqual([]);
  });

  it('multiple user presets accumulate', () => {
    const { saveSynthPreset } = useUIStore.getState();
    saveSynthPreset('P1', 'Bass', { waveform: 'sine', envelope: { attack: 0, decay: 0, sustain: 1, release: 0 }, legacyPreset: 'bass' });
    saveSynthPreset('P2', 'Lead', { waveform: 'square', envelope: { attack: 0, decay: 0, sustain: 1, release: 0 }, legacyPreset: 'lead' });
    saveSynthPreset('P3', 'Pad', { waveform: 'triangle', envelope: { attack: 0, decay: 0, sustain: 1, release: 0 }, legacyPreset: 'pad' });

    const presets = useUIStore.getState().userSynthPresets;
    expect(presets).toHaveLength(3);
    expect(presets.map((p) => p.name)).toEqual(['P1', 'P2', 'P3']);
  });
});

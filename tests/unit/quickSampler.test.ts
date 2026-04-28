import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { createSamplerConfig } from '../../src/engine/SamplerEngine';
import type { AssetClip } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// ── createQuickSamplerFromAsset ─────────────────────────────────────────────

describe('projectStore.createQuickSamplerFromAsset', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  function seedAsset(overrides?: Partial<AssetClip>): AssetClip {
    const asset: AssetClip = {
      id: 'asset-1',
      clipId: 'clip-1',
      trackDisplayName: 'Vocal Chop',
      prompt: 'vocal chop',
      source: 'uploaded',
      isolatedAudioKey: 'audio:proj:clip-1:iso',
      cumulativeMixKey: null,
      waveformPeaks: null,
      starred: false,
      createdAt: Date.now(),
      duration: 2.5,
      ...overrides,
    };
    const state = useProjectStore.getState();
    useProjectStore.setState({
      project: {
        ...state.project!,
        assets: [...(state.project!.assets ?? []), asset],
      },
    });
    return asset;
  }

  it('creates a sampler track from an asset by ID', () => {
    seedAsset();
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(track).not.toBeUndefined();
    expect(track!.trackType).toBe('pianoRoll');
    expect(track!.synthPreset).toBe('sampler');
    expect(track!.samplerConfig?.audioKey).toBe('audio:proj:clip-1:iso');
    expect(track!.sampler?.sampleName).toBe('vocal chop');
  });

  it('returns undefined for non-existent asset', () => {
    const track = useProjectStore.getState().createQuickSamplerFromAsset('nonexistent');
    expect(track).toBeUndefined();
  });

  it('returns undefined when asset has no audio key', () => {
    seedAsset({ isolatedAudioKey: null, cumulativeMixKey: null });
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(track).toBeUndefined();
  });

  it('uses cumulativeMixKey when isolatedAudioKey is null', () => {
    seedAsset({ isolatedAudioKey: null, cumulativeMixKey: 'audio:proj:clip-1:cum' });
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(track).not.toBeUndefined();
    expect(track!.samplerConfig?.audioKey).toBe('audio:proj:clip-1:cum');
  });

  it('sets the asset duration on the sampler config', () => {
    seedAsset({ duration: 3.7 });
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(track!.samplerConfig?.trimEnd).toBeCloseTo(3.7, 1);
    expect(track!.sampler?.sampleDuration).toBeCloseTo(3.7, 1);
  });

  it('accepts optional rootNote override', () => {
    seedAsset();
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1', { rootNote: 48 });
    expect(track!.samplerConfig?.rootNote).toBe(48);
  });

  it('accepts optional trackId to update an existing track', () => {
    seedAsset();
    const existing = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1', { trackId: existing.id });
    expect(track!.id).toBe(existing.id);
    expect(track!.synthPreset).toBe('sampler');
  });

  it('pushes to undo history', () => {
    seedAsset();
    const tracksBefore = useProjectStore.getState().project!.tracks.length;
    useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(useProjectStore.getState().project!.tracks.length).toBe(tracksBefore + 1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks.length).toBe(tracksBefore);
  });

  it('falls back to trackDisplayName when prompt is empty', () => {
    seedAsset({ prompt: '', trackDisplayName: 'My Vocal' });
    const track = useProjectStore.getState().createQuickSamplerFromAsset('asset-1');
    expect(track!.sampler?.sampleName).toBe('My Vocal');
  });
});

// ── createQuickSamplerTrack extended coverage ───────────────────────────────

describe('projectStore.createQuickSamplerTrack (extended)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  it('creates a new track when no trackId is provided', () => {
    const tracksBefore = useProjectStore.getState().project!.tracks.length;
    const track = useProjectStore.getState().createQuickSamplerTrack({
      audioKey: 'audio:test',
      sampleName: 'Test Sample',
      sampleDuration: 1.5,
    });
    expect(track).not.toBeUndefined();
    expect(useProjectStore.getState().project!.tracks.length).toBe(tracksBefore + 1);
    expect(track!.displayName).toBe('Test Sample');
    expect(track!.synthPreset).toBe('sampler');
    expect(track!.samplerConfig?.playbackMode).toBe('classic');
  });

  it('sets correct ADSR defaults', () => {
    const track = useProjectStore.getState().createQuickSamplerTrack({
      audioKey: 'audio:test',
      sampleDuration: 2.0,
    });
    expect(track!.samplerConfig?.attack).toBe(0.005);
    expect(track!.samplerConfig?.decay).toBe(0.1);
    expect(track!.samplerConfig?.sustain).toBe(1);
    expect(track!.samplerConfig?.release).toBe(0.3);
  });

  it('defaults display name to Quick Sampler when sampleName is omitted', () => {
    const track = useProjectStore.getState().createQuickSamplerTrack({
      audioKey: 'audio:test',
    });
    expect(track!.displayName).toBe('Quick Sampler');
  });
});

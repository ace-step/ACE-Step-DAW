import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSamplerConfig, DEFAULT_SAMPLER_CONFIG } from '../../src/engine/SamplerEngine';
import type { SamplerConfig } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// ─── createSamplerConfig ─────────────────────────────────────────────────────

describe('createSamplerConfig', () => {
  it('creates a config with sensible defaults', () => {
    const config = createSamplerConfig('audio:proj:clip:iso:123');

    expect(config).toEqual({
      audioKey: 'audio:proj:clip:iso:123',
      rootNote: 60,
      attack: 0.005,
      decay: 0.1,
      sustain: 1,
      release: 0.3,
    });
  });

  it('allows overriding individual fields', () => {
    const config = createSamplerConfig('key-1', { rootNote: 48, release: 1.5 });

    expect(config.audioKey).toBe('key-1');
    expect(config.rootNote).toBe(48);
    expect(config.release).toBe(1.5);
    // Non-overridden fields keep defaults
    expect(config.attack).toBe(DEFAULT_SAMPLER_CONFIG.attack);
    expect(config.sustain).toBe(DEFAULT_SAMPLER_CONFIG.sustain);
  });

  it('audioKey override wins over default-less base', () => {
    const config = createSamplerConfig('original', { audioKey: 'overridden' });
    expect(config.audioKey).toBe('overridden');
  });
});

// ─── DEFAULT_SAMPLER_CONFIG ──────────────────────────────────────────────────

describe('DEFAULT_SAMPLER_CONFIG', () => {
  it('has C4 as root note', () => {
    expect(DEFAULT_SAMPLER_CONFIG.rootNote).toBe(60);
  });

  it('has ADSR in valid ranges', () => {
    expect(DEFAULT_SAMPLER_CONFIG.attack).toBeGreaterThan(0);
    expect(DEFAULT_SAMPLER_CONFIG.decay).toBeGreaterThan(0);
    expect(DEFAULT_SAMPLER_CONFIG.sustain).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SAMPLER_CONFIG.sustain).toBeLessThanOrEqual(1);
    expect(DEFAULT_SAMPLER_CONFIG.release).toBeGreaterThan(0);
  });
});

// ─── SamplerConfig on Track type ─────────────────────────────────────────────

describe('SamplerConfig type integration', () => {
  it('SamplerConfig has required fields', () => {
    const config: SamplerConfig = {
      audioKey: 'test-key',
      rootNote: 60,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.8,
      release: 0.5,
    };
    expect(config.audioKey).toBe('test-key');
    expect(config.rootNote).toBe(60);
  });
});

// ─── Store: updateSamplerConfig ──────────────────────────────────────────────

describe('projectStore.updateSamplerConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  it('sets samplerConfig on an existing track', () => {
    const track = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const config = createSamplerConfig('audio:sample-1');

    useProjectStore.getState().updateSamplerConfig(track.id, config);

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(updated.samplerConfig).toEqual(config);
  });

  it('clears samplerConfig when null is passed', () => {
    const track = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const config = createSamplerConfig('audio:sample-1');

    useProjectStore.getState().updateSamplerConfig(track.id, config);
    useProjectStore.getState().updateSamplerConfig(track.id, null);

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(updated.samplerConfig).toBeUndefined();
  });

  it('pushes to undo history', () => {
    const track = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const config = createSamplerConfig('audio:sample-1');

    useProjectStore.getState().updateSamplerConfig(track.id, config);
    useProjectStore.getState().undo();

    const after = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(after.samplerConfig).toBeUndefined();
  });

  it('does not affect other tracks', () => {
    const track1 = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const track2 = useProjectStore.getState().addTrack('synth', 'pianoRoll');
    const config = createSamplerConfig('audio:only-track-1');

    useProjectStore.getState().updateSamplerConfig(track1.id, config);

    const t2 = useProjectStore.getState().project!.tracks.find((t) => t.id === track2.id)!;
    expect(t2.samplerConfig).toBeUndefined();
  });

  it('updates updatedAt timestamp', () => {
    const track = useProjectStore.getState().addTrack('custom', 'pianoRoll');
    const before = useProjectStore.getState().project!.updatedAt;
    const config = createSamplerConfig('audio:sample-1');

    useProjectStore.getState().updateSamplerConfig(track.id, config);

    const after = useProjectStore.getState().project!.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

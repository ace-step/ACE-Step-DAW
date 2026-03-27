import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { VelocityLayer, SamplerConfig } from '../../types/project';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupSamplerTrack() {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('pianoRoll');
  const config: SamplerConfig = {
    audioKey: 'test-audio',
    rootNote: 60,
    trimStart: 0,
    trimEnd: 1,
    playbackMode: 'classic',
    loopStart: 0,
    loopEnd: 1,
    attack: 0.005,
    decay: 0.1,
    sustain: 1,
    release: 0.3,
  };
  useProjectStore.getState().updateSamplerConfig(track.id, config);
  return track;
}

function getTrack(trackId: string) {
  return useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
}

describe('velocity layer store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  describe('addVelocityLayer', () => {
    it('adds a velocity layer to a track with samplerConfig', () => {
      const track = setupSamplerTrack();
      const layer: VelocityLayer = {
        minVelocity: 0,
        maxVelocity: 63,
        sampleUrl: 'soft-sample',
        gain: 0.8,
      };

      useProjectStore.getState().addVelocityLayer(track.id, layer);

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers).toHaveLength(1);
      expect(updated.samplerConfig!.velocityLayers![0]).toEqual(layer);
    });

    it('appends multiple layers', () => {
      const track = setupSamplerTrack();
      const soft: VelocityLayer = { minVelocity: 0, maxVelocity: 63, sampleUrl: 'soft', gain: 0.7 };
      const loud: VelocityLayer = { minVelocity: 64, maxVelocity: 127, sampleUrl: 'loud', gain: 1.0 };

      useProjectStore.getState().addVelocityLayer(track.id, soft);
      useProjectStore.getState().addVelocityLayer(track.id, loud);

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers).toHaveLength(2);
      expect(updated.samplerConfig!.velocityLayers![0].sampleUrl).toBe('soft');
      expect(updated.samplerConfig!.velocityLayers![1].sampleUrl).toBe('loud');
    });

    it('does nothing if track has no samplerConfig', () => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('pianoRoll');
      const layer: VelocityLayer = { minVelocity: 0, maxVelocity: 127, sampleUrl: 'x', gain: 1 };

      useProjectStore.getState().addVelocityLayer(track.id, layer);

      const updated = getTrack(track.id);
      expect(updated.samplerConfig).toBeUndefined();
    });
  });

  describe('removeVelocityLayer', () => {
    it('removes a velocity layer by index', () => {
      const track = setupSamplerTrack();
      const soft: VelocityLayer = { minVelocity: 0, maxVelocity: 63, sampleUrl: 'soft', gain: 0.7 };
      const loud: VelocityLayer = { minVelocity: 64, maxVelocity: 127, sampleUrl: 'loud', gain: 1.0 };

      useProjectStore.getState().addVelocityLayer(track.id, soft);
      useProjectStore.getState().addVelocityLayer(track.id, loud);
      useProjectStore.getState().removeVelocityLayer(track.id, 0);

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers).toHaveLength(1);
      expect(updated.samplerConfig!.velocityLayers![0].sampleUrl).toBe('loud');
    });

    it('does nothing for out-of-range index', () => {
      const track = setupSamplerTrack();
      const layer: VelocityLayer = { minVelocity: 0, maxVelocity: 127, sampleUrl: 'x', gain: 1 };
      useProjectStore.getState().addVelocityLayer(track.id, layer);
      useProjectStore.getState().removeVelocityLayer(track.id, 5);

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers).toHaveLength(1);
    });
  });

  describe('updateVelocityLayer', () => {
    it('partially updates a velocity layer at a given index', () => {
      const track = setupSamplerTrack();
      const layer: VelocityLayer = { minVelocity: 0, maxVelocity: 127, sampleUrl: 'original', gain: 1 };
      useProjectStore.getState().addVelocityLayer(track.id, layer);

      useProjectStore.getState().updateVelocityLayer(track.id, 0, { gain: 0.5, maxVelocity: 80 });

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers![0].gain).toBe(0.5);
      expect(updated.samplerConfig!.velocityLayers![0].maxVelocity).toBe(80);
      expect(updated.samplerConfig!.velocityLayers![0].sampleUrl).toBe('original');
      expect(updated.samplerConfig!.velocityLayers![0].minVelocity).toBe(0);
    });

    it('does nothing for out-of-range index', () => {
      const track = setupSamplerTrack();
      const layer: VelocityLayer = { minVelocity: 0, maxVelocity: 127, sampleUrl: 'x', gain: 1 };
      useProjectStore.getState().addVelocityLayer(track.id, layer);

      useProjectStore.getState().updateVelocityLayer(track.id, 3, { gain: 0.1 });

      const updated = getTrack(track.id);
      expect(updated.samplerConfig!.velocityLayers![0].gain).toBe(1);
    });
  });
});

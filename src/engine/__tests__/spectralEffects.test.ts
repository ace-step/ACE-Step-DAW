/**
 * Tests for spectral effect types, store integration, and automation specs.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/963
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import {
  getEffectAutomationSpec,
  normalizeEffectParamValue,
  denormalizeEffectParamValue,
} from '../../utils/effectAutomation';
import type {
  SpectralFreezeParams,
  SpectralBlurParams,
  SpectralFilterParams,
  SpectralMorphParams,
} from '../../types/project';

describe('spectral effects', () => {
  let trackId: string;

  beforeEach(() => {
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('drums');
    trackId = track.id;
  });

  describe('store integration', () => {
    it('adds spectralFreeze effect with default params', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralFreeze');
      expect(effectId).toBeDefined();
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects).toHaveLength(1);
      expect(track.effects![0].type).toBe('spectralFreeze');
      const params = track.effects![0].params as SpectralFreezeParams;
      expect(params.freeze).toBe(false);
      expect(params.wet).toBe(1.0);
    });

    it('adds spectralBlur effect with default params', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralBlur');
      expect(effectId).toBeDefined();
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects![0].type).toBe('spectralBlur');
      const params = track.effects![0].params as SpectralBlurParams;
      expect(params.decay).toBe(0.85);
      expect(params.wet).toBe(0.7);
    });

    it('adds spectralFilter effect with 32-band mask', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralFilter');
      expect(effectId).toBeDefined();
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects![0].type).toBe('spectralFilter');
      const params = track.effects![0].params as SpectralFilterParams;
      expect(params.bands).toHaveLength(32);
      expect(params.bands.every((b) => b === 1)).toBe(true);
      expect(params.wet).toBe(1.0);
    });

    it('adds spectralMorph effect with default params', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralMorph');
      expect(effectId).toBeDefined();
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects![0].type).toBe('spectralMorph');
      const params = track.effects![0].params as SpectralMorphParams;
      expect(params.amount).toBe(0.5);
      expect(params.wet).toBe(0.7);
    });

    it('updates spectral effect params', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralBlur')!;
      useProjectStore.getState().updateTrackEffect(trackId, effectId, {
        params: { decay: 0.95, wet: 0.5 },
      });
      const track = useProjectStore.getState().project!.tracks[0];
      const effect = track.effects!.find((e) => e.id === effectId);
      const params = effect!.params as SpectralBlurParams;
      expect(params.decay).toBe(0.95);
      expect(params.wet).toBe(0.5);
    });

    it('removes spectral effect', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'spectralFreeze')!;
      expect(useProjectStore.getState().project!.tracks[0].effects).toHaveLength(1);
      useProjectStore.getState().removeTrackEffect(trackId, effectId);
      expect(useProjectStore.getState().project!.tracks[0].effects).toHaveLength(0);
    });
  });

  describe('automation specs', () => {
    it('has automation spec for spectralFreeze wet', () => {
      const spec = getEffectAutomationSpec('spectralFreeze', 'wet');
      expect(spec).not.toBeNull();
      expect(spec!.min).toBe(0);
      expect(spec!.max).toBe(1);
      expect(spec!.label).toBe('Wet');
    });

    it('has automation spec for spectralBlur decay', () => {
      const spec = getEffectAutomationSpec('spectralBlur', 'decay');
      expect(spec).not.toBeNull();
      expect(spec!.min).toBe(0);
      expect(spec!.max).toBe(0.99);
    });

    it('has automation spec for spectralMorph amount', () => {
      const spec = getEffectAutomationSpec('spectralMorph', 'amount');
      expect(spec).not.toBeNull();
      expect(spec!.min).toBe(0);
      expect(spec!.max).toBe(1);
      expect(spec!.label).toBe('Morph');
    });

    it('normalizes and denormalizes spectral params correctly', () => {
      const normalized = normalizeEffectParamValue('spectralBlur', 'decay', 0.495);
      expect(normalized).toBeCloseTo(0.5, 2);

      const denormalized = denormalizeEffectParamValue('spectralBlur', 'decay', 0.5);
      expect(denormalized).toBeCloseTo(0.495, 2);
    });
  });
});

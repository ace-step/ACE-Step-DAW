import { describe, expect, it, beforeEach } from 'vitest';
import {
  denormalizeEffectParamValue,
  getNormalizedEffectAutomationValue,
  normalizeEffectParamValue,
  getEffectAutomationSpec,
  getEffectAutomationLabel,
} from '../../src/utils/effectAutomation';
import type {
  TrackEffect,
  ChorusParams,
  FlangerParams,
  PhaserParams,
  TrackEffectType,
} from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

// ─── Type checks ──────────────────────────────────────────────────────────────

describe('Chorus/Flanger/Phaser type definitions', () => {
  it('chorus params satisfy the ChorusParams interface', () => {
    const params: ChorusParams = {
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      feedback: 0,
      wet: 0.5,
    };
    expect(params.frequency).toBe(1.5);
    expect(params.delayTime).toBe(3.5);
    expect(params.depth).toBe(0.7);
    expect(params.feedback).toBe(0);
    expect(params.wet).toBe(0.5);
  });

  it('flanger params satisfy the FlangerParams interface', () => {
    const params: FlangerParams = {
      frequency: 0.5,
      delayTime: 3,
      depth: 0.7,
      feedback: 0.5,
      wet: 0.5,
    };
    expect(params.frequency).toBe(0.5);
    expect(params.feedback).toBe(0.5);
  });

  it('phaser params satisfy the PhaserParams interface', () => {
    const params: PhaserParams = {
      frequency: 0.5,
      octaves: 3,
      stages: 10,
      Q: 10,
      baseFrequency: 350,
      wet: 0.5,
    };
    expect(params.stages).toBe(10);
    expect(params.Q).toBe(10);
    expect(params.baseFrequency).toBe(350);
  });

  it('TrackEffectType includes chorus, flanger, phaser', () => {
    const types: TrackEffectType[] = ['chorus', 'flanger', 'phaser'];
    expect(types).toHaveLength(3);
  });
});

// ─── Automation specs ─────────────────────────────────────────────────────────

describe('Chorus automation specs', () => {
  it('has automation specs for all numeric params', () => {
    for (const param of ['frequency', 'delayTime', 'depth', 'feedback', 'wet']) {
      const spec = getEffectAutomationSpec('chorus', param);
      expect(spec, `chorus.${param}`).not.toBeNull();
      expect(typeof spec!.min).toBe('number');
      expect(typeof spec!.max).toBe('number');
      expect(spec!.label.length).toBeGreaterThan(0);
      expect(spec!.color.length).toBeGreaterThan(0);
    }
  });

  it('round-trips chorus frequency through normalization', () => {
    const value = 5;
    const normalized = normalizeEffectParamValue('chorus', 'frequency', value);
    expect(normalized).not.toBeNull();
    const denormalized = denormalizeEffectParamValue('chorus', 'frequency', normalized!);
    expect(denormalized).toBeCloseTo(value, 5);
  });

  it('round-trips chorus wet through normalization', () => {
    const value = 0.75;
    const normalized = normalizeEffectParamValue('chorus', 'wet', value);
    expect(normalized).not.toBeNull();
    expect(normalized).toBeCloseTo(0.75, 5);
  });

  it('returns correct label for chorus params', () => {
    expect(getEffectAutomationLabel('chorus', 'frequency')).toBe('Rate');
    expect(getEffectAutomationLabel('chorus', 'wet')).toBe('Dry/Wet');
  });
});

describe('Flanger automation specs', () => {
  it('has automation specs for all numeric params', () => {
    for (const param of ['frequency', 'delayTime', 'depth', 'feedback', 'wet']) {
      const spec = getEffectAutomationSpec('flanger', param);
      expect(spec, `flanger.${param}`).not.toBeNull();
    }
  });

  it('flanger feedback range supports negative values', () => {
    const spec = getEffectAutomationSpec('flanger', 'feedback');
    expect(spec!.min).toBeLessThan(0);
    expect(spec!.max).toBeGreaterThan(0);
  });

  it('round-trips flanger feedback through normalization', () => {
    const value = -0.5;
    const normalized = normalizeEffectParamValue('flanger', 'feedback', value);
    expect(normalized).not.toBeNull();
    const denormalized = denormalizeEffectParamValue('flanger', 'feedback', normalized!);
    expect(denormalized).toBeCloseTo(value, 5);
  });
});

describe('Phaser automation specs', () => {
  it('has automation specs for automatable params (not stages)', () => {
    for (const param of ['frequency', 'octaves', 'Q', 'baseFrequency', 'wet']) {
      const spec = getEffectAutomationSpec('phaser', param);
      expect(spec, `phaser.${param}`).not.toBeNull();
    }
  });

  it('does not have automation spec for stages (discrete value)', () => {
    const spec = getEffectAutomationSpec('phaser', 'stages');
    expect(spec).toBeNull();
  });

  it('round-trips phaser baseFrequency through normalization', () => {
    const value = 1000;
    const normalized = normalizeEffectParamValue('phaser', 'baseFrequency', value);
    expect(normalized).not.toBeNull();
    const denormalized = denormalizeEffectParamValue('phaser', 'baseFrequency', normalized!);
    expect(denormalized).toBeCloseTo(value, 5);
  });
});

// ─── getNormalizedEffectAutomationValue ───────────────────────────────────────

describe('getNormalizedEffectAutomationValue for new effects', () => {
  it('reads normalized value from a chorus effect', () => {
    const effect: TrackEffect = {
      id: 'fx-chorus',
      type: 'chorus',
      enabled: true,
      params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'chorus',
      param: 'wet',
    });
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('reads normalized value from a flanger effect', () => {
    const effect: TrackEffect = {
      id: 'fx-flanger',
      type: 'flanger',
      enabled: true,
      params: { frequency: 0.5, delayTime: 3, depth: 0.7, feedback: 0.5, wet: 0.5 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'flanger',
      param: 'depth',
    });
    expect(result).toBeCloseTo(0.7, 5);
  });

  it('reads normalized value from a phaser effect', () => {
    const effect: TrackEffect = {
      id: 'fx-phaser',
      type: 'phaser',
      enabled: true,
      params: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'phaser',
      param: 'octaves',
    });
    // octaves: (3 - 1) / (6 - 1) = 0.4
    expect(result).toBeCloseTo(0.4, 5);
  });

  it('returns null for mismatched effect type', () => {
    const effect: TrackEffect = {
      id: 'fx-chorus',
      type: 'chorus',
      enabled: true,
      params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'phaser',
      param: 'wet',
    });
    expect(result).toBeNull();
  });
});

// ─── Store: createDefaultTrackEffect ──────────────────────────────────────────

describe('projectStore addTrackEffect for new effects', () => {
  beforeEach(() => {
    const state = useProjectStore.getState();
    if (!state.project) {
      state.createProject();
    }
    // Ensure at least one track
    if ((state.project?.tracks ?? []).length === 0) {
      state.addTrack('stems');
    }
  });

  it('adds a chorus effect with correct default params', () => {
    const state = useProjectStore.getState();
    const trackId = state.project!.tracks[0].id;
    const effectId = state.addTrackEffect(trackId, 'chorus');
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const effect = track.effects!.find((e) => e.id === effectId)!;
    expect(effect.type).toBe('chorus');
    expect(effect.enabled).toBe(true);
    expect(effect.params).toEqual({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      feedback: 0,
      wet: 0.5,
    });
  });

  it('adds a flanger effect with correct default params', () => {
    const state = useProjectStore.getState();
    const trackId = state.project!.tracks[0].id;
    const effectId = state.addTrackEffect(trackId, 'flanger');
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const effect = track.effects!.find((e) => e.id === effectId)!;
    expect(effect.type).toBe('flanger');
    expect(effect.enabled).toBe(true);
    expect(effect.params).toEqual({
      frequency: 0.5,
      delayTime: 3,
      depth: 0.7,
      feedback: 0.5,
      wet: 0.5,
    });
  });

  it('adds a phaser effect with correct default params', () => {
    const state = useProjectStore.getState();
    const trackId = state.project!.tracks[0].id;
    const effectId = state.addTrackEffect(trackId, 'phaser');
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const effect = track.effects!.find((e) => e.id === effectId)!;
    expect(effect.type).toBe('phaser');
    expect(effect.enabled).toBe(true);
    expect(effect.params).toEqual({
      frequency: 0.5,
      octaves: 3,
      stages: 10,
      Q: 10,
      baseFrequency: 350,
      wet: 0.5,
    });
  });

  it('can update chorus effect params', () => {
    const state = useProjectStore.getState();
    const trackId = state.project!.tracks[0].id;
    const effectId = state.addTrackEffect(trackId, 'chorus');
    state.updateTrackEffect(trackId, effectId, {
      params: { frequency: 3, delayTime: 5, depth: 0.9, feedback: 0.2, wet: 0.7 },
    } as Partial<TrackEffect>);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const effect = track.effects!.find((e) => e.id === effectId)!;
    expect(effect.type).toBe('chorus');
    if (effect.type === 'chorus') {
      expect(effect.params.frequency).toBe(3);
      expect(effect.params.wet).toBe(0.7);
    }
  });

  it('can remove a flanger effect', () => {
    const state = useProjectStore.getState();
    const trackId = state.project!.tracks[0].id;
    const effectId = state.addTrackEffect(trackId, 'flanger');
    const before = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!.effects!.length;
    state.removeTrackEffect(trackId, effectId);
    const after = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!.effects!.length;
    expect(after).toBe(before - 1);
  });
});

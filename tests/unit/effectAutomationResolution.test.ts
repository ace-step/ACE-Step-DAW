import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationLane, AutomationParameter, TrackEffect } from '../../src/types/project';
import { automationParamEquals } from '../../src/types/project';
import {
  denormalizeEffectParamValue,
  getEffectAutomationColor,
  getEffectAutomationLabel,
  getEffectAutomationSpec,
  getNormalizedEffectAutomationValue,
  normalizeEffectParamValue,
} from '../../src/utils/effectAutomation';

// ─── Mock audio engine and effects engine for AutomationEngine tests ─────────
const mocks = vi.hoisted(() => ({
  setTrackVolume: vi.fn(),
  setTrackPan: vi.fn(),
  applyAutomationValue: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    setTrackVolume: mocks.setTrackVolume,
    setTrackPan: mocks.setTrackPan,
  }),
}));

vi.mock('../../src/engine/EffectsEngine', () => ({
  effectsEngine: {
    applyAutomationValue: mocks.applyAutomationValue,
  },
}));

import { AutomationEngine } from '../../src/engine/AutomationEngine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEffectLane(
  overrides: Partial<AutomationLane> & {
    effectId?: string;
    effectType?: string;
    param?: string;
  } = {},
): AutomationLane {
  return {
    id: overrides.id ?? 'lane-1',
    trackId: overrides.trackId ?? 'track-1',
    parameter: {
      type: 'effect',
      effectId: overrides.effectId ?? 'fx-1',
      effectType: overrides.effectType ?? 'filter',
      param: overrides.param ?? 'frequency',
    } as AutomationParameter,
    points: overrides.points ?? [
      { time: 0, value: 0 },
      { time: 4, value: 1 },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Effect Automation Resolution', () => {
  beforeEach(() => {
    mocks.setTrackVolume.mockReset();
    mocks.setTrackPan.mockReset();
    mocks.applyAutomationValue.mockReset();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  // ── getValueAtTime interpolation for effect lanes ──────────────────────

  describe('getValueAtTime — effect lane interpolation', () => {
    it('returns first point value when time is before all points', () => {
      const lane = makeEffectLane({ points: [{ time: 1, value: 0.3 }, { time: 3, value: 0.9 }] });
      expect(AutomationEngine.getValueAtTime(lane, 0)).toBe(0.3);
    });

    it('returns last point value when time is after all points', () => {
      const lane = makeEffectLane({ points: [{ time: 0, value: 0.2 }, { time: 2, value: 0.8 }] });
      expect(AutomationEngine.getValueAtTime(lane, 5)).toBe(0.8);
    });

    it('interpolates linearly between two points (midpoint)', () => {
      const lane = makeEffectLane({ points: [{ time: 0, value: 0 }, { time: 4, value: 1 }] });
      expect(AutomationEngine.getValueAtTime(lane, 2)).toBeCloseTo(0.5, 5);
    });

    it('interpolates linearly at 25% position', () => {
      const lane = makeEffectLane({ points: [{ time: 0, value: 0 }, { time: 4, value: 1 }] });
      expect(AutomationEngine.getValueAtTime(lane, 1)).toBeCloseTo(0.25, 5);
    });

    it('handles exact point times', () => {
      const lane = makeEffectLane({
        points: [
          { time: 0, value: 0.1 },
          { time: 2, value: 0.5 },
          { time: 4, value: 0.9 },
        ],
      });
      expect(AutomationEngine.getValueAtTime(lane, 0)).toBe(0.1);
      expect(AutomationEngine.getValueAtTime(lane, 2)).toBe(0.5);
      expect(AutomationEngine.getValueAtTime(lane, 4)).toBe(0.9);
    });

    it('handles multi-segment interpolation', () => {
      const lane = makeEffectLane({
        points: [
          { time: 0, value: 0 },
          { time: 2, value: 1 },
          { time: 4, value: 0 },
        ],
      });
      expect(AutomationEngine.getValueAtTime(lane, 1)).toBeCloseTo(0.5, 5);
      expect(AutomationEngine.getValueAtTime(lane, 3)).toBeCloseTo(0.5, 5);
    });

    it('returns null for empty points', () => {
      const lane = makeEffectLane({ points: [] });
      expect(AutomationEngine.getValueAtTime(lane, 1)).toBeNull();
    });

    it('applies positive curve (ease-out)', () => {
      const lane = makeEffectLane({
        points: [
          { time: 0, value: 0, curve: 1 },
          { time: 4, value: 1 },
        ],
      });
      const mid = AutomationEngine.getValueAtTime(lane, 2)!;
      // Positive curve means slower start — value at midpoint should be less than 0.5
      expect(mid).toBeLessThan(0.5);
      expect(mid).toBeGreaterThan(0);
    });

    it('applies negative curve (ease-in)', () => {
      const lane = makeEffectLane({
        points: [
          { time: 0, value: 0, curve: -1 },
          { time: 4, value: 1 },
        ],
      });
      const mid = AutomationEngine.getValueAtTime(lane, 2)!;
      // Negative curve means faster start — value at midpoint should be more than 0.5
      expect(mid).toBeGreaterThan(0.5);
      expect(mid).toBeLessThan(1);
    });

    it('treats near-zero curve as linear', () => {
      const lane = makeEffectLane({
        points: [
          { time: 0, value: 0, curve: 0.005 },
          { time: 4, value: 1 },
        ],
      });
      expect(AutomationEngine.getValueAtTime(lane, 2)).toBeCloseTo(0.5, 5);
    });
  });

  // ── Engine routing for effect automation ────────────────────────────────

  describe('AutomationEngine — effect routing', () => {
    it('routes filter frequency automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectType: 'filter',
        param: 'frequency',
        points: [{ time: 0, value: 0.2 }, { time: 2, value: 0.8 }],
      });

      engine.start([lane], () => 1);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-1',
        expect.objectContaining({ effectType: 'filter', param: 'frequency' }),
        expect.any(Number),
      );
    });

    it('routes reverb decay automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectId: 'fx-rev',
        effectType: 'reverb',
        param: 'decay',
        points: [{ time: 0, value: 0.3 }, { time: 4, value: 0.7 }],
      });

      engine.start([lane], () => 2);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-rev',
        expect.objectContaining({ effectType: 'reverb', param: 'decay' }),
        expect.any(Number),
      );
    });

    it('routes delay feedback automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectId: 'fx-delay',
        effectType: 'delay',
        param: 'feedback',
        points: [{ time: 0, value: 0.1 }, { time: 3, value: 0.9 }],
      });

      engine.start([lane], () => 1.5);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-delay',
        expect.objectContaining({ effectType: 'delay', param: 'feedback' }),
        expect.any(Number),
      );
    });

    it('routes compressor threshold automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectId: 'fx-comp',
        effectType: 'compressor',
        param: 'threshold',
        points: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
      });

      engine.start([lane], () => 1);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-comp',
        expect.objectContaining({ effectType: 'compressor', param: 'threshold' }),
        0.5,
      );
    });

    it('routes distortion amount automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectId: 'fx-dist',
        effectType: 'distortion',
        param: 'amount',
        points: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
      });

      engine.start([lane], () => 1);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-dist',
        expect.objectContaining({ effectType: 'distortion', param: 'amount' }),
        0.5,
      );
    });

    it('routes EQ3 band gain automation to effectsEngine', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        effectId: 'fx-eq',
        effectType: 'eq3',
        param: 'low',
        points: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
      });

      engine.start([lane], () => 1);

      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-eq',
        expect.objectContaining({ effectType: 'eq3', param: 'low' }),
        0.5,
      );
    });
  });

  // ── Multiple effect lanes coexisting ───────────────────────────────────

  describe('Multiple effect automation lanes per track', () => {
    it('processes multiple effect lanes for the same track in one tick', () => {
      const engine = new AutomationEngine();
      const filterLane = makeEffectLane({
        id: 'lane-filter',
        effectId: 'fx-filter',
        effectType: 'filter',
        param: 'frequency',
        points: [{ time: 0, value: 0 }, { time: 4, value: 1 }],
      });
      const reverbLane = makeEffectLane({
        id: 'lane-reverb',
        effectId: 'fx-reverb',
        effectType: 'reverb',
        param: 'wet',
        points: [{ time: 0, value: 1 }, { time: 4, value: 0 }],
      });

      engine.start([filterLane, reverbLane], () => 2);

      expect(mocks.applyAutomationValue).toHaveBeenCalledTimes(2);
      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-filter',
        expect.objectContaining({ effectType: 'filter', param: 'frequency' }),
        0.5,
      );
      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-reverb',
        expect.objectContaining({ effectType: 'reverb', param: 'wet' }),
        0.5,
      );
    });

    it('processes multiple parameters of the same effect', () => {
      const engine = new AutomationEngine();
      const freqLane = makeEffectLane({
        id: 'lane-freq',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
        points: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
      });
      const resLane = makeEffectLane({
        id: 'lane-res',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'resonance',
        points: [{ time: 0, value: 1 }, { time: 2, value: 0 }],
      });

      engine.start([freqLane, resLane], () => 1);

      expect(mocks.applyAutomationValue).toHaveBeenCalledTimes(2);
      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-1',
        expect.objectContaining({ param: 'frequency' }),
        0.5,
      );
      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-1',
        expect.objectContaining({ param: 'resonance' }),
        0.5,
      );
    });

    it('coexists effect automation with mixer automation', () => {
      const engine = new AutomationEngine();
      const volumeLane: AutomationLane = {
        id: 'lane-vol',
        trackId: 'track-1',
        parameter: { type: 'mixer', param: 'volume' },
        points: [{ time: 0, value: 0.8 }, { time: 4, value: 0.8 }],
      };
      const effectLane = makeEffectLane({
        id: 'lane-fx',
        effectType: 'delay',
        param: 'wet',
        points: [{ time: 0, value: 0 }, { time: 4, value: 1 }],
      });

      engine.start([volumeLane, effectLane], () => 2);

      expect(mocks.setTrackVolume).toHaveBeenCalledWith('track-1', 0.8);
      expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
        'track-1', 'fx-1',
        expect.objectContaining({ effectType: 'delay', param: 'wet' }),
        0.5,
      );
    });
  });

  // ── Change deduplication ───────────────────────────────────────────────

  describe('Change deduplication (< 0.001 delta skip)', () => {
    it('skips effect value update when delta is below threshold', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        points: [{ time: 0, value: 0.5 }, { time: 10, value: 0.5 }],
      });

      engine.start([lane], () => 0);
      expect(mocks.applyAutomationValue).toHaveBeenCalledTimes(1);

      // Simulate next tick with same time — value hasn't changed
      mocks.applyAutomationValue.mockClear();
      // After stop+start, caches are cleared so first apply goes through
      engine.stop();
      engine.start([lane], () => 5);
      expect(mocks.applyAutomationValue).toHaveBeenCalledTimes(1);
    });
  });

  // ── getCurrentValue / hasAutomation helpers ────────────────────────────

  describe('getCurrentValue and hasAutomation for effect lanes', () => {
    it('getCurrentValue returns interpolated effect value', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        points: [{ time: 0, value: 0 }, { time: 4, value: 1 }],
      });
      const param = lane.parameter;

      engine.start([lane], () => 2);

      expect(engine.getCurrentValue('track-1', param)).toBeCloseTo(0.5, 5);
    });

    it('getCurrentValue returns null when engine is not running', () => {
      const engine = new AutomationEngine();
      const param: AutomationParameter = {
        type: 'effect',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
      };

      expect(engine.getCurrentValue('track-1', param)).toBeNull();
    });

    it('hasAutomation returns true for effect lanes with points', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({
        points: [{ time: 0, value: 0.5 }],
      });

      engine.start([lane], () => 0);
      expect(engine.hasAutomation('track-1', lane.parameter)).toBe(true);
    });

    it('hasAutomation returns false for empty effect lane', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane({ points: [] });

      engine.start([lane], () => 0);
      expect(engine.hasAutomation('track-1', lane.parameter)).toBe(false);
    });

    it('hasAutomation returns false for non-existent parameter', () => {
      const engine = new AutomationEngine();
      const lane = makeEffectLane();
      const otherParam: AutomationParameter = {
        type: 'effect',
        effectId: 'fx-other',
        effectType: 'reverb',
        param: 'wet',
      };

      engine.start([lane], () => 0);
      expect(engine.hasAutomation('track-1', otherParam)).toBe(false);
    });
  });

  // ── updateLanes during playback ────────────────────────────────────────

  describe('updateLanes during playback', () => {
    it('reflects new lanes after updateLanes call', () => {
      const engine = new AutomationEngine();
      const lane1 = makeEffectLane({
        effectType: 'filter',
        param: 'frequency',
        points: [{ time: 0, value: 0.5 }],
      });

      engine.start([lane1], () => 0);
      expect(engine.hasAutomation('track-1', lane1.parameter)).toBe(true);

      const lane2 = makeEffectLane({
        id: 'lane-2',
        effectId: 'fx-2',
        effectType: 'reverb',
        param: 'wet',
        points: [{ time: 0, value: 0.3 }],
      });
      engine.updateLanes([lane1, lane2]);
      expect(engine.hasAutomation('track-1', lane2.parameter)).toBe(true);
    });
  });
});

// ─── Normalization / Denormalization for all effect types ────────────────────

describe('Effect parameter normalization', () => {
  const cases: Array<{
    effectType: string;
    param: string;
    min: number;
    max: number;
  }> = [
    { effectType: 'filter', param: 'frequency', min: 20, max: 20000 },
    { effectType: 'filter', param: 'resonance', min: 0, max: 20 },
    { effectType: 'filter', param: 'lfoRate', min: 0.1, max: 20 },
    { effectType: 'filter', param: 'lfoDepth', min: 0, max: 1 },
    { effectType: 'reverb', param: 'decay', min: 0.1, max: 10 },
    { effectType: 'reverb', param: 'preDelay', min: 0, max: 0.1 },
    { effectType: 'reverb', param: 'wet', min: 0, max: 1 },
    { effectType: 'delay', param: 'time', min: 0.01, max: 1 },
    { effectType: 'delay', param: 'feedback', min: 0, max: 0.95 },
    { effectType: 'delay', param: 'wet', min: 0, max: 1 },
    { effectType: 'compressor', param: 'threshold', min: -60, max: 0 },
    { effectType: 'compressor', param: 'ratio', min: 1, max: 20 },
    { effectType: 'compressor', param: 'attack', min: 0.001, max: 0.1 },
    { effectType: 'compressor', param: 'release', min: 0.01, max: 1 },
    { effectType: 'compressor', param: 'knee', min: 0, max: 40 },
    { effectType: 'distortion', param: 'amount', min: 0, max: 1 },
    { effectType: 'distortion', param: 'wet', min: 0, max: 1 },
    { effectType: 'eq3', param: 'low', min: -12, max: 12 },
    { effectType: 'eq3', param: 'mid', min: -12, max: 12 },
    { effectType: 'eq3', param: 'high', min: -12, max: 12 },
    { effectType: 'eq3', param: 'lowFrequency', min: 100, max: 1000 },
    { effectType: 'eq3', param: 'highFrequency', min: 1000, max: 8000 },
    { effectType: 'chorus', param: 'frequency', min: 0.1, max: 10 },
    { effectType: 'chorus', param: 'delayTime', min: 0.5, max: 20 },
    { effectType: 'chorus', param: 'depth', min: 0, max: 1 },
    { effectType: 'chorus', param: 'feedback', min: 0, max: 0.95 },
    { effectType: 'chorus', param: 'wet', min: 0, max: 1 },
    { effectType: 'flanger', param: 'frequency', min: 0.05, max: 5 },
    { effectType: 'flanger', param: 'delayTime', min: 0.5, max: 10 },
    { effectType: 'flanger', param: 'depth', min: 0, max: 1 },
    { effectType: 'flanger', param: 'feedback', min: -0.95, max: 0.95 },
    { effectType: 'flanger', param: 'wet', min: 0, max: 1 },
    { effectType: 'phaser', param: 'frequency', min: 0.1, max: 8 },
    { effectType: 'phaser', param: 'octaves', min: 1, max: 6 },
    { effectType: 'phaser', param: 'Q', min: 0.1, max: 20 },
    { effectType: 'phaser', param: 'baseFrequency', min: 100, max: 4000 },
    { effectType: 'phaser', param: 'wet', min: 0, max: 1 },
  ];

  it.each(cases)(
    'round-trips $effectType.$param through normalize → denormalize',
    ({ effectType, param, min, max }) => {
      const mid = (min + max) / 2;
      const normalized = normalizeEffectParamValue(effectType as any, param, mid);
      expect(normalized).not.toBeNull();
      expect(normalized).toBeGreaterThanOrEqual(0);
      expect(normalized).toBeLessThanOrEqual(1);

      const denormalized = denormalizeEffectParamValue(effectType as any, param, normalized!);
      expect(denormalized).not.toBeNull();
      expect(denormalized).toBeCloseTo(mid, 3);
    },
  );

  it('normalizes 0 to 0 and 1 to 1 for 0-1 range params', () => {
    expect(normalizeEffectParamValue('reverb', 'wet', 0)).toBeCloseTo(0);
    expect(normalizeEffectParamValue('reverb', 'wet', 1)).toBeCloseTo(1);
  });

  it('normalizes min to 0 and max to 1', () => {
    expect(normalizeEffectParamValue('filter', 'frequency', 20)).toBeCloseTo(0);
    expect(normalizeEffectParamValue('filter', 'frequency', 20000)).toBeCloseTo(1);
  });

  it('clamps out-of-range values to 0-1', () => {
    expect(normalizeEffectParamValue('filter', 'frequency', -100)).toBe(0);
    expect(normalizeEffectParamValue('filter', 'frequency', 100000)).toBe(1);
  });

  it('returns null for unsupported parameters', () => {
    expect(normalizeEffectParamValue('parametricEq', 'anything', 5)).toBeNull();
    expect(denormalizeEffectParamValue('parametricEq', 'anything', 0.5)).toBeNull();
  });
});

// ─── Effect automation spec / label / color ──────────────────────────────────

describe('Effect automation metadata', () => {
  it('returns spec for known effect parameters', () => {
    const spec = getEffectAutomationSpec('filter', 'frequency');
    expect(spec).not.toBeNull();
    expect(spec!.label).toBe('Cutoff');
    expect(spec!.min).toBe(20);
    expect(spec!.max).toBe(20000);
  });

  it('returns null spec for unknown parameter', () => {
    expect(getEffectAutomationSpec('filter', 'nonexistent')).toBeNull();
  });

  it('returns label for effect parameter', () => {
    expect(getEffectAutomationLabel('reverb', 'decay')).toBe('Decay');
    expect(getEffectAutomationLabel('delay', 'feedback')).toBe('Feedback');
    expect(getEffectAutomationLabel('compressor', 'threshold')).toBe('Threshold');
  });

  it('returns param name as fallback label for unknown param', () => {
    expect(getEffectAutomationLabel('filter', 'unknown')).toBe('unknown');
  });

  it('returns color for effect automation parameters', () => {
    const filterParam: AutomationParameter = {
      type: 'effect',
      effectId: 'fx-1',
      effectType: 'filter',
      param: 'frequency',
    };
    expect(getEffectAutomationColor(filterParam)).toBe('#06b6d4');
  });

  it('returns color for mixer volume automation', () => {
    expect(getEffectAutomationColor({ type: 'mixer', param: 'volume' })).toBe('#22c55e');
  });

  it('returns color for mixer pan automation', () => {
    expect(getEffectAutomationColor({ type: 'mixer', param: 'pan' })).toBe('#3b82f6');
  });
});

// ─── getNormalizedEffectAutomationValue ───────────────────────────────────────

describe('getNormalizedEffectAutomationValue', () => {
  it('reads normalized value from reverb effect', () => {
    const effect: TrackEffect = {
      id: 'fx-rev',
      type: 'reverb',
      enabled: true,
      params: { decay: 5.05, preDelay: 0.05, wet: 0.5 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'reverb',
      param: 'wet',
    });
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('reads normalized value from compressor effect', () => {
    const effect: TrackEffect = {
      id: 'fx-comp',
      type: 'compressor',
      enabled: true,
      params: { threshold: -30, ratio: 4, attack: 0.01, release: 0.25, knee: 10 },
    };
    const result = getNormalizedEffectAutomationValue(effect, {
      effectType: 'compressor',
      param: 'threshold',
    });
    expect(result).toBeCloseTo(0.5, 5); // -30 is midpoint of [-60, 0]
  });

  it('returns null for mismatched effect type', () => {
    const effect: TrackEffect = {
      id: 'fx-rev',
      type: 'reverb',
      enabled: true,
      params: { decay: 5, preDelay: 0.05, wet: 0.5 },
    };
    expect(getNormalizedEffectAutomationValue(effect, {
      effectType: 'filter',
      param: 'frequency',
    })).toBeNull();
  });

  it('returns null for parametricEq', () => {
    const effect: TrackEffect = {
      id: 'fx-peq',
      type: 'parametricEq',
      enabled: true,
      params: { bands: [] },
    };
    expect(getNormalizedEffectAutomationValue(effect, {
      effectType: 'parametricEq' as any,
      param: 'bands',
    })).toBeNull();
  });
});

// ─── automationParamEquals for effect parameters ─────────────────────────────

describe('automationParamEquals — effect parameter edge cases', () => {
  it('distinguishes same param on different effect types', () => {
    const a: AutomationParameter = {
      type: 'effect', effectId: 'fx-1', effectType: 'chorus', param: 'wet',
    };
    const b: AutomationParameter = {
      type: 'effect', effectId: 'fx-1', effectType: 'reverb', param: 'wet',
    };
    expect(automationParamEquals(a, b)).toBe(false);
  });

  it('distinguishes same effect type + param on different instances', () => {
    const a: AutomationParameter = {
      type: 'effect', effectId: 'fx-1', effectType: 'filter', param: 'frequency',
    };
    const b: AutomationParameter = {
      type: 'effect', effectId: 'fx-2', effectType: 'filter', param: 'frequency',
    };
    expect(automationParamEquals(a, b)).toBe(false);
  });

  it('never matches mixer with effect', () => {
    const mixer: AutomationParameter = { type: 'mixer', param: 'volume' };
    const effect: AutomationParameter = {
      type: 'effect', effectId: 'fx-1', effectType: 'filter', param: 'frequency',
    };
    expect(automationParamEquals(mixer, effect)).toBe(false);
  });
});

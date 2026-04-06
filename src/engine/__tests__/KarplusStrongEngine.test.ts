import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockPluckSynth() {
  return {
    connect: vi.fn(),
    triggerAttack: vi.fn(),
    dispose: vi.fn(),
    attackNoise: 1,
    dampening: 4000,
    resonance: 0.9,
  };
}

function createMockFilter() {
  return {
    connect: vi.fn(),
    dispose: vi.fn(),
    frequency: { value: 1000 },
    Q: { value: 0 },
    type: 'lowpass' as string,
  };
}

function createMockGain() {
  return {
    connect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
    gain: { value: 1 },
  };
}

let lastCreatedPluck: ReturnType<typeof createMockPluckSynth>;
let lastCreatedFilter: ReturnType<typeof createMockFilter>;

vi.mock('tone', () => ({
  PluckSynth: function MockPluckSynth() {
    lastCreatedPluck = createMockPluckSynth();
    return lastCreatedPluck;
  },
  Filter: function MockFilter() {
    lastCreatedFilter = createMockFilter();
    return lastCreatedFilter;
  },
  Gain: function MockGain() {
    return createMockGain();
  },
  Frequency: vi.fn((pitch: number, _type: string) => ({
    toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
  })),
  getContext: vi.fn(() => ({ state: 'running' })),
  start: vi.fn(),
}));

import type { PhysicalModelSettings } from '../../types/project';
import { PHYSICAL_PRESETS } from '../KarplusStrongEngine';

function makeSettings(overrides?: Partial<PhysicalModelSettings>): PhysicalModelSettings {
  return {
    ...PHYSICAL_PRESETS['custom'],
    ...overrides,
  };
}

async function createFreshEngine() {
  const mod = await import('../KarplusStrongEngine');
  mod.karplusStrongEngine.dispose();
  return mod.karplusStrongEngine;
}

describe('KarplusStrongEngine', () => {
  let engine: Awaited<ReturnType<typeof createFreshEngine>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    engine = await createFreshEngine();
  });

  describe('ensureTrack', () => {
    it('creates a new instance for a track', () => {
      const instance = engine.ensureTrack('track-1', makeSettings());
      expect(instance).toBeDefined();
      expect(instance.synths).toHaveLength(1);
      expect(instance.output).toBeDefined();
    });

    it('returns existing instance on second call', () => {
      const first = engine.ensureTrack('track-1', makeSettings());
      const second = engine.ensureTrack('track-1', makeSettings({ damping: 0.8 }));
      expect(second).toBe(first);
      expect(second.settings.damping).toBe(0.8);
    });

    it('creates body filter when bodySize > 0', () => {
      const instance = engine.ensureTrack('track-1', makeSettings({ bodySize: 0.5 }));
      expect(instance.bodyFilter).not.toBeNull();
    });
  });

  describe('presets', () => {
    it('has 6 built-in presets', () => {
      expect(Object.keys(PHYSICAL_PRESETS)).toHaveLength(6);
    });

    it('acoustic-guitar preset uses pluck exciter', () => {
      expect(PHYSICAL_PRESETS['acoustic-guitar'].exciter).toBe('pluck');
    });

    it('kalimba preset uses hammer exciter', () => {
      expect(PHYSICAL_PRESETS['kalimba'].exciter).toBe('hammer');
    });

    it('each preset has valid parameter ranges', () => {
      for (const [name, preset] of Object.entries(PHYSICAL_PRESETS)) {
        expect(preset.damping, `${name} damping`).toBeGreaterThanOrEqual(0);
        expect(preset.damping, `${name} damping`).toBeLessThanOrEqual(1);
        expect(preset.brightness, `${name} brightness`).toBeGreaterThanOrEqual(0);
        expect(preset.brightness, `${name} brightness`).toBeLessThanOrEqual(1);
        expect(preset.pluckPosition, `${name} pluckPosition`).toBeGreaterThanOrEqual(0);
        expect(preset.pluckPosition, `${name} pluckPosition`).toBeLessThanOrEqual(1);
        expect(preset.bodySize, `${name} bodySize`).toBeGreaterThanOrEqual(0);
        expect(preset.bodySize, `${name} bodySize`).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('note triggering', () => {
    it('noteOn triggers the PluckSynth', () => {
      engine.ensureTrack('track-1', makeSettings());
      engine.noteOn('track-1', 60, 100);
      expect(lastCreatedPluck.triggerAttack).toHaveBeenCalled();
    });

    it('triggerAttackRelease triggers the PluckSynth', () => {
      engine.ensureTrack('track-1', makeSettings());
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      expect(lastCreatedPluck.triggerAttack).toHaveBeenCalled();
    });

    it('does nothing for nonexistent track', () => {
      engine.noteOn('nonexistent', 60, 100);
      engine.triggerAttackRelease('nonexistent', 60, 0.5, 0.8);
      // No error thrown
    });
  });

  describe('setParameter', () => {
    it('updates damping', () => {
      const instance = engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'damping', 0.8);
      expect(instance.settings.damping).toBe(0.8);
    });

    it('updates brightness', () => {
      const instance = engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'brightness', 0.9);
      expect(instance.settings.brightness).toBe(0.9);
    });

    it('updates exciter type', () => {
      const instance = engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'exciter', 'bow');
      expect(instance.settings.exciter).toBe('bow');
    });

    it('does nothing for nonexistent track', () => {
      engine.setParameter('nonexistent', 'damping', 0.5);
      // No error
    });
  });

  describe('removeTrack', () => {
    it('disposes and removes the instance', () => {
      engine.ensureTrack('track-1', makeSettings());
      engine.removeTrack('track-1');
      expect(lastCreatedPluck.dispose).toHaveBeenCalled();
    });

    it('does nothing for nonexistent track', () => {
      engine.removeTrack('nonexistent');
      // No error
    });
  });

  describe('dispose', () => {
    it('disposes all instances', () => {
      engine.ensureTrack('track-1', makeSettings());
      const pluck1 = lastCreatedPluck;
      engine.ensureTrack('track-2', makeSettings());
      const pluck2 = lastCreatedPluck;

      engine.dispose();
      expect(pluck1.dispose).toHaveBeenCalled();
      expect(pluck2.dispose).toHaveBeenCalled();
    });
  });
});

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

function createMockGain(initialValue = 1) {
  return {
    connect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
    gain: {
      value: initialValue,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
  };
}

let allCreatedPlucks: ReturnType<typeof createMockPluckSynth>[] = [];
let lastCreatedPluck: ReturnType<typeof createMockPluckSynth>;
let lastCreatedFilter: ReturnType<typeof createMockFilter>;

vi.mock('tone', () => ({
  PluckSynth: function MockPluckSynth() {
    lastCreatedPluck = createMockPluckSynth();
    allCreatedPlucks.push(lastCreatedPluck);
    return lastCreatedPluck;
  },
  Filter: function MockFilter() {
    lastCreatedFilter = createMockFilter();
    return lastCreatedFilter;
  },
  Gain: function MockGain(val?: number) {
    return createMockGain(typeof val === 'number' ? val : 1);
  },
  Frequency: vi.fn((pitch: number, _type: string) => ({
    toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
  })),
  getContext: vi.fn(() => ({ state: 'running' })),
  start: vi.fn(),
  now: vi.fn(() => 0),
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
    allCreatedPlucks = [];
    engine = await createFreshEngine();
  });

  describe('ensureTrack', () => {
    it('creates a new instance for a track', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      expect(instance).toBeDefined();
      expect(instance.synths).toHaveLength(8); // VOICE_COUNT polyphonic voices
      expect(instance.output).toBeDefined();
    });

    it('returns existing instance on second call', async () => {
      const first = await engine.ensureTrack('track-1', makeSettings());
      const second = await engine.ensureTrack('track-1', makeSettings({ damping: 0.8 }));
      expect(second).toBe(first);
      expect(second.settings.damping).toBe(0.8);
    });

    it('always creates body filter and wet gain', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings({ bodySize: 0 }));
      expect(instance.bodyFilter).toBeDefined();
      expect(instance.bodyWetGain).toBeDefined();
    });

    it('body wet gain reflects bodySize', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings({ bodySize: 0.5 }));
      expect(instance.bodyWetGain.gain.value).toBe(0.5);
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
    it('noteOn triggers a PluckSynth voice', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      engine.noteOn('track-1', 60, 100);
      // At least one voice should have triggerAttack called
      const triggered = allCreatedPlucks.some((p) => p.triggerAttack.mock.calls.length > 0);
      expect(triggered).toBe(true);
    });

    it('triggerAttackRelease triggers a PluckSynth voice', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      const triggered = allCreatedPlucks.some((p) => p.triggerAttack.mock.calls.length > 0);
      expect(triggered).toBe(true);
    });

    it('round-robins voices for polyphony', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      engine.noteOn('track-1', 60, 100);
      engine.noteOn('track-1', 64, 100);
      engine.noteOn('track-1', 67, 100);
      // 3 different voices should be triggered
      const triggeredCount = allCreatedPlucks.filter((p) => p.triggerAttack.mock.calls.length > 0).length;
      expect(triggeredCount).toBeGreaterThanOrEqual(3);
    });

    it('does nothing for nonexistent track on triggerAttackRelease', () => {
      engine.triggerAttackRelease('nonexistent', 60, 0.5, 0.8);
      // No error thrown
    });
  });

  describe('setParameter', () => {
    it('updates damping', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'damping', 0.8);
      expect(instance.settings.damping).toBe(0.8);
    });

    it('updates brightness', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'brightness', 0.9);
      expect(instance.settings.brightness).toBe(0.9);
    });

    it('updates exciter type', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'exciter', 'bow');
      expect(instance.settings.exciter).toBe('bow');
    });

    it('updates pluckPosition', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'pluckPosition', 0.7);
      expect(instance.settings.pluckPosition).toBe(0.7);
    });

    it('updates outputGain and persists to settings', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.setParameter('track-1', 'outputGain', -10);
      expect(instance.settings.outputGain).toBe(-10);
    });

    it('updates bodySize dynamically (even from 0)', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings({ bodySize: 0 }));
      engine.setParameter('track-1', 'bodySize', 0.6);
      expect(instance.settings.bodySize).toBe(0.6);
      expect(instance.bodyWetGain.gain.value).toBe(0.6);
    });

    it('does nothing for nonexistent track', () => {
      engine.setParameter('nonexistent', 'damping', 0.5);
      // No error
    });
  });

  describe('removeTrack', () => {
    it('disposes and removes the instance', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      const plucks = [...allCreatedPlucks];
      engine.removeTrack('track-1');
      for (const p of plucks) {
        expect(p.dispose).toHaveBeenCalled();
      }
    });

    it('does nothing for nonexistent track', () => {
      engine.removeTrack('nonexistent');
      // No error
    });
  });

  describe('dispose', () => {
    it('disposes all instances', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      const plucks1 = [...allCreatedPlucks];
      await engine.ensureTrack('track-2', makeSettings());

      engine.dispose();
      // All voices from track-1 should be disposed
      for (const p of plucks1) {
        expect(p.dispose).toHaveBeenCalled();
      }
    });
  });
});

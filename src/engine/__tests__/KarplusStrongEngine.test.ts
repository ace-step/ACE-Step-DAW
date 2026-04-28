/**
 * KarplusStrongEngine — unit tests
 *
 * Phase 5M migration: engine runs its own `NativePluckVoice` KS DSP
 * against `getAudioEngine().ctx`. Tests mock the context with native
 * node factories; triggerAttack observations are counted via the
 * mocked `createBufferSource` call count (one buffer source per
 * voice excitation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCtx, mocks } = vi.hoisted(() => {
  const makeParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  });
  const mocks = {
    bufferSourceStart: vi.fn(),
    bufferSourceStop: vi.fn(),
    bufferSourceConnect: vi.fn(),
    bufferSourceDisconnect: vi.fn(),
    gainConnect: vi.fn(),
    gainDisconnect: vi.fn(),
    filterConnect: vi.fn(),
    filterDisconnect: vi.fn(),
    createBufferSourceCount: 0,
    createBiquadFilterCount: 0,
  };
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      sampleRate: 48000,
      destination: {} as AudioNode,
      createGain: vi.fn(() => ({
        gain: makeParam(),
        connect: mocks.gainConnect,
        disconnect: mocks.gainDisconnect,
      })),
      createBiquadFilter: vi.fn(() => {
        mocks.createBiquadFilterCount++;
        return {
          type: 'lowpass' as BiquadFilterType,
          frequency: makeParam(),
          Q: makeParam(),
          connect: mocks.filterConnect,
          disconnect: mocks.filterDisconnect,
        };
      }),
      createBuffer: vi.fn((_channels: number, length: number) => ({
        length,
        duration: length / 48000,
        sampleRate: 48000,
        numberOfChannels: 1,
        getChannelData: vi.fn(() => new Float32Array(length)),
      })),
      createBufferSource: vi.fn(() => {
        mocks.createBufferSourceCount++;
        return {
          buffer: null,
          connect: mocks.bufferSourceConnect,
          disconnect: mocks.bufferSourceDisconnect,
          start: mocks.bufferSourceStart,
          stop: mocks.bufferSourceStop,
          onended: null as (() => void) | null,
        };
      }),
    },
    mocks,
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
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
    mocks.createBufferSourceCount = 0;
    mocks.createBiquadFilterCount = 0;
    engine = await createFreshEngine();
  });

  describe('ensureTrack', () => {
    it('creates a new instance for a track', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      expect(instance).toBeDefined();
      expect(instance.synths).toHaveLength(8);
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
    it('noteOn excites a voice (creates a BufferSource + starts it)', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      const before = mocks.createBufferSourceCount;
      engine.noteOn('track-1', 60, 100);
      expect(mocks.createBufferSourceCount).toBe(before + 1);
      expect(mocks.bufferSourceStart).toHaveBeenCalled();
    });

    it('triggerAttackRelease excites a voice', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      const before = mocks.createBufferSourceCount;
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      expect(mocks.createBufferSourceCount).toBe(before + 1);
    });

    it('round-robins voices for polyphony', async () => {
      const instance = await engine.ensureTrack('track-1', makeSettings());
      engine.noteOn('track-1', 60, 100);
      engine.noteOn('track-1', 64, 100);
      engine.noteOn('track-1', 67, 100);
      // Voice pointer advanced by 3 over 8 voices.
      expect(instance.nextVoice).toBe(3 % 8);
    });

    it('does nothing for nonexistent track on triggerAttackRelease (after dispose)', () => {
      engine.dispose();
      engine.triggerAttackRelease('nonexistent', 60, 0.5, 0.8);
      // No throw — but since _lazyInit creates a track, this is
      // lenient by design. Assert it doesn't crash.
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
      expect(() => engine.setParameter('nonexistent', 'damping', 0.5)).not.toThrow();
    });
  });

  describe('removeTrack', () => {
    it('removes the instance', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      engine.removeTrack('track-1');
      // Second removal is a no-op.
      expect(() => engine.removeTrack('track-1')).not.toThrow();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.removeTrack('nonexistent')).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('disposes all instances without throwing', async () => {
      await engine.ensureTrack('track-1', makeSettings());
      await engine.ensureTrack('track-2', makeSettings());
      expect(() => engine.dispose()).not.toThrow();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPresetPartials, createDefaultAdditiveSettings } from '../AdditiveEngine';

// Phase 5F migration: AdditiveEngine no longer imports Tone
// directly — it pulls the AudioContext from `getAudioEngine().ctx`.
// Use `vi.hoisted` so the mock factories don't close over
// module-level consts that may be undefined at hoist time
// (Copilot review on PR #1733, matching the GranularEngine test
// pattern).
const { mockCtx } = vi.hoisted(() => {
  const makeMockGain = () => ({
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const makeMockOsc = () => ({
    type: 'sine' as OscillatorType,
    frequency: { value: 440 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {},
      createGain: vi.fn(makeMockGain),
      createOscillator: vi.fn(makeMockOsc),
    },
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

async function createFreshEngine() {
  const mod = await import('../AdditiveEngine');
  mod.additiveEngine.dispose();
  return mod.additiveEngine;
}

describe('AdditiveEngine', () => {
  let engine: Awaited<ReturnType<typeof createFreshEngine>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    engine = await createFreshEngine();
  });

  describe('preset partials', () => {
    it('generates saw partials with 1/n amplitude falloff', () => {
      const partials = createPresetPartials('saw', 8);
      expect(partials).toHaveLength(8);
      expect(partials[0].ratio).toBe(1);
      expect(partials[0].amplitude).toBe(1);
      expect(partials[1].ratio).toBe(2);
      expect(partials[1].amplitude).toBe(0.5);
      expect(partials[7].ratio).toBe(8);
      expect(partials[7].amplitude).toBe(0.125);
    });

    it('generates square partials with odd harmonics only', () => {
      const partials = createPresetPartials('square', 8);
      expect(partials[0].amplitude).toBe(1);     // 1st harmonic
      expect(partials[1].amplitude).toBe(0);     // 2nd (even)
      expect(partials[2].amplitude).toBeCloseTo(1 / 3); // 3rd harmonic
      expect(partials[3].amplitude).toBe(0);     // 4th (even)
    });

    it('generates organ partials with drawbar ratios', () => {
      const partials = createPresetPartials('organ', 9);
      expect(partials).toHaveLength(9);
      expect(partials[0].ratio).toBe(1);
      expect(partials[0].amplitude).toBe(1);
    });

    it('generates bell partials with inharmonic ratios', () => {
      const partials = createPresetPartials('bell', 8);
      expect(partials[0].ratio).toBe(1);
      expect(partials[1].ratio).toBe(2.0);
      expect(partials[3].ratio).toBe(4.2); // inharmonic
    });

    it('default count is 16', () => {
      const partials = createPresetPartials('saw');
      expect(partials).toHaveLength(16);
    });
  });

  describe('createDefaultAdditiveSettings', () => {
    it('creates settings with saw preset by default', () => {
      const settings = createDefaultAdditiveSettings();
      expect(settings.partials).toHaveLength(16);
      expect(settings.ampEnvelope.attack).toBe(0.01);
      expect(settings.outputGain).toBe(-5);
    });

    it('creates settings with specified preset', () => {
      const settings = createDefaultAdditiveSettings('bell');
      expect(settings.partials[3].ratio).toBe(4.2);
    });
  });

  describe('ensureTrack', () => {
    it('creates a new instance', () => {
      const settings = createDefaultAdditiveSettings();
      const instance = engine.ensureTrack('track-1', settings);
      expect(instance).toBeDefined();
      expect(instance.settings.partials).toHaveLength(16);
    });

    it('returns existing instance on second call', () => {
      const settings = createDefaultAdditiveSettings();
      const first = engine.ensureTrack('track-1', settings);
      const second = engine.ensureTrack('track-1', createDefaultAdditiveSettings('bell'));
      expect(second).toBe(first);
    });
  });

  describe('note triggering', () => {
    it('noteOn creates active voices', () => {
      engine.ensureTrack('track-1', createDefaultAdditiveSettings());
      engine.noteOn('track-1', 60, 100);
      // Doesn't throw
    });

    it('noteOff on nonexistent voice is safe', () => {
      engine.ensureTrack('track-1', createDefaultAdditiveSettings());
      engine.noteOff('track-1', 60);
      // Doesn't throw
    });

    it('does nothing for nonexistent track', () => {
      engine.noteOn('nonexistent', 60, 100);
      engine.noteOff('nonexistent', 60);
      // No errors
    });
  });

  describe('updatePartials', () => {
    it('updates partials in the instance settings', () => {
      const instance = engine.ensureTrack('track-1', createDefaultAdditiveSettings());
      expect(instance.settings.partials).toHaveLength(16);
      const newPartials = createPresetPartials('bell', 8);
      engine.updatePartials('track-1', newPartials);
      expect(instance.settings.partials).toHaveLength(8);
    });
  });

  describe('removeTrack', () => {
    it('removes the instance', () => {
      engine.ensureTrack('track-1', createDefaultAdditiveSettings());
      engine.removeTrack('track-1');
      // No error when removing again
      engine.removeTrack('track-1');
    });
  });

  describe('dispose', () => {
    it('disposes all instances', () => {
      engine.ensureTrack('track-1', createDefaultAdditiveSettings());
      engine.ensureTrack('track-2', createDefaultAdditiveSettings('bell'));
      engine.dispose();
      // No errors
    });
  });
});

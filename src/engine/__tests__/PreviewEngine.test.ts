/**
 * PreviewEngine — unit tests
 *
 * Tests the sound preview / audition system for browsing instrument presets.
 *
 * Phase 5G migration: PreviewEngine no longer depends on Tone.js. We mock
 * `getAudioEngine()` to hand out a minimal AudioContext with the factory
 * methods NativeSynths touches; the engine itself runs real code paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so the mock factory doesn't close over a module-level
// const that's undefined at hoist time (same pattern as the
// AdditiveEngine / GranularEngine tests).
const { mockCtx } = vi.hoisted(() => {
  const makeAudioParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const makeGain = () => ({
    gain: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const makeOsc = () => ({
    type: 'sine' as OscillatorType,
    frequency: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  });
  const makeFilter = () => ({
    type: 'lowpass' as BiquadFilterType,
    frequency: makeAudioParam(),
    Q: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      sampleRate: 48000,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createBiquadFilter: vi.fn(makeFilter),
    },
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  PreviewEngine,
  type PreviewPattern,
  PREVIEW_PATTERNS,
  getPatternForCategory,
  getTransposeSemitones,
} from '../PreviewEngine';

describe('PreviewEngine', () => {
  let engine: PreviewEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PreviewEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('lifecycle', () => {
    it('initializes in stopped state', () => {
      expect(engine.isPlaying).toBe(false);
    });

    it('disposes cleanly without errors', () => {
      expect(() => engine.dispose()).not.toThrow();
    });

    it('can dispose multiple times safely', () => {
      engine.dispose();
      expect(() => engine.dispose()).not.toThrow();
    });
  });

  describe('volume control', () => {
    it('starts with default volume of 0.3', () => {
      expect(engine.volume).toBe(0.3);
    });

    it('sets volume between 0 and 1', () => {
      engine.setVolume(0.7);
      expect(engine.volume).toBe(0.7);
    });

    it('clamps volume to [0, 1]', () => {
      engine.setVolume(-0.5);
      expect(engine.volume).toBe(0);
      engine.setVolume(1.5);
      expect(engine.volume).toBe(1);
    });
  });

  describe('stop', () => {
    it('stops preview and sets isPlaying to false', () => {
      engine.stop();
      expect(engine.isPlaying).toBe(false);
    });
  });

  describe('preview patterns', () => {
    it('has patterns for all standard categories', () => {
      const categories = ['Bass', 'Lead', 'Pad', 'Pluck', 'FX', 'Keys', 'Bell', 'Wavetable'];
      for (const cat of categories) {
        const pattern = getPatternForCategory(cat);
        expect(pattern).toBeDefined();
        expect(pattern.notes.length).toBeGreaterThan(0);
      }
    });

    it('returns default pattern for unknown category', () => {
      const pattern = getPatternForCategory('Unknown');
      expect(pattern).toBeDefined();
      expect(pattern.notes.length).toBeGreaterThan(0);
    });

    it('each pattern has valid MIDI note values (0-127)', () => {
      for (const [, pattern] of Object.entries(PREVIEW_PATTERNS)) {
        for (const note of pattern.notes) {
          expect(note.pitch).toBeGreaterThanOrEqual(0);
          expect(note.pitch).toBeLessThanOrEqual(127);
          expect(note.velocity).toBeGreaterThanOrEqual(1);
          expect(note.velocity).toBeLessThanOrEqual(127);
          expect(note.duration).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('playPresetPreview', () => {
    it('starts playing and sets isPlaying to true', async () => {
      await engine.playPresetPreview('subtractive', 'Bass', 120);
      expect(engine.isPlaying).toBe(true);
    });

    it('stops any existing preview before starting new one', async () => {
      await engine.playPresetPreview('subtractive', 'Bass', 120);
      const stopSpy = vi.spyOn(engine, 'stop');
      await engine.playPresetPreview('subtractive', 'Lead', 120);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('schedules note timers scaled by BPM', async () => {
      // Spy on setTimeout so we can verify BPM actually feeds the
      // schedule instead of just asserting `isPlaying`. The Bass
      // pattern's 2nd note is at startBeat=1, so its scheduled
      // delay is exactly `60/bpm * 1000` ms — a clean witness
      // that BPM propagated to the pattern scheduler.
      const spy = vi.spyOn(globalThis, 'setTimeout');

      await engine.playPresetPreview('subtractive', 'Bass', 120);
      const delay120 = spy.mock.calls[1]?.[1] as number;
      spy.mockClear();

      await engine.playPresetPreview('subtractive', 'Bass', 60);
      const delay60 = spy.mock.calls[1]?.[1] as number;
      spy.mockRestore();

      expect(delay120).toBe(500); // 60 / 120 * 1000
      expect(delay60).toBe(1000); // 60 /  60 * 1000
    });

    it('creates an FMSynth path for fm preset', async () => {
      // The FM path exercises NativeFMSynth — just assert no throw and
      // that the engine reached the playing state.
      await engine.playPresetPreview('fm', 'Lead', 120);
      expect(engine.isPlaying).toBe(true);
    });

    it('creates a poly synth path for physical preset (pluck fallback)', async () => {
      await engine.playPresetPreview('physical', 'Pluck', 120);
      expect(engine.isPlaying).toBe(true);
    });
  });
});

describe('getTransposeSemitones', () => {
  it('returns 0 for C major', () => {
    expect(getTransposeSemitones('C major')).toBe(0);
  });

  it('returns correct semitones for sharp keys', () => {
    expect(getTransposeSemitones('D major')).toBe(2);
    expect(getTransposeSemitones('F# minor')).toBe(6);
    expect(getTransposeSemitones('A minor')).toBe(9);
  });

  it('returns correct semitones for flat keys', () => {
    expect(getTransposeSemitones('Bb major')).toBe(10);
    expect(getTransposeSemitones('Eb minor')).toBe(3);
  });

  it('returns 0 for invalid key', () => {
    expect(getTransposeSemitones('')).toBe(0);
    expect(getTransposeSemitones('invalid')).toBe(0);
  });
});

describe('PreviewPattern', () => {
  it('has expected structure', () => {
    const pattern: PreviewPattern = {
      name: 'test',
      notes: [
        { pitch: 60, velocity: 100, duration: 0.5, startBeat: 0 },
        { pitch: 64, velocity: 100, duration: 0.5, startBeat: 1 },
      ],
    };
    expect(pattern.notes).toHaveLength(2);
    expect(pattern.notes[0].pitch).toBe(60);
  });
});

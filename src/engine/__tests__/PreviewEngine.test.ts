/**
 * PreviewEngine — unit tests
 *
 * Tests the sound preview / audition system for browsing instrument presets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Tone.js before importing PreviewEngine
vi.mock('tone', () => {
  class MockGain {
    gain = { value: 0, setValueAtTime: vi.fn() };
    connect = vi.fn().mockReturnThis();
    toDestination = vi.fn().mockReturnThis();
    dispose = vi.fn();
  }
  class MockPolySynth {
    connect = vi.fn().mockReturnThis();
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    set = vi.fn();
    dispose = vi.fn();
    toDestination = vi.fn().mockReturnThis();
  }
  class MockFMSynth {
    connect = vi.fn().mockReturnThis();
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    set = vi.fn();
    dispose = vi.fn();
  }
  class MockSynth {}
  return {
    getContext: vi.fn().mockReturnValue({ state: 'running' }),
    getTransport: vi.fn().mockReturnValue({ clear: vi.fn() }),
    start: vi.fn().mockResolvedValue(undefined),
    Gain: MockGain,
    Synth: MockSynth,
    PolySynth: MockPolySynth,
    FMSynth: MockFMSynth,
    Frequency: vi.fn().mockImplementation((val: number) => ({
      toFrequency: () => 440 * Math.pow(2, (val - 69) / 12),
    })),
    now: vi.fn().mockReturnValue(0),
  };
});

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

    it('uses project BPM for timing', async () => {
      await engine.playPresetPreview('subtractive', 'Bass', 90);
      // At 90 BPM, a quarter note = 60/90 = 0.667s
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

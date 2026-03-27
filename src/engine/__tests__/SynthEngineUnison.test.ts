import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js before importing SynthEngine
const mockConnect = vi.fn().mockReturnThis();
const mockToDestination = vi.fn().mockReturnThis();
const mockDispose = vi.fn();
const mockReleaseAll = vi.fn();
const mockTriggerAttackRelease = vi.fn();
const mockSet = vi.fn();

vi.mock('tone', () => {
  class MockPolySynth {
    connect = mockConnect;
    toDestination = mockToDestination;
    dispose = mockDispose;
    releaseAll = mockReleaseAll;
    triggerAttackRelease = mockTriggerAttackRelease;
    set = mockSet;
  }
  class MockGain {
    connect = mockConnect;
    toDestination = mockToDestination;
    dispose = mockDispose;
    gain = { value: 1 };
  }
  class MockPanner {
    connect = mockConnect;
    toDestination = mockToDestination;
    dispose = mockDispose;
    pan = { value: 0 };
  }
  return {
    PolySynth: MockPolySynth,
    Synth: class {},
    Gain: MockGain,
    Panner: MockPanner,
    Frequency: (val: number, type: string) => ({
      toFrequency: () => val * 10,
    }),
    getContext: () => ({ state: 'running' }),
    start: vi.fn(),
  };
});

import { synthEngine } from '../SynthEngine';
import type { UnisonSettings } from '../../types/project';

describe('SynthEngine unison voice stacking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synthEngine.dispose();
  });

  it('creates a single synth voice when unison voices is 1', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 1, detune: 0, spread: 0 });
    // With 1 voice, no extra unison voices should be created
    const voices = synthEngine.getUnisonVoices('track1');
    expect(voices).toHaveLength(0); // 0 extra voices, main synth is the only one
  });

  it('creates additional synth voices when unison > 1', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 4, detune: 25, spread: 0.8 });
    const voices = synthEngine.getUnisonVoices('track1');
    // 4 voices total means 3 extra unison voices (main + 3)
    expect(voices).toHaveLength(3);
  });

  it('disposes old unison voices when reapplying', () => {
    synthEngine.ensureTrackSynth('track1', 'pad');
    synthEngine.applyUnison('track1', { voices: 4, detune: 25, spread: 0.5 });
    const firstVoices = synthEngine.getUnisonVoices('track1');
    expect(firstVoices).toHaveLength(3);

    // Reapply with fewer voices
    synthEngine.applyUnison('track1', { voices: 2, detune: 10, spread: 0.3 });
    const secondVoices = synthEngine.getUnisonVoices('track1');
    expect(secondVoices).toHaveLength(1);
  });

  it('cleans up unison voices when track synth is removed', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 3, detune: 20, spread: 0.5 });
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(2);

    synthEngine.removeTrackSynth('track1');
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(0);
  });

  it('does nothing when applying unison to non-existent track', () => {
    synthEngine.applyUnison('nonexistent', { voices: 4, detune: 25, spread: 0.5 });
    expect(synthEngine.getUnisonVoices('nonexistent')).toHaveLength(0);
  });

  it('removes all unison voices when set back to 1', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 8, detune: 50, spread: 1 });
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(7);

    synthEngine.applyUnison('track1', { voices: 1, detune: 0, spread: 0 });
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(0);
  });
});

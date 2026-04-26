/**
 * SynthEngine unison voice stacking — unit tests
 *
 * Phase 5L migration: voices and main synth are NativeBasicPolySynth
 * instances over `getAudioEngine().ctx`. We mock the context with a
 * minimal node factory so the engine code runs unmodified; tests
 * observe the voice-allocation bookkeeping via `getUnisonVoices`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCtx } = vi.hoisted(() => {
  const makeParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  });
  const makeGain = () => ({ gain: makeParam(), connect: vi.fn(), disconnect: vi.fn() });
  const makeOsc = () => ({
    type: 'sine' as OscillatorType,
    frequency: makeParam(),
    detune: makeParam(),
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null as (() => void) | null,
  });
  const makePanner = () => ({ pan: makeParam(), connect: vi.fn(), disconnect: vi.fn() });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createBiquadFilter: vi.fn(),
      createStereoPanner: vi.fn(makePanner),
      createConstantSource: vi.fn(() => ({
        offset: makeParam(),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    },
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { synthEngine } from '../SynthEngine';

describe('SynthEngine unison voice stacking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synthEngine.dispose();
  });

  it('creates no extra voices when unison voices = 1', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 1, detune: 0, spread: 0 });
    const voices = synthEngine.getUnisonVoices('track1');
    expect(voices).toHaveLength(0);
  });

  it('creates N-1 extra voices when unison voices > 1', () => {
    synthEngine.ensureTrackSynth('track1', 'lead');
    synthEngine.applyUnison('track1', { voices: 4, detune: 25, spread: 0.8 });
    const voices = synthEngine.getUnisonVoices('track1');
    expect(voices).toHaveLength(3);
  });

  it('disposes old unison voices when reapplying', () => {
    synthEngine.ensureTrackSynth('track1', 'pad');
    synthEngine.applyUnison('track1', { voices: 4, detune: 25, spread: 0.5 });
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(3);

    synthEngine.applyUnison('track1', { voices: 2, detune: 10, spread: 0.3 });
    expect(synthEngine.getUnisonVoices('track1')).toHaveLength(1);
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

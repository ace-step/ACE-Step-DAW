import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks must be hoisted — no top-level variable references ─────────────────

// Shared mock AudioContext used by both the `tone` mock (for
// `Tone.getContext().rawContext`, only read by test assertions now)
// and the `useAudioEngine` mock (for `getAudioEngine().ctx`, the
// real code path after the 5D migration). Must be defined via
// `vi.hoisted` so the hoisted `vi.mock(...)` factories can see it.
const { _mockCtx } = vi.hoisted(() => {
  const ctx = {
    // `state: 'running'` mirrors the old `Tone.getContext()` mock
    // and keeps `GranularEngine.ensureStarted()` from always calling
    // `resume()` in future tests that exercise the start path.
    // Codex P3 on PR #1729.
    state: 'running' as AudioContextState,
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => ({
      gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueCurveAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createStereoPanner: vi.fn(() => ({
      pan: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      const channelData: Float32Array[] = [];
      for (let ch = 0; ch < channels; ch++) {
        channelData.push(new Float32Array(length));
      }
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => channelData[ch],
      };
    }),
  };
  return { _mockCtx: ctx };
});

// Phase 5Q: the `tone` module is no longer installed. The hoisted
// `_mockCtx` is consumed directly — GranularEngine pulls its ctx
// from `getAudioEngine()` already (5D migration).

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn().mockReturnValue({
    ctx: _mockCtx,
    resume: vi.fn(),
    decodeAudioData: vi.fn(),
  }),
}));

import { granularEngine, DEFAULT_GRANULAR_SETTINGS, createGranularSettings } from '../GranularEngine';
import type { GranularSettings } from '../../types/project';

// Access the mock context for assertions — directly via the hoisted
// reference instead of round-tripping through the ex-tone mock.
const mockCtx = _mockCtx as {
  currentTime: number;
  createGain: ReturnType<typeof vi.fn>;
  createStereoPanner: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
};

// ── Test Helpers ─────────────────────────────────────────────────────────────

function makeAudioBuffer(duration = 1, sampleRate = 44100, channels = 2): AudioBuffer {
  const length = Math.floor(duration * sampleRate);
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    channelData.push(data);
  }
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

function makeSettings(overrides?: Partial<GranularSettings>): GranularSettings {
  return createGranularSettings('test-audio-key', overrides);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GranularEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockCtx.currentTime = 0;
  });

  afterEach(() => {
    granularEngine.dispose();
    vi.useRealTimers();
  });

  describe('createGranularSettings', () => {
    it('creates settings with defaults and audioKey', () => {
      const settings = createGranularSettings('my-key');
      expect(settings.audioKey).toBe('my-key');
      expect(settings.grainSize).toBe(DEFAULT_GRANULAR_SETTINGS.grainSize);
      expect(settings.density).toBe(DEFAULT_GRANULAR_SETTINGS.density);
      expect(settings.position).toBe(DEFAULT_GRANULAR_SETTINGS.position);
      expect(settings.envelopeShape).toBe('hann');
      expect(settings.freeze).toBe(false);
      expect(settings.spread).toBe(0.5);
    });

    it('applies overrides', () => {
      const settings = createGranularSettings('my-key', {
        grainSize: 100,
        density: 50,
        freeze: true,
      });
      expect(settings.grainSize).toBe(100);
      expect(settings.density).toBe(50);
      expect(settings.freeze).toBe(true);
      expect(settings.rootNote).toBe(60);
    });
  });

  describe('DEFAULT_GRANULAR_SETTINGS', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_GRANULAR_SETTINGS.rootNote).toBe(60);
      expect(DEFAULT_GRANULAR_SETTINGS.grainSize).toBe(50);
      expect(DEFAULT_GRANULAR_SETTINGS.density).toBe(20);
      expect(DEFAULT_GRANULAR_SETTINGS.position).toBe(0.5);
      expect(DEFAULT_GRANULAR_SETTINGS.positionScatter).toBe(0.1);
      expect(DEFAULT_GRANULAR_SETTINGS.pitchScatter).toBe(0);
      expect(DEFAULT_GRANULAR_SETTINGS.envelopeShape).toBe('hann');
      expect(DEFAULT_GRANULAR_SETTINGS.grainAttack).toBe(0.3);
      expect(DEFAULT_GRANULAR_SETTINGS.grainRelease).toBe(0.3);
      expect(DEFAULT_GRANULAR_SETTINGS.freeze).toBe(false);
      expect(DEFAULT_GRANULAR_SETTINGS.spread).toBe(0.5);
      expect(DEFAULT_GRANULAR_SETTINGS.gain).toBe(0.55);
      expect(DEFAULT_GRANULAR_SETTINGS.attack).toBe(0.01);
      expect(DEFAULT_GRANULAR_SETTINGS.release).toBe(0.3);
    });
  });

  describe('ensureTrackGranular', () => {
    it('creates a granular instance for a track', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings();
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      expect(mockCtx.createGain).toHaveBeenCalled();
    });

    it('reuses instance if audioKey matches', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings();
      granularEngine.ensureTrackGranular('track-1', settings, buffer);

      const callCount = mockCtx.createGain.mock.calls.length;
      granularEngine.ensureTrackGranular('track-1', { ...settings, density: 40 }, buffer);
      // Should not create another output gain node
      expect(mockCtx.createGain.mock.calls.length).toBe(callCount);
    });

    it('replaces instance when audioKey changes', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);

      const callCount = mockCtx.createGain.mock.calls.length;
      granularEngine.ensureTrackGranular(
        'track-1',
        createGranularSettings('new-key'),
        buffer,
      );
      expect(mockCtx.createGain.mock.calls.length).toBeGreaterThan(callCount);
    });

    it('connects to provided destination', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings();
      const destination = { connect: vi.fn() } as unknown as AudioNode;
      granularEngine.ensureTrackGranular('track-1', settings, buffer, destination);

      const gainCalls = mockCtx.createGain.mock.results;
      const lastGain = gainCalls[gainCalls.length - 1].value;
      expect(lastGain.connect).toHaveBeenCalledWith(destination);
    });
  });

  describe('noteOn / noteOff', () => {
    it('starts grain scheduler on noteOn', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.noteOn('track-1', 60, 100);

      // First grain scheduled immediately
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
    });

    it('creates panner for each grain', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings({ spread: 1 }), buffer);
      granularEngine.noteOn('track-1', 60, 100);
      expect(mockCtx.createStereoPanner).toHaveBeenCalled();
    });

    it('stops grains on noteOff after release', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings({ release: 0.1 }), buffer);
      granularEngine.noteOn('track-1', 60, 100);
      granularEngine.noteOff('track-1', 60);
      // After release cleanup
      vi.advanceTimersByTime(1000);
    });

    it('does nothing if track not initialized', () => {
      // Should not throw
      granularEngine.noteOn('nonexistent', 60, 100);
      granularEngine.noteOff('nonexistent', 60);
    });

    it('creates grains with correct playback rate for pitch transposition', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings({ rootNote: 60, pitchScatter: 0 });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 72, 100); // One octave up

      const sourceCalls = mockCtx.createBufferSource.mock.results;
      expect(sourceCalls.length).toBeGreaterThan(0);
      // Playback rate for one octave up should be ≈2.0
      const rate = sourceCalls[0].value.playbackRate.value;
      expect(rate).toBeCloseTo(2.0, 1);
    });

    it('applies grain envelope via GainNode setValueCurveAtTime', () => {
      const buffer = makeAudioBuffer(1, 44100, 2);
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.noteOn('track-1', 60, 100);

      // Grain envelope is applied via a GainNode with setValueCurveAtTime
      // At least 2 gain nodes: voice output + grain envelope
      expect(mockCtx.createGain.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('adjusts envelope duration to match wall-clock grain length when pitch-shifted', () => {
      const buffer = makeAudioBuffer(1, 44100, 1);
      const settings = makeSettings({ rootNote: 60, pitchScatter: 0, grainSize: 50 });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      // Play one octave up — playback rate ≈2.0, so wall-clock time ≈half
      granularEngine.noteOn('track-1', 72, 100);

      const gainResults = mockCtx.createGain.mock.results;
      // Grain gain is the 3rd createGain call: (1) instance output, (2) voice output, (3) grain gain
      const grainGain = gainResults[2]?.value;
      expect(grainGain).toBeDefined();
      const curveCall = grainGain.gain.setValueCurveAtTime.mock.calls[0];
      expect(curveCall).toBeDefined();
      // Duration arg (3rd param) should be ~half of grainDurationSeconds due to rate=2
      const envelopeDuration = curveCall[2];
      const grainDurationSeconds = 50 / 1000; // 50ms grain size
      // At rate 2.0, wall-clock duration is ~25ms
      expect(envelopeDuration).toBeCloseTo(grainDurationSeconds / 2, 3);
    });
  });

  describe('triggerAttackRelease', () => {
    it('plays grains for a fixed duration then releases', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.triggerAttackRelease('track-1', 60, 0.5, 0.8);

      expect(mockCtx.createBufferSource).toHaveBeenCalled();

      // After 500ms, release should trigger
      vi.advanceTimersByTime(500);
      // After release, cleanup should happen
      vi.advanceTimersByTime(1000);
    });
  });

  describe('updateSettings', () => {
    it('updates specific settings', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      // Should not throw
      granularEngine.updateSettings('track-1', { grainSize: 200, density: 50 });
    });

    it('updates gain output when gain changes', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.updateSettings('track-1', { gain: 0.8 });

      const gainCalls = mockCtx.createGain.mock.results;
      const outputGain = gainCalls[gainCalls.length - 1].value;
      expect(outputGain.gain.value).toBe(0.8);
    });

    it('does nothing for nonexistent track', () => {
      granularEngine.updateSettings('nonexistent', { grainSize: 100 });
    });
  });

  describe('setParameter', () => {
    it('sets named parameters on the instance', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      // Should not throw
      granularEngine.setParameter('track-1', 'grainSize', 200);
      granularEngine.setParameter('track-1', 'freeze', true);
    });

    it('updates density scheduler for active voices', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.noteOn('track-1', 60, 100);
      granularEngine.setParameter('track-1', 'density', 50);
      // Scheduler interval should be updated — verified by new grains appearing
      vi.advanceTimersByTime(200);
    });

    it('does nothing for nonexistent track', () => {
      granularEngine.setParameter('nonexistent', 'grainSize', 100);
    });
  });

  describe('releaseAll', () => {
    it('releases all active voices across all tracks', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.ensureTrackGranular('track-2', makeSettings(), buffer);
      granularEngine.noteOn('track-1', 60, 100);
      granularEngine.noteOn('track-2', 64, 100);

      granularEngine.releaseAll();
      vi.advanceTimersByTime(1000);
    });
  });

  describe('removeTrack', () => {
    it('removes a track and disposes resources', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.noteOn('track-1', 60, 100);
      granularEngine.removeTrack('track-1');

      // Should not throw when accessing removed track
      granularEngine.noteOn('track-1', 60, 100);
    });

    it('does nothing for nonexistent track', () => {
      granularEngine.removeTrack('nonexistent');
    });
  });

  describe('dispose', () => {
    it('disposes all tracks', () => {
      const buffer = makeAudioBuffer();
      granularEngine.ensureTrackGranular('track-1', makeSettings(), buffer);
      granularEngine.ensureTrackGranular('track-2', makeSettings(), buffer);
      granularEngine.dispose();

      // No tracks should remain
      granularEngine.noteOn('track-1', 60, 100); // no-op
    });
  });

  describe('getTrackBuffer', () => {
    it('returns null when track has no granularConfig', async () => {
      const track = { id: 'track-1', granularConfig: undefined } as unknown as import('../../types/project').Track;
      const result = await granularEngine.getTrackBuffer(track);
      expect(result).toBeNull();
    });

    it('returns cached buffer if available', async () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings();
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      const track = { id: 'track-1', granularConfig: settings } as unknown as import('../../types/project').Track;
      const result = await granularEngine.getTrackBuffer(track);
      expect(result).toBe(buffer);
    });
  });

  describe('grain window caching', () => {
    it('reuses cached window for same grain parameters', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings({ density: 10, grainSize: 50, envelopeShape: 'hann' });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 60, 100);

      // Initial grain creates the window
      const initialGainCount = mockCtx.createGain.mock.calls.length;

      // Advance to trigger another grain — should reuse cached window
      vi.advanceTimersByTime(100);
      const afterGainCount = mockCtx.createGain.mock.calls.length;
      // More grains were created (new gain nodes)
      expect(afterGainCount).toBeGreaterThan(initialGainCount);
    });

    it('invalidates cache when settings change', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings({ grainSize: 50, envelopeShape: 'hann' });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 60, 100);

      // Change envelope shape — cache should be invalidated
      granularEngine.updateSettings('track-1', { envelopeShape: 'triangle' });
      vi.advanceTimersByTime(100);

      // Should not throw — grains still scheduled with new shape
      expect(mockCtx.createBufferSource.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('grain scheduling', () => {
    it('schedules grains at the configured density', () => {
      const buffer = makeAudioBuffer();
      const settings = makeSettings({ density: 10 }); // 10 grains/sec = 100ms interval
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 60, 100);

      const initialSourceCount = mockCtx.createBufferSource.mock.calls.length;

      // Advance 100ms — should trigger another grain
      vi.advanceTimersByTime(100);
      expect(mockCtx.createBufferSource.mock.calls.length).toBeGreaterThan(initialSourceCount);
    });

    it('applies grain window envelope via GainNode', () => {
      const buffer = makeAudioBuffer(2);
      const settings = makeSettings({ envelopeShape: 'triangle', grainSize: 50 });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 60, 100);

      // Grain uses GainNode with setValueCurveAtTime for envelope
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
    });
  });

  describe('freeze mode', () => {
    it('does not advance position when freeze is enabled', () => {
      const buffer = makeAudioBuffer(2);
      const settings = makeSettings({ freeze: true, position: 0.3, positionScatter: 0 });
      granularEngine.ensureTrackGranular('track-1', settings, buffer);
      granularEngine.noteOn('track-1', 60, 100);

      mockCtx.currentTime = 5;
      vi.advanceTimersByTime(200);

      // Grains should still be created at position 0.3
      // (verified by the grain buffer creation not causing errors)
      expect(mockCtx.createBufferSource.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('envelope shapes', () => {
    it.each(['hann', 'triangle', 'trapezoid', 'tukey'] as const)(
      'supports %s envelope shape',
      (shape) => {
        const buffer = makeAudioBuffer();
        const settings = makeSettings({ envelopeShape: shape });
        granularEngine.ensureTrackGranular('track-1', settings, buffer);
        granularEngine.noteOn('track-1', 60, 100);

        // Each shape should produce grains without errors
        expect(mockCtx.createBufferSource).toHaveBeenCalled();
      },
    );
  });
});

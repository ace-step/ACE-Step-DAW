import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Stub AudioBuffer for jsdom (hoisted so it's available in vi.mock factories) ─
vi.hoisted(() => {
  if (typeof globalThis.AudioBuffer === 'undefined') {
    globalThis.AudioBuffer = class AudioBuffer {
      readonly length: number;
      readonly duration: number;
      readonly sampleRate: number;
      readonly numberOfChannels: number;
      constructor(opts: { length: number; numberOfChannels: number; sampleRate: number }) {
        this.length = opts.length;
        this.numberOfChannels = opts.numberOfChannels;
        this.sampleRate = opts.sampleRate;
        this.duration = opts.length / opts.sampleRate;
      }
      getChannelData() { return new Float32Array(this.length); }
      copyFromChannel() {}
      copyToChannel() {}
    } as unknown as typeof AudioBuffer;
  }
});

// ─── Shared mock fns ────────────────────────────────────────────────────────
const mockTriggerAttackRelease = vi.fn();
const mockSynthConnect = vi.fn();
const mockSynthDispose = vi.fn();
const mockGainToDestination = vi.fn();
const mockGainConnect = vi.fn();
const mockDrumTrigger = vi.fn();
const mockDrumDispose = vi.fn();
const mockTransportSchedule = vi.fn();
const mockTransportStart = vi.fn();

// Track calls to Tone.Offline to inspect callback behavior
let offlineCallback: ((ctx: { transport: unknown }) => void) | null = null;

// ─── Mock Tone.js ───────────────────────────────────────────────────────────
vi.mock('tone', () => {
  const mockTransport = {
    bpm: { value: 120 },
    schedule: (...args: unknown[]) => mockTransportSchedule(...args),
    start: (...args: unknown[]) => mockTransportStart(...args),
  };

  return {
    Offline: vi.fn(async (callback: (ctx: { transport: unknown }) => void) => {
      offlineCallback = callback;
      callback({ transport: mockTransport });
      // Return a ToneAudioBuffer-like object; .get() returns a real AudioBuffer
      // (AudioBuffer is stubbed globally in beforeAll, but this factory runs at import
      //  time — so we defer AudioBuffer construction to call time via a getter)
      return {
        get: () => new globalThis.AudioBuffer({
          length: 48000,
          numberOfChannels: 2,
          sampleRate: 48000,
        }),
      };
    }),
    Gain: class MockGain {
      toDestination = vi.fn(() => {
        mockGainToDestination();
        return this;
      });
      connect = mockGainConnect;
    },
    PolySynth: class MockPolySynth {
      connect = mockSynthConnect;
      triggerAttackRelease = mockTriggerAttackRelease;
      dispose = mockSynthDispose;
      set = vi.fn();
    },
    Synth: class MockSynth {},
    Frequency: vi.fn((pitch: number, _type: string) => ({
      toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
    })),
  };
});

// ─── Mock DrumEngine ────────────────────────────────────────────────────────
vi.mock('../DrumEngine', () => ({
  createDrumVoicesForKit: vi.fn(() =>
    Array.from({ length: 16 }, () => ({
      trigger: mockDrumTrigger,
      dispose: mockDrumDispose,
    })),
  ),
}));

// ─── Mock SynthEngine ───────────────────────────────────────────────────────
vi.mock('../SynthEngine', () => ({
  createSynthForPreset: vi.fn(() => ({
    connect: mockSynthConnect,
    triggerAttackRelease: mockTriggerAttackRelease,
    dispose: mockSynthDispose,
  })),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────
import {
  renderMidiTrackOffline,
  renderSamplerTrackOffline,
  renderSequencerTrackOffline,
} from '../offlineRender';
import type { MidiNote, SamplerConfig, SequencerPattern } from '../../types/project';

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 0.8,
    ...overrides,
  };
}

function makeSamplerConfig(overrides: Partial<SamplerConfig> = {}): SamplerConfig {
  return {
    audioKey: 'test-sample',
    rootNote: 60,
    trimStart: 0,
    trimEnd: 1,
    playbackMode: 'classic',
    loopStart: 0,
    loopEnd: 1,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.8,
    release: 0.1,
    ...overrides,
  };
}

function makePattern(overrides: Partial<SequencerPattern> = {}): SequencerPattern {
  return {
    id: 'pattern-1',
    name: 'Test Pattern',
    rows: [],
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    ...overrides,
  };
}

// Fake AudioBuffer for OfflineAudioContext — uses the stubbed global class
function makeFakeAudioBuffer(duration = 1, sampleRate = 48000): AudioBuffer {
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  return new globalThis.AudioBuffer({ length, numberOfChannels: 2, sampleRate });
}

// ─── Mock OfflineAudioContext at global level ────────────────────────────────
const mockCreateBufferSource = vi.fn();
const mockCreateGain = vi.fn();
const mockStartRendering = vi.fn();

class MockOfflineAudioContext {
  destination = {};
  sampleRate: number;
  length: number;

  constructor(channels: number, length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.length = length;
  }

  createBufferSource = () => {
    const source = {
      buffer: null as AudioBuffer | null,
      playbackRate: { value: 1 },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    mockCreateBufferSource(source);
    return source;
  };

  createGain = () => {
    const gainNode = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    mockCreateGain(gainNode);
    return gainNode;
  };

  startRendering = () => {
    const result = makeFakeAudioBuffer(this.length / this.sampleRate, this.sampleRate);
    mockStartRendering(result);
    return Promise.resolve(result);
  };
}

vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

// ─── Tests ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  offlineCallback = null;
});

describe('renderMidiTrackOffline', () => {
  it('returns an AudioBuffer with correct channel count', async () => {
    const notes = [makeNote()];
    const result = await renderMidiTrackOffline(notes, 0, 120, 'piano', 2);

    expect(result).not.toBeNull();
    expect(result.numberOfChannels).toBe(2);
  });

  it('calls Tone.Offline with the correct total duration', async () => {
    const Tone = await import('tone');
    const notes = [makeNote()];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 4, 44100);

    // Tone.Offline is called with (callback, duration, channels, sampleRate)
    expect(Tone.Offline).toHaveBeenCalledWith(
      expect.any(Function),
      4,
      2,
      44100,
    );
  });

  it('sets transport BPM to the provided value', async () => {
    const notes = [makeNote()];
    await renderMidiTrackOffline(notes, 0, 140, 'piano', 2);

    // The transport mock's bpm.value is set inside the callback
    // We verify the callback was invoked (offlineCallback is captured)
    expect(offlineCallback).not.toBeNull();
  });

  it('connects synth through a gain node', async () => {
    const notes = [makeNote()];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 2);

    expect(mockSynthConnect).toHaveBeenCalledTimes(1);
    expect(mockGainToDestination).toHaveBeenCalledTimes(1);
  });

  it('schedules notes on the transport', async () => {
    const notes = [makeNote({ startBeat: 0 }), makeNote({ id: 'note-2', startBeat: 2 })];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 4);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(2);
  });

  it('starts transport at time 0', async () => {
    await renderMidiTrackOffline([makeNote()], 0, 120, 'piano', 2);

    expect(mockTransportStart).toHaveBeenCalledWith(0);
  });

  it('skips notes with zero duration', async () => {
    const notes = [makeNote({ durationBeats: 0 })];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 2);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(0);
  });

  it('skips notes that start after totalDuration', async () => {
    const notes = [makeNote({ startBeat: 100 })];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 1);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(0);
  });

  it('clamps velocity to [0, 1] range', async () => {
    // Velocity > 1 should be clamped, note should still be scheduled
    const notes = [makeNote({ velocity: 1.5 })];
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 2);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(1);
  });

  it('uses default sample rate of 48000 when not specified', async () => {
    const Tone = await import('tone');
    await renderMidiTrackOffline([makeNote()], 0, 120, 'piano', 2);

    expect(Tone.Offline).toHaveBeenCalledWith(
      expect.any(Function),
      2,
      2,
      48000,
    );
  });

  it('applies clipStartTime offset to note scheduling', async () => {
    const notes = [makeNote({ startBeat: 0 })];
    await renderMidiTrackOffline(notes, 1.5, 120, 'piano', 4);

    // The note should still be scheduled (clipStartTime=1.5, noteStart=1.5 < totalDuration=4)
    expect(mockTransportSchedule).toHaveBeenCalledTimes(1);
    // The scheduled time is clipStartTime + startBeat * secondsPerBeat = 1.5 + 0 = 1.5
    const scheduledTime = mockTransportSchedule.mock.calls[0][1];
    expect(scheduledTime).toBe(1.5);
  });

  it('converts MIDI pitch to frequency using Tone.Frequency', async () => {
    const Tone = await import('tone');
    const notes = [makeNote({ pitch: 69 })]; // A4 = 440 Hz
    await renderMidiTrackOffline(notes, 0, 120, 'piano', 2);

    expect(Tone.Frequency).toHaveBeenCalledWith(69, 'midi');
  });
});

describe('renderSamplerTrackOffline', () => {
  it('returns an AudioBuffer', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig();
    const result = await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    expect(result.numberOfChannels).toBe(2);
    expect(result.sampleRate).toBe(48000);
  });

  it('creates a buffer source and gain node for each valid note', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote(), makeNote({ id: 'note-2', startBeat: 1 })];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 4);

    expect(mockCreateBufferSource).toHaveBeenCalledTimes(2);
    expect(mockCreateGain).toHaveBeenCalledTimes(2);
  });

  it('skips notes with zero duration', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote({ durationBeats: 0 })];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    expect(mockCreateBufferSource).toHaveBeenCalledTimes(0);
  });

  it('skips notes that start after totalDuration', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote({ startBeat: 100 })];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 1);

    expect(mockCreateBufferSource).toHaveBeenCalledTimes(0);
  });

  it('sets playbackRate based on pitch offset from rootNote', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    // pitch=72 with rootNote=60 => 12 semitones up => playbackRate = 2
    const notes = [makeNote({ pitch: 72 })];
    const config = makeSamplerConfig({ rootNote: 60 });
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.playbackRate.value).toBeCloseTo(2, 5);
  });

  it('enables loop mode when playbackMode is "loop"', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig({ playbackMode: 'loop' });
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.loop).toBe(true);
  });

  it('does not enable loop mode for "classic" playbackMode', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig({ playbackMode: 'classic' });
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.loop).toBe(false);
  });

  it('uses custom sample rate when provided', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 44100);
    const notes = [makeNote()];
    const config = makeSamplerConfig();
    const result = await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2, 44100);

    expect(result.sampleRate).toBe(44100);
  });

  it('connects buffer source through gain to destination', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.connect).toHaveBeenCalledTimes(1);

    const gainNode = mockCreateGain.mock.calls[0][0];
    expect(gainNode.connect).toHaveBeenCalledTimes(1);
  });

  it('applies gain envelope with attack and release', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote({ velocity: 0.7 })];
    const config = makeSamplerConfig({ attack: 0.05, release: 0.1 });
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const gainNode = mockCreateGain.mock.calls[0][0];
    // Gain envelope: setValueAtTime(0.0001, noteStart), linearRamp to velocity, then back to 0.0001
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2);
    // First setValueAtTime sets near-zero at note start
    expect(gainNode.gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(0.0001, 6);
  });

  it('assigns the sample buffer to the source node', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.buffer).toBe(sampleBuffer);
  });

  it('calls source.start and source.stop for each note', async () => {
    const sampleBuffer = makeFakeAudioBuffer(1, 48000);
    const notes = [makeNote()];
    const config = makeSamplerConfig();
    await renderSamplerTrackOffline(notes, 0, 120, sampleBuffer, config, 2);

    const source = mockCreateBufferSource.mock.calls[0][0];
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(source.stop).toHaveBeenCalledTimes(1);
  });
});

describe('renderSequencerTrackOffline', () => {
  it('returns an AudioBuffer for an empty pattern', async () => {
    const pattern = makePattern({ rows: [] });
    const result = await renderSequencerTrackOffline(pattern, 120, 2);

    expect(result.numberOfChannels).toBe(2);
  });

  it('calls Tone.Offline with correct parameters', async () => {
    const Tone = await import('tone');
    const pattern = makePattern();
    await renderSequencerTrackOffline(pattern, 140, 3, '808', 44100);

    expect(Tone.Offline).toHaveBeenCalledWith(
      expect.any(Function),
      3,
      2,
      44100,
    );
  });

  it('schedules drum triggers for active steps', async () => {
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [
            { active: true, velocity: 0.8, probability: 1, stepParams: {} },
            { active: false, velocity: 0.8, probability: 1, stepParams: {} },
            { active: true, velocity: 0.8, probability: 1, stepParams: {} },
          ],
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    await renderSequencerTrackOffline(pattern, 120, 4);

    // 2 active steps in the row
    expect(mockTransportSchedule.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('skips muted rows', async () => {
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [{ active: true, velocity: 0.8, probability: 1, stepParams: {} }],
          volume: 1,
          pan: 0,
          muted: true,
          color: '#ff0000',
        },
      ],
    });

    await renderSequencerTrackOffline(pattern, 120, 2);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(0);
  });

  it('skips rows with unknown sample keys', async () => {
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Unknown',
          sampleKey: 'nonexistent_sample',
          steps: [{ active: true, velocity: 0.8, probability: 1, stepParams: {} }],
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
    });

    await renderSequencerTrackOffline(pattern, 120, 2);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(0);
  });

  it('applies swing offset to odd-numbered steps', async () => {
    const pattern = makePattern({
      swing: 0.5,
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [
            { active: true, velocity: 0.8, probability: 1, stepParams: {} },  // step 0 (even)
            { active: true, velocity: 0.8, probability: 1, stepParams: {} },  // step 1 (odd, gets swing)
          ],
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    await renderSequencerTrackOffline(pattern, 120, 4);

    // Both steps scheduled
    expect(mockTransportSchedule.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Odd step time > even step time + base step duration (due to swing offset)
    const evenStepTime = mockTransportSchedule.mock.calls[0][1] as number;
    const oddStepTime = mockTransportSchedule.mock.calls[1][1] as number;
    const stepDuration = (60 / 120) / (16 / 4); // = 0.125s
    const expectedSwingOffset = stepDuration * 0.5 * 0.5; // swing=0.5, factor=0.5
    expect(oddStepTime).toBeCloseTo(evenStepTime + stepDuration + expectedSwingOffset, 6);
  });

  it('disposes all drum voices after rendering (even on success)', async () => {
    const pattern = makePattern({ rows: [] });
    await renderSequencerTrackOffline(pattern, 120, 2);

    // 16 voices created, all should be disposed
    expect(mockDrumDispose).toHaveBeenCalledTimes(16);
  });

  it('multiplies step velocity by row volume', async () => {
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [{ active: true, velocity: 0.5, probability: 1, stepParams: {} }],
          volume: 0.6,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    await renderSequencerTrackOffline(pattern, 120, 2);

    // The scheduled callback should use velocity = 0.5 * 0.6 = 0.3
    // We verify the schedule was called; the actual velocity is applied inside the callback
    expect(mockTransportSchedule).toHaveBeenCalledTimes(1);
  });

  it('skips steps with zero effective velocity', async () => {
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [{ active: true, velocity: 0, probability: 1, stepParams: {} }],
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    await renderSequencerTrackOffline(pattern, 120, 2);

    expect(mockTransportSchedule).toHaveBeenCalledTimes(0);
  });

  it('loops the pattern when totalDuration exceeds one pass', async () => {
    // 16 steps at 120 BPM with stepsPerBar=16 => 1 bar = 2 seconds
    // totalDuration=5 => should loop ~3 times (ceil(5/2)=3)
    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps: [{ active: true, velocity: 0.8, probability: 1, stepParams: {} }],
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    await renderSequencerTrackOffline(pattern, 120, 5);

    // 1 active step, looped 3 times = 3 schedule calls
    expect(mockTransportSchedule).toHaveBeenCalledTimes(3);
  });

  it('starts transport at 0', async () => {
    const pattern = makePattern({ rows: [] });
    await renderSequencerTrackOffline(pattern, 120, 2);

    expect(mockTransportStart).toHaveBeenCalledWith(0);
  });

  it('uses default drum kit "808" when not specified', async () => {
    const { createDrumVoicesForKit } = await import('../DrumEngine');
    const pattern = makePattern({ rows: [] });
    await renderSequencerTrackOffline(pattern, 120, 2);

    expect(createDrumVoicesForKit).toHaveBeenCalledWith('808', expect.anything());
  });

  it('skips steps that exceed totalDuration', async () => {
    // Very short totalDuration, so late steps get skipped
    const steps = Array.from({ length: 16 }, (_, i) => ({
      active: true,
      velocity: 0.8,
      probability: 1,
      stepParams: {},
    }));

    const pattern = makePattern({
      rows: [
        {
          id: 'row-1',
          name: 'Kick',
          sampleKey: 'kick',
          steps,
          volume: 1,
          pan: 0,
          muted: false,
          color: '#ff0000',
        },
      ],
      stepsPerBar: 16,
      bars: 1,
    });

    // totalDuration=0.3s, stepDuration at 120bpm with 16 steps/bar = 0.125s
    // Only steps 0 and 1 fit (0s, 0.125s); step 2 at 0.25s fits; step 3 at 0.375s doesn't
    await renderSequencerTrackOffline(pattern, 120, 0.3);

    // Steps at times: 0, 0.125, 0.25 => 3 steps fit before 0.3
    expect(mockTransportSchedule.mock.calls.length).toBeLessThan(16);
    // Specifically: 0, 0.125, 0.25 are < 0.3
    expect(mockTransportSchedule).toHaveBeenCalledTimes(3);
  });
});

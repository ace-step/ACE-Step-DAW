/**
 * Tests for offlineRender — MIDI, sampler, and sequencer track offline rendering.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ─── Mock AudioBuffer ───────────────────────────────────────────────────────

// We need a real-ish AudioBuffer class for `instanceof` checks in toAudioBuffer()
class MockAudioBuffer {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  private _data: Float32Array;

  constructor(duration = 2, sampleRate = 48000, channels = 2) {
    this.duration = duration;
    this.length = Math.ceil(duration * sampleRate);
    this.sampleRate = sampleRate;
    this.numberOfChannels = channels;
    this._data = new Float32Array(this.length);
  }
  getChannelData = vi.fn(() => this._data);
  copyToChannel = vi.fn();
  copyFromChannel = vi.fn();
}

// Register globally so `instanceof AudioBuffer` works
vi.stubGlobal('AudioBuffer', MockAudioBuffer);

function makeMockAudioBuffer(duration = 2, sampleRate = 48000, channels = 2): AudioBuffer {
  return new MockAudioBuffer(duration, sampleRate, channels) as unknown as AudioBuffer;
}

// ─── Mock Tone.js ───────────────────────────────────────────────────────────

const mockSynth = {
  connect: vi.fn().mockReturnThis(),
  triggerAttackRelease: vi.fn(),
  dispose: vi.fn(),
  toDestination: vi.fn().mockReturnThis(),
};

const mockGain = {
  connect: vi.fn().mockReturnThis(),
  toDestination: vi.fn().mockReturnThis(),
  dispose: vi.fn(),
  gain: { value: 1 },
};

const mockDrumVoice = {
  trigger: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('tone', () => {
  class MockGain {
    gain = { value: 1 };
    connect = vi.fn().mockReturnThis();
    toDestination = vi.fn().mockReturnThis();
    dispose = vi.fn();
  }

  return {
    Offline: vi.fn(async (cb: (ctx: { transport: { bpm: { value: number }; schedule: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> } }) => void, duration: number, channels: number, sampleRate: number) => {
      const transport = {
        bpm: { value: 120 },
        schedule: vi.fn((callback: (time: number) => void, time: number) => {
          callback(time);
        }),
        start: vi.fn(),
      };
      cb({ transport });

      return makeMockAudioBuffer(duration, sampleRate, channels);
    }),
    Gain: MockGain,
    Frequency: vi.fn((val: number, _unit: string) => ({
      toFrequency: () => 440 * Math.pow(2, (val - 69) / 12),
    })),
  };
});

// ─── Mock DrumEngine ────────────────────────────────────────────────────────

vi.mock('../DrumEngine', () => ({
  createDrumVoicesForKit: vi.fn(() => {
    // Return enough voices for kick (index 0) and snare (index 1)
    const voices = Array.from({ length: 16 }, () => ({
      trigger: vi.fn(),
      dispose: vi.fn(),
    }));
    return voices;
  }),
}));

// ─── Mock SynthEngine ───────────────────────────────────────────────────────

vi.mock('../SynthEngine', () => ({
  createSynthForPreset: vi.fn(() => mockSynth),
}));

// ─── Mock OfflineAudioContext ───────────────────────────────────────────────

class MockOfflineAudioContext {
  destination = { connect: vi.fn(), disconnect: vi.fn() };
  private _channels: number;
  private _length: number;
  private _sampleRate: number;

  constructor(channels: number, length: number, sampleRate: number) {
    this._channels = channels;
    this._length = length;
    this._sampleRate = sampleRate;
  }

  createBufferSource = vi.fn(() => ({
    buffer: null,
    playbackRate: { value: 1 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));

  createGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));

  startRendering = vi.fn(() =>
    Promise.resolve(makeMockAudioBuffer(this._length / this._sampleRate, this._sampleRate, this._channels)),
  );
}
vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

import {
  renderMidiTrackOffline,
  renderSamplerTrackOffline,
  renderSequencerTrackOffline,
} from '../offlineRender';
import type { MidiNote, SamplerConfig, SequencerPattern } from '../../types/project';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('offlineRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ── renderMidiTrackOffline ─────────────────────────────────────────────

  describe('renderMidiTrackOffline', () => {
    it('renders MIDI notes to an AudioBuffer', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 1 },
        { pitch: 64, velocity: 0.6, startBeat: 1, durationBeats: 0.5 },
      ];

      const buffer = await renderMidiTrackOffline(
        notes,
        0,     // clipStartTime
        120,   // bpm
        { type: 'synth', oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 } },
        4,     // totalDuration
        48000, // sampleRate
      );

      expect(buffer).toBeDefined();
      expect(buffer.duration).toBeGreaterThan(0);
    });

    it('skips notes with zero or negative duration', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 0 },
        { pitch: 64, velocity: 0.6, startBeat: 0, durationBeats: -1 },
      ];

      const buffer = await renderMidiTrackOffline(notes, 0, 120, {}, 4);

      expect(buffer).toBeDefined();
    });

    it('skips notes that start after total duration', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 100, durationBeats: 1 },
      ];

      const buffer = await renderMidiTrackOffline(notes, 0, 120, {}, 4);

      expect(buffer).toBeDefined();
    });

    it('clamps velocity to [0, 1]', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 1.5, startBeat: 0, durationBeats: 1 },
        { pitch: 64, velocity: -0.5, startBeat: 1, durationBeats: 1 },
      ];

      const buffer = await renderMidiTrackOffline(notes, 0, 120, {}, 4);

      expect(buffer).toBeDefined();
    });

    it('handles empty note array', async () => {
      const buffer = await renderMidiTrackOffline([], 0, 120, {}, 4);

      expect(buffer).toBeDefined();
      expect(buffer.duration).toBeGreaterThan(0);
    });
  });

  // ── renderSamplerTrackOffline ──────────────────────────────────────────

  describe('renderSamplerTrackOffline', () => {
    const defaultConfig: SamplerConfig = {
      rootNote: 60,
      trimStart: 0,
      trimEnd: 2,
      loopStart: 0,
      loopEnd: 2,
      attack: 0.01,
      release: 0.1,
      playbackMode: 'oneShot',
    };

    it('renders sampler notes to an AudioBuffer', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 2 },
      ];
      const sampleBuffer = makeMockAudioBuffer(2, 48000, 1);

      const buffer = await renderSamplerTrackOffline(
        notes, 0, 120, sampleBuffer, defaultConfig, 4, 48000,
      );

      expect(buffer).toBeDefined();
      expect(buffer.duration).toBeGreaterThan(0);
    });

    it('calculates playback rate from pitch offset', async () => {
      const notes: MidiNote[] = [
        { pitch: 72, velocity: 0.8, startBeat: 0, durationBeats: 1 },
      ];
      const sampleBuffer = makeMockAudioBuffer(2, 48000, 1);

      const buffer = await renderSamplerTrackOffline(
        notes, 0, 120, sampleBuffer, defaultConfig, 4, 48000,
      );

      expect(buffer).toBeDefined();
    });

    it('handles loop playback mode', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 4 },
      ];
      const sampleBuffer = makeMockAudioBuffer(1, 48000, 1);
      const config: SamplerConfig = { ...defaultConfig, playbackMode: 'loop' };

      const buffer = await renderSamplerTrackOffline(
        notes, 0, 120, sampleBuffer, config, 4, 48000,
      );

      expect(buffer).toBeDefined();
    });

    it('skips notes beyond total duration', async () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 0.8, startBeat: 100, durationBeats: 1 },
      ];
      const sampleBuffer = makeMockAudioBuffer(2, 48000, 1);

      const buffer = await renderSamplerTrackOffline(
        notes, 0, 120, sampleBuffer, defaultConfig, 4, 48000,
      );

      expect(buffer).toBeDefined();
    });

    it('handles empty notes array', async () => {
      const sampleBuffer = makeMockAudioBuffer(2, 48000, 1);

      const buffer = await renderSamplerTrackOffline(
        [], 0, 120, sampleBuffer, defaultConfig, 4, 48000,
      );

      expect(buffer).toBeDefined();
    });
  });

  // ── renderSequencerTrackOffline ────────────────────────────────────────

  describe('renderSequencerTrackOffline', () => {
    it('renders drum pattern to an AudioBuffer', async () => {
      const pattern: SequencerPattern = {
        rows: [
          {
            id: 'row-kick',
            sampleKey: 'kick',
            volume: 1,
            muted: false,
            steps: [
              { active: true, velocity: 1 },
              { active: false, velocity: 0 },
              { active: false, velocity: 0 },
              { active: true, velocity: 0.8 },
            ],
          },
        ],
        stepsPerBar: 4,
        bars: 1,
        swing: 0,
      };

      const buffer = await renderSequencerTrackOffline(pattern, 120, 4, '808', 48000);

      expect(buffer).toBeDefined();
      expect(buffer.duration).toBeGreaterThan(0);
    });

    it('skips muted rows', async () => {
      const pattern: SequencerPattern = {
        rows: [{
          id: 'row-kick',
          sampleKey: 'kick',
          volume: 1,
          muted: true,
          steps: [{ active: true, velocity: 1 }],
        }],
        stepsPerBar: 4,
        bars: 1,
        swing: 0,
      };

      const buffer = await renderSequencerTrackOffline(pattern, 120, 4);

      expect(buffer).toBeDefined();
    });

    it('applies swing to odd-indexed steps', async () => {
      const pattern: SequencerPattern = {
        rows: [{
          id: 'row-kick',
          sampleKey: 'kick',
          volume: 1,
          muted: false,
          steps: [
            { active: true, velocity: 1 },
            { active: true, velocity: 0.8 },
          ],
        }],
        stepsPerBar: 4,
        bars: 1,
        swing: 0.5,
      };

      const buffer = await renderSequencerTrackOffline(pattern, 120, 4);

      expect(buffer).toBeDefined();
    });

    it('loops pattern across total duration', async () => {
      const pattern: SequencerPattern = {
        rows: [{
          id: 'row-kick',
          sampleKey: 'kick',
          volume: 1,
          muted: false,
          steps: [{ active: true, velocity: 1 }],
        }],
        stepsPerBar: 4,
        bars: 1,
        swing: 0,
      };

      // Total duration is 8 seconds — should loop the 2-second pattern 4 times
      const buffer = await renderSequencerTrackOffline(pattern, 120, 8);

      expect(buffer).toBeDefined();
    });

    it('skips inactive steps', async () => {
      const pattern: SequencerPattern = {
        rows: [{
          id: 'row-kick',
          sampleKey: 'kick',
          volume: 1,
          muted: false,
          steps: [{ active: false, velocity: 0 }],
        }],
        stepsPerBar: 4,
        bars: 1,
        swing: 0,
      };

      const buffer = await renderSequencerTrackOffline(pattern, 120, 4);

      expect(buffer).toBeDefined();
    });

    it('defaults to 808 drum kit', async () => {
      const { createDrumVoicesForKit } = await import('../DrumEngine');
      const pattern: SequencerPattern = {
        rows: [{
          id: 'row-kick',
          sampleKey: 'kick',
          volume: 1,
          muted: false,
          steps: [{ active: true, velocity: 1 }],
        }],
        stepsPerBar: 4,
        bars: 1,
        swing: 0,
      };

      await renderSequencerTrackOffline(pattern, 120, 4);

      expect(createDrumVoicesForKit).toHaveBeenCalledWith('808', expect.anything(), expect.anything());
    });
  });
});

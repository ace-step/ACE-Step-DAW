import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Tone.js — must be before any import that touches 'tone'
// ---------------------------------------------------------------------------
const mockConnect = vi.fn().mockReturnThis();
const mockDisconnect = vi.fn();
const mockDispose = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();

const nativeGainIn = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
const nativeGainOut = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;

function makeMockParam(initialValue = 0): AudioParam {
  return { value: initialValue, _param: { value: initialValue } } as unknown as AudioParam;
}

function makeBaseMock() {
  return {
    connect: mockConnect,
    disconnect: mockDisconnect,
    dispose: mockDispose,
    input: nativeGainIn,
    output: nativeGainOut,
  };
}

vi.mock('tone', () => {
  const ctx = {
    rawContext: {
      createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } })),
      createBiquadFilter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      sampleRate: 44100,
    },
    sampleRate: 44100,
    createAnalyser: vi.fn(),
  };

  return {
    getContext: vi.fn(() => ctx),
    Gain: class {
      gain = makeMockParam(1);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(_val?: number) {
        if (_val !== undefined) this.gain = makeMockParam(_val);
      }
    },
    Filter: class {
      type = 'lowpass';
      frequency = makeMockParam(350);
      Q = makeMockParam(1);
      gain = makeMockParam(0);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(opts?: Record<string, unknown>) {
        if (opts?.type) this.type = opts.type as string;
        if (opts?.frequency) this.frequency = makeMockParam(opts.frequency as number);
        if (opts?.Q) this.Q = makeMockParam(opts.Q as number);
      }
    },
    Compressor: class {
      threshold = makeMockParam(-24);
      ratio = makeMockParam(12);
      attack = makeMockParam(0.003);
      release = makeMockParam(0.25);
      knee = makeMockParam(30);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    Reverb: class {
      decay = 1.5;
      preDelay = 0.01;
      wet = makeMockParam(1);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = { input: nativeGainIn };
      output = { output: nativeGainOut };
      constructor(opts?: Record<string, unknown>) {
        if (opts?.decay !== undefined) this.decay = opts.decay as number;
        if (opts?.preDelay !== undefined) this.preDelay = opts.preDelay as number;
        if (opts?.wet !== undefined) this.wet = makeMockParam(opts.wet as number);
      }
    },
    FeedbackDelay: class {
      delayTime = makeMockParam(0.25);
      feedback = makeMockParam(0.5);
      wet = makeMockParam(1);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = { input: nativeGainIn };
      output = { output: nativeGainOut };
      constructor(opts?: Record<string, unknown>) {
        if (opts?.feedback !== undefined) this.feedback = makeMockParam(opts.feedback as number);
        if (opts?.wet !== undefined) this.wet = makeMockParam(opts.wet as number);
      }
    },
    Distortion: class {
      distortion = 0.4;
      wet = makeMockParam(1);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = { input: nativeGainIn };
      output = { output: nativeGainOut };
      constructor(opts?: Record<string, unknown>) {
        if (opts?.distortion !== undefined) this.distortion = opts.distortion as number;
        if (opts?.wet !== undefined) this.wet = makeMockParam(opts.wet as number);
      }
    },
    Chorus: class {
      frequency = makeMockParam(1.5);
      delayTime = 3.5;
      depth = 0.7;
      feedback = makeMockParam(0);
      wet = makeMockParam(0.5);
      start = mockStart;
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    Phaser: class {
      frequency = makeMockParam(0.5);
      octaves = 3;
      stages = 10;
      Q = makeMockParam(10);
      baseFrequency = 350;
      wet = makeMockParam(0.5);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(opts?: Record<string, unknown>) {
        if (opts?.frequency !== undefined) this.frequency = makeMockParam(opts.frequency as number);
        if (opts?.octaves !== undefined) this.octaves = opts.octaves as number;
      }
    },
    EQ3: class {
      low = makeMockParam(0);
      mid = makeMockParam(0);
      high = makeMockParam(0);
      lowFrequency = makeMockParam(400);
      highFrequency = makeMockParam(2500);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(l?: number, m?: number, h?: number) {
        if (l !== undefined) this.low = makeMockParam(l);
        if (m !== undefined) this.mid = makeMockParam(m);
        if (h !== undefined) this.high = makeMockParam(h);
      }
    },
    Convolver: class {
      buffer: unknown = undefined;
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      load = vi.fn().mockResolvedValue(undefined);
    },
    LFO: class {
      frequency = makeMockParam(1);
      min = 0;
      max = 1;
      start = mockStart;
      stop = mockStop;
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(opts?: Record<string, unknown>) {
        if (opts?.frequency !== undefined) this.frequency = makeMockParam(opts.frequency as number);
        if (opts?.min !== undefined) this.min = opts.min as number;
        if (opts?.max !== undefined) this.max = opts.max as number;
      }
    },
    Panner: class {
      pan = makeMockParam(0);
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(v?: number) {
        if (v !== undefined) this.pan = makeMockParam(v);
      }
    },
    PolySynth: class {
      maxPolyphony = 32;
      triggerAttack = vi.fn();
      triggerRelease = vi.fn();
      triggerAttackRelease = vi.fn();
      releaseAll = vi.fn();
      set = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    FMSynth: class {
      triggerAttack = vi.fn();
      triggerRelease = vi.fn();
      triggerAttackRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    MembraneSynth: class {
      triggerAttackRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    NoiseSynth: class {
      triggerAttackRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    MetalSynth: class {
      triggerAttackRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    Synth: class {
      triggerAttackRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    FrequencyEnvelope: class {
      attack = 0.01;
      decay = 0.1;
      sustain = 0.5;
      release = 0.3;
      baseFrequency = 200;
      octaves = 4;
      triggerAttack = vi.fn();
      triggerRelease = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
      constructor(opts?: Record<string, unknown>) {
        if (opts?.attack !== undefined) this.attack = opts.attack as number;
        if (opts?.decay !== undefined) this.decay = opts.decay as number;
        if (opts?.sustain !== undefined) this.sustain = opts.sustain as number;
        if (opts?.release !== undefined) this.release = opts.release as number;
        if (opts?.baseFrequency !== undefined) this.baseFrequency = opts.baseFrequency as number;
        if (opts?.octaves !== undefined) this.octaves = opts.octaves as number;
      }
    },
    ToneBufferSource: class {
      buffer: unknown = null;
      playbackRate = makeMockParam(1);
      loop = false;
      loopStart = 0;
      loopEnd = 0;
      onended: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      connect = mockConnect;
      disconnect = mockDisconnect;
      dispose = mockDispose;
      input = nativeGainIn;
      output = nativeGainOut;
    },
    ToneAudioBuffer: class {
      constructor(public _buffer?: unknown) {}
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { ToneDSPFactory, getDSPFactory, setDSPFactory } from '../ToneAdapter';
import type { IDSPFactory } from '../interfaces';

describe('ToneDSPFactory', () => {
  let factory: IDSPFactory;

  beforeEach(() => {
    factory = new ToneDSPFactory();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Basic nodes
  // -----------------------------------------------------------------------

  describe('createGain', () => {
    it('creates a gain node with default value', () => {
      const gain = factory.createGain();
      expect(gain).toBeDefined();
      expect(gain.inputNode).toBe(nativeGainIn);
      expect(gain.outputNode).toBe(nativeGainOut);
    });

    it('creates a gain node with custom value', () => {
      const gain = factory.createGain({ gain: 0.5 });
      expect(gain).toBeDefined();
      expect(gain.gain).toBeDefined();
    });
  });

  describe('createFilter', () => {
    it('creates a filter node with defaults', () => {
      const filter = factory.createFilter();
      expect(filter).toBeDefined();
      expect(filter.inputNode).toBe(nativeGainIn);
      expect(filter.outputNode).toBe(nativeGainOut);
    });

    it('creates a filter with custom type', () => {
      const filter = factory.createFilter({ type: 'highpass', frequency: 1000, Q: 2 });
      expect(filter).toBeDefined();
      expect(filter.type).toBe('highpass');
    });

    it('allows changing filter type', () => {
      const filter = factory.createFilter();
      filter.type = 'bandpass';
      expect(filter.type).toBe('bandpass');
    });
  });

  describe('createCompressor', () => {
    it('creates a compressor', () => {
      const comp = factory.createCompressor();
      expect(comp).toBeDefined();
      expect(comp.threshold).toBeDefined();
      expect(comp.ratio).toBeDefined();
      expect(comp.attack).toBeDefined();
      expect(comp.release).toBeDefined();
      expect(comp.knee).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  describe('createReverb', () => {
    it('creates a reverb with custom params', () => {
      const reverb = factory.createReverb({ decay: 3, wet: 0.5 });
      expect(reverb.decay).toBe(3);
      expect(reverb.wet).toBe(0.5);
    });

    it('allows setting decay', () => {
      const reverb = factory.createReverb();
      reverb.decay = 5;
      expect(reverb.decay).toBe(5);
    });
  });

  describe('createDelay', () => {
    it('creates a delay with custom params', () => {
      const delay = factory.createDelay({ feedback: 0.3, wet: 0.8 });
      expect(delay.feedback).toBe(0.3);
      expect(delay.wet).toBe(0.8);
    });

    it('exposes delayTime param', () => {
      const delay = factory.createDelay();
      expect(delay.delayTime).toBeDefined();
    });
  });

  describe('createDistortion', () => {
    it('creates a distortion with custom params', () => {
      const dist = factory.createDistortion({ distortion: 0.8, wet: 0.6 });
      expect(dist.distortion).toBe(0.8);
      expect(dist.wet).toBe(0.6);
    });
  });

  describe('createChorus', () => {
    it('creates a chorus and supports start', () => {
      const chorus = factory.createChorus();
      expect(chorus).toBeDefined();
      chorus.start();
      expect(mockStart).toHaveBeenCalled();
    });
  });

  describe('createPhaser', () => {
    it('creates a phaser with custom params', () => {
      const phaser = factory.createPhaser({ frequency: 2, octaves: 4 });
      expect(phaser.frequency).toBe(2);
      expect(phaser.octaves).toBe(4);
    });
  });

  describe('createEQ3', () => {
    it('creates a 3-band EQ with custom levels', () => {
      const eq = factory.createEQ3({ low: -3, mid: 2, high: 1 });
      expect(eq.low).toBe(-3);
      expect(eq.mid).toBe(2);
      expect(eq.high).toBe(1);
    });

    it('allows setting band levels after creation', () => {
      const eq = factory.createEQ3();
      eq.low = -6;
      expect(eq.low).toBe(-6);
    });
  });

  describe('createConvolver', () => {
    it('creates a convolver with null buffer', () => {
      const conv = factory.createConvolver();
      expect(conv).toBeDefined();
    });
  });

  describe('createLFO', () => {
    it('supports start/stop', () => {
      const lfo = factory.createLFO({ frequency: 2, min: 100, max: 2000 });
      lfo.start();
      expect(mockStart).toHaveBeenCalled();
      lfo.stop();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('createPanner', () => {
    it('creates a panner with custom pan', () => {
      const panner = factory.createPanner(0.5);
      expect(panner.pan).toBe(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Synths
  // -----------------------------------------------------------------------

  describe('createPolySynth', () => {
    it('creates a poly synth', () => {
      const synth = factory.createPolySynth();
      expect(synth).toBeDefined();
    });

    it('delegates triggerAttackRelease without error', () => {
      const synth = factory.createPolySynth();
      expect(() => synth.triggerAttackRelease('C4', '8n')).not.toThrow();
    });

    it('delegates releaseAll without error', () => {
      const synth = factory.createPolySynth();
      expect(() => synth.releaseAll()).not.toThrow();
    });
  });

  describe('createFMSynth', () => {
    it('creates an FM synth', () => {
      const synth = factory.createFMSynth();
      expect(synth).toBeDefined();
    });
  });

  describe('createMembraneSynth', () => {
    it('creates a membrane synth', () => {
      const synth = factory.createMembraneSynth();
      expect(synth).toBeDefined();
    });
  });

  describe('createNoiseSynth', () => {
    it('creates a noise synth', () => {
      const synth = factory.createNoiseSynth();
      expect(synth).toBeDefined();
    });
  });

  describe('createMetalSynth', () => {
    it('creates a metal synth', () => {
      const synth = factory.createMetalSynth();
      expect(synth).toBeDefined();
    });
  });

  describe('createSynth', () => {
    it('creates a basic synth', () => {
      const synth = factory.createSynth();
      expect(synth).toBeDefined();
    });
  });

  describe('createFrequencyEnvelope', () => {
    it('creates an envelope with custom ADSR', () => {
      const env = factory.createFrequencyEnvelope({
        attack: 0.05,
        decay: 0.2,
        sustain: 0.8,
        release: 0.5,
      });
      expect(env.attack).toBe(0.05);
      expect(env.decay).toBe(0.2);
      expect(env.sustain).toBe(0.8);
      expect(env.release).toBe(0.5);
    });
  });

  describe('createBufferSource', () => {
    it('creates a buffer source', () => {
      const src = factory.createBufferSource();
      expect(src).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Node lifecycle
  // -----------------------------------------------------------------------

  describe('node lifecycle', () => {
    it('connect returns the destination for chaining', () => {
      const gain1 = factory.createGain();
      const gain2 = factory.createGain();
      const result = gain1.connect(gain2);
      expect(result).toBe(gain2);
    });

    it('connectNative connects to raw AudioNode', () => {
      const gain = factory.createGain();
      const native = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
      const result = gain.connectNative(native);
      expect(result).toBe(native);
    });

    it('dispose calls underlying dispose', () => {
      const gain = factory.createGain();
      gain.dispose();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('disconnect calls underlying disconnect', () => {
      const gain = factory.createGain();
      gain.disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Context
  // -----------------------------------------------------------------------

  describe('context access', () => {
    it('getContext returns AudioContext', () => {
      const ctx = factory.getContext();
      expect(ctx).toBeDefined();
      expect(ctx.createGain).toBeDefined();
    });

    it('sampleRate returns positive number', () => {
      expect(factory.sampleRate).toBe(44100);
    });
  });
});

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

describe('getDSPFactory / setDSPFactory', () => {
  it('returns the default ToneDSPFactory', () => {
    const f = getDSPFactory();
    expect(f).toBeInstanceOf(ToneDSPFactory);
  });

  it('allows replacing and restoring the factory', () => {
    const original = getDSPFactory();
    const mock = { createGain: vi.fn() } as unknown as IDSPFactory;
    setDSPFactory(mock);
    expect(getDSPFactory()).toBe(mock);
    setDSPFactory(original);
    expect(getDSPFactory()).toBe(original);
  });
});

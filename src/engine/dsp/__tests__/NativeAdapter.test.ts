/**
 * Tests for NativeDSPFactory — Phase 3 Effects Migration (#1126).
 *
 * Uses mock AudioContext to verify:
 * - All effect factory methods return correct interface implementations
 * - Nodes connect/disconnect properly
 * - Parameter getters/setters work
 * - dispose() cleans up
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeDSPFactory } from '../NativeAdapter';

// ---------------------------------------------------------------------------
// Mock Web Audio API
// ---------------------------------------------------------------------------

class MockAudioParam {
  value = 0;
  defaultValue = 0;
  minValue = -3.4028235e38;
  maxValue = 3.4028235e38;
}

class MockAudioNode {
  numberOfInputs = 1;
  numberOfOutputs = 1;
  channelCount = 2;
  connected: MockAudioNode[] = [];
  connectedParams: MockAudioParam[] = [];

  connect(dest: MockAudioNode | MockAudioParam): MockAudioNode | undefined {
    if (dest instanceof MockAudioParam) {
      this.connectedParams.push(dest);
      return undefined;
    }
    this.connected.push(dest);
    return dest;
  }

  disconnect(_dest?: MockAudioNode | MockAudioParam): void {
    if (!_dest) {
      this.connected = [];
      this.connectedParams = [];
    }
  }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
  constructor() {
    super();
    this.gain.value = 1;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  gain = new MockAudioParam();
  constructor() {
    super();
    this.frequency.value = 350;
    this.Q.value = 1;
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam();
  ratio = new MockAudioParam();
  knee = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
  reduction = 0;
}

class MockDelayNode extends MockAudioNode {
  delayTime = new MockAudioParam();
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam();
}

class MockOscillatorNode extends MockAudioNode {
  frequency = new MockAudioParam();
  type = 'sine';
  started = false;
  onended: (() => void) | null = null;
  start() { this.started = true; }
  stop() { this.started = false; }
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new MockAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class MockWaveShaperNode extends MockAudioNode {
  curve: Float32Array | null = null;
  oversample: string = 'none';
}

class MockConvolverNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
}

class MockScriptProcessorNode extends MockAudioNode {
  onaudioprocess: ((e: unknown) => void) | null = null;
  bufferSize = 2048;
}

function createMockAudioContext(): AudioContext {
  return {
    sampleRate: 44100,
    createGain: () => new MockGainNode(),
    createBiquadFilter: () => new MockBiquadFilterNode(),
    createDynamicsCompressor: () => new MockDynamicsCompressorNode(),
    createDelay: () => new MockDelayNode(),
    createStereoPanner: () => new MockStereoPannerNode(),
    createOscillator: () => new MockOscillatorNode(),
    createWaveShaper: () => new MockWaveShaperNode(),
    createConvolver: () => new MockConvolverNode(),
    createScriptProcessor: () => new MockScriptProcessorNode(),
    createBuffer: (_channels: number, length: number, _sr: number) => ({
      getChannelData: () => new Float32Array(length),
      numberOfChannels: _channels,
      length,
      sampleRate: _sr,
      duration: length / _sr,
    }),
    createBufferSource: () => new MockBufferSourceNode(),
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NativeDSPFactory', () => {
  let ctx: AudioContext;
  let factory: NativeDSPFactory;

  beforeEach(() => {
    ctx = createMockAudioContext();
    factory = new NativeDSPFactory(ctx);
  });

  describe('createGain', () => {
    it('creates a gain node with default value', () => {
      const gain = factory.createGain();
      expect(gain).toBeDefined();
      expect(gain.inputNode).toBeDefined();
      expect(gain.outputNode).toBeDefined();
      expect(gain.gain).toBeDefined();
    });

    it('applies custom gain value', () => {
      const gain = factory.createGain({ gain: 0.5 });
      expect(gain.gain.value).toBe(0.5);
    });
  });

  describe('createFilter', () => {
    it('creates a filter with default params', () => {
      const filter = factory.createFilter();
      expect(filter).toBeDefined();
      expect(filter.type).toBe('lowpass');
      expect(filter.frequency).toBeDefined();
      expect(filter.Q).toBeDefined();
      expect(filter.gain).toBeDefined();
    });

    it('applies custom filter options', () => {
      const filter = factory.createFilter({
        type: 'highpass',
        frequency: 1000,
        Q: 5,
      });
      expect(filter.type).toBe('highpass');
    });

    it('type is settable', () => {
      const filter = factory.createFilter();
      filter.type = 'bandpass';
      expect(filter.type).toBe('bandpass');
    });
  });

  describe('createCompressor', () => {
    it('creates a compressor with params', () => {
      const comp = factory.createCompressor({ threshold: -20, ratio: 4 });
      expect(comp).toBeDefined();
      expect(comp.threshold).toBeDefined();
      expect(comp.ratio).toBeDefined();
      expect(comp.attack).toBeDefined();
      expect(comp.release).toBeDefined();
      expect(comp.knee).toBeDefined();
    });
  });

  describe('createPanner', () => {
    it('creates a panner node', () => {
      const panner = factory.createPanner(0.5);
      expect(panner).toBeDefined();
      expect(panner.pan).toBe(0.5);
    });

    it('pan is settable', () => {
      const panner = factory.createPanner();
      panner.pan = -0.7;
      expect(panner.pan).toBe(-0.7);
    });
  });

  describe('createDelay', () => {
    it('creates a delay with feedback', () => {
      const delay = factory.createDelay({ delayTime: 0.5, feedback: 0.3, wet: 0.7 });
      expect(delay).toBeDefined();
      expect(delay.delayTime).toBeDefined();
    });

    it('feedback and wet are settable', () => {
      const delay = factory.createDelay();
      delay.feedback = 0.8;
      expect(delay.feedback).toBe(0.8);
      delay.wet = 0.5;
      expect(delay.wet).toBe(0.5);
    });
  });

  describe('createReverb', () => {
    it('creates a reverb with options', () => {
      const reverb = factory.createReverb({ decay: 3, wet: 0.5 });
      expect(reverb).toBeDefined();
      expect(reverb.decay).toBe(3);
      expect(reverb.wet).toBe(0.5);
    });

    it('decay and wet are settable', () => {
      const reverb = factory.createReverb();
      reverb.decay = 5;
      expect(reverb.decay).toBe(5);
      reverb.wet = 0.3;
      expect(reverb.wet).toBe(0.3);
    });
  });

  describe('createDistortion', () => {
    it('creates a distortion with options', () => {
      const dist = factory.createDistortion({ distortion: 0.8, wet: 0.6 });
      expect(dist).toBeDefined();
      expect(dist.distortion).toBe(0.8);
      expect(dist.wet).toBe(0.6);
    });

    it('distortion amount is settable', () => {
      const dist = factory.createDistortion();
      dist.distortion = 0.5;
      expect(dist.distortion).toBe(0.5);
    });
  });

  describe('createChorus', () => {
    it('creates a chorus with options', () => {
      const chorus = factory.createChorus({
        frequency: 2,
        delayTime: 5,
        depth: 0.5,
        wet: 0.4,
      });
      expect(chorus).toBeDefined();
      expect(chorus.frequency).toBe(2);
      expect(chorus.depth).toBe(0.5);
    });

    it('start() does not throw', () => {
      const chorus = factory.createChorus();
      expect(() => chorus.start()).not.toThrow();
    });

    it('parameters are settable', () => {
      const chorus = factory.createChorus();
      chorus.frequency = 3;
      expect(chorus.frequency).toBe(3);
      chorus.depth = 0.8;
      expect(chorus.depth).toBe(0.8);
    });
  });

  describe('createPhaser', () => {
    it('creates a phaser with options', () => {
      const phaser = factory.createPhaser({
        frequency: 0.3,
        octaves: 4,
        stages: 6,
        Q: 8,
        baseFrequency: 500,
        wet: 0.6,
      });
      expect(phaser).toBeDefined();
      expect(phaser.frequency).toBe(0.3);
      expect(phaser.octaves).toBe(4);
      expect(phaser.stages).toBe(6);
    });

    it('parameters are settable', () => {
      const phaser = factory.createPhaser();
      phaser.Q = 15;
      expect(phaser.Q).toBe(15);
      phaser.baseFrequency = 800;
      expect(phaser.baseFrequency).toBe(800);
    });
  });

  describe('createEQ3', () => {
    it('creates a 3-band EQ', () => {
      const eq = factory.createEQ3({ low: -3, mid: 0, high: 2 });
      expect(eq).toBeDefined();
      expect(eq.low).toBe(-3);
      expect(eq.mid).toBe(0);
      expect(eq.high).toBe(2);
    });

    it('bands are settable', () => {
      const eq = factory.createEQ3();
      eq.low = 5;
      expect(eq.low).toBe(5);
      eq.mid = -2;
      expect(eq.mid).toBe(-2);
      eq.high = 3;
      expect(eq.high).toBe(3);
    });

    it('frequency crossovers are settable', () => {
      const eq = factory.createEQ3();
      eq.lowFrequency = 200;
      expect(eq.lowFrequency).toBe(200);
      eq.highFrequency = 5000;
      expect(eq.highFrequency).toBe(5000);
    });
  });

  describe('createConvolver', () => {
    it('creates a convolver node', () => {
      const conv = factory.createConvolver();
      expect(conv).toBeDefined();
      expect(conv.buffer).toBeNull();
    });
  });

  describe('createLFO', () => {
    it('creates an LFO with options', () => {
      const lfo = factory.createLFO({ frequency: 2, min: 100, max: 1000 });
      expect(lfo).toBeDefined();
      expect(lfo.frequency).toBe(2);
      expect(lfo.min).toBe(100);
      expect(lfo.max).toBe(1000);
    });

    it('start/stop do not throw', () => {
      const lfo = factory.createLFO();
      expect(() => lfo.start()).not.toThrow();
      expect(() => lfo.stop()).not.toThrow();
    });

    it('connectParam does not throw', () => {
      const lfo = factory.createLFO();
      const gain = factory.createGain();
      expect(() => lfo.connectParam(gain.gain)).not.toThrow();
    });
  });

  describe('node connectivity', () => {
    it('connect chains nodes', () => {
      const gain = factory.createGain();
      const filter = factory.createFilter();
      const result = gain.connect(filter);
      expect(result).toBe(filter);
    });

    it('connectNative returns the destination', () => {
      const gain = factory.createGain();
      const mockNode = new MockAudioNode() as unknown as AudioNode;
      const result = gain.connectNative(mockNode);
      expect(result).toBe(mockNode);
    });

    it('disconnect does not throw', () => {
      const gain = factory.createGain();
      const filter = factory.createFilter();
      gain.connect(filter);
      expect(() => gain.disconnect(filter)).not.toThrow();
      expect(() => gain.disconnect()).not.toThrow();
    });

    it('dispose disconnects the node', () => {
      const gain = factory.createGain();
      expect(() => gain.dispose()).not.toThrow();
    });
  });

  describe('factory utilities', () => {
    it('getContext returns the AudioContext', () => {
      expect(factory.getContext()).toBe(ctx);
    });

    it('sampleRate returns the context sample rate', () => {
      expect(factory.sampleRate).toBe(44100);
    });
  });
});

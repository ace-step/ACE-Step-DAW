import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrackNode } from '../TrackNode';

/** Minimal AudioParam stub */
function makeAudioParam(initial = 0) {
  let _value = initial;
  return {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime(value: number, _endTime: number) {
      _value = value;
      return this;
    },
    setValueAtTime(value: number, _time: number) {
      _value = value;
      return this;
    },
    cancelScheduledValues(_time: number) {
      return this;
    },
  };
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeAudioContext(): AudioContext {
  return {
    get currentTime() { return 0; },
    sampleRate: 44100,
    createGain() {
      return makeNode({ gain: makeAudioParam(1) });
    },
    createStereoPanner() {
      return makeNode({ pan: makeAudioParam(0) });
    },
    createBiquadFilter() {
      return makeNode({
        type: 'lowshelf',
        frequency: makeAudioParam(1000),
        Q: makeAudioParam(1),
        gain: makeAudioParam(0),
      });
    },
    createDynamicsCompressor() {
      return makeNode({
        threshold: makeAudioParam(0),
        ratio: makeAudioParam(1),
        attack: makeAudioParam(0.003),
        release: makeAudioParam(0.25),
        knee: makeAudioParam(30),
      });
    },
    createConvolver() {
      return makeNode({ buffer: null });
    },
    createAnalyser() {
      return makeNode({
        fftSize: 2048,
        smoothingTimeConstant: 0.6,
        frequencyBinCount: 1024,
        getByteFrequencyData: vi.fn(),
        getFloatFrequencyData: vi.fn(),
        getFloatTimeDomainData: vi.fn(),
      });
    },
    createChannelSplitter(_numberOfOutputs: number) {
      return makeNode();
    },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return {
        getChannelData: () => data,
        sampleRate,
        length,
        numberOfChannels: _channels,
        duration: length / sampleRate,
      };
    },
  } as unknown as AudioContext;
}

describe('TrackNode stereo metering', () => {
  let ctx: AudioContext;
  let destination: ReturnType<typeof makeNode>;
  let node: TrackNode;

  beforeEach(() => {
    ctx = makeAudioContext();
    destination = makeNode();
    node = new TrackNode(ctx, destination as unknown as AudioNode);
  });

  /** Helper to access private analyser nodes and mock their data */
  function mockAnalyserData(opts: {
    monoTimeDomain?: number[];
    leftTimeDomain?: number[];
    rightTimeDomain?: number[];
  }) {
    const nodeAny = node as unknown as Record<string, unknown>;

    // Mock the main analyser
    const analyserNode = nodeAny.analyserNode as {
      getByteFrequencyData: ReturnType<typeof vi.fn>;
      getFloatTimeDomainData: ReturnType<typeof vi.fn>;
    };
    analyserNode.getByteFrequencyData = vi.fn((data: Uint8Array) => {
      data.fill(0);
    });
    analyserNode.getFloatTimeDomainData = vi.fn((data: Float32Array) => {
      data.fill(0);
      (opts.monoTimeDomain ?? []).forEach((s, i) => {
        if (i < data.length) data[i] = s;
      });
    });

    // Mock the left analyser
    const analyserLeft = nodeAny.analyserLeft as {
      getByteFrequencyData: ReturnType<typeof vi.fn>;
      getFloatTimeDomainData: ReturnType<typeof vi.fn>;
    };
    analyserLeft.getByteFrequencyData = vi.fn((data: Uint8Array) => {
      data.fill(0);
    });
    analyserLeft.getFloatTimeDomainData = vi.fn((data: Float32Array) => {
      data.fill(0);
      (opts.leftTimeDomain ?? []).forEach((s, i) => {
        if (i < data.length) data[i] = s;
      });
    });

    // Mock the right analyser
    const analyserRight = nodeAny.analyserRight as {
      getByteFrequencyData: ReturnType<typeof vi.fn>;
      getFloatTimeDomainData: ReturnType<typeof vi.fn>;
    };
    analyserRight.getByteFrequencyData = vi.fn((data: Uint8Array) => {
      data.fill(0);
    });
    analyserRight.getFloatTimeDomainData = vi.fn((data: Float32Array) => {
      data.fill(0);
      (opts.rightTimeDomain ?? []).forEach((s, i) => {
        if (i < data.length) data[i] = s;
      });
    });
  }

  it('getMeter() returns leftLevel, rightLevel, level, and clipped', () => {
    mockAnalyserData({
      monoTimeDomain: [0.5],
      leftTimeDomain: [0.3],
      rightTimeDomain: [0.7],
    });

    const meter = node.getMeter();

    expect(meter).toHaveProperty('leftLevel');
    expect(meter).toHaveProperty('rightLevel');
    expect(meter).toHaveProperty('level');
    expect(meter).toHaveProperty('clipped');
    expect(typeof meter.leftLevel).toBe('number');
    expect(typeof meter.rightLevel).toBe('number');
  });

  it('leftLevel and rightLevel reflect per-channel peak levels', () => {
    mockAnalyserData({
      monoTimeDomain: [0.7],
      leftTimeDomain: [0.3],
      rightTimeDomain: [0.7],
    });

    const meter = node.getMeter();

    expect(meter.leftLevel).toBeCloseTo(0.3, 2);
    expect(meter.rightLevel).toBeCloseTo(0.7, 2);
  });

  it('level equals Math.max(leftLevel, rightLevel) for backward compatibility', () => {
    mockAnalyserData({
      monoTimeDomain: [0.8],
      leftTimeDomain: [0.4],
      rightTimeDomain: [0.8],
    });

    const meter = node.getMeter();

    expect(meter.level).toBe(Math.max(meter.leftLevel, meter.rightLevel));
  });

  it('clipped latches when any channel exceeds threshold', () => {
    mockAnalyserData({
      monoTimeDomain: [1.0],
      leftTimeDomain: [1.0],
      rightTimeDomain: [0.5],
    });

    const meter = node.getMeter();
    expect(meter.clipped).toBe(true);

    // After reset, reading lower values should not be clipped
    node.resetClip();
    mockAnalyserData({
      monoTimeDomain: [0.2],
      leftTimeDomain: [0.2],
      rightTimeDomain: [0.1],
    });

    const meter2 = node.getMeter();
    expect(meter2.clipped).toBe(false);
  });

  it('getLevel() still returns a single number for backward compat', () => {
    mockAnalyserData({
      monoTimeDomain: [0.5],
      leftTimeDomain: [0.3],
      rightTimeDomain: [0.5],
    });

    const level = node.getLevel();
    expect(typeof level).toBe('number');
    expect(level).toBeGreaterThan(0);
  });
});

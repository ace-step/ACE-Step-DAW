import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrackNode } from '../TrackNode';

function makeAudioParam(initial = 0) {
  let _value = initial;
  const rampCalls: { value: number; endTime: number }[] = [];
  return {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime(value: number, endTime: number) {
      rampCalls.push({ value, endTime });
      _value = value;
      return this;
    },
    setValueAtTime(value: number, _time: number) {
      _value = value;
      return this;
    },
    cancelScheduledValues() { return this; },
    rampCalls,
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
    createGain() { return makeNode({ gain: makeAudioParam(1) }); },
    createStereoPanner() { return makeNode({ pan: makeAudioParam(0) }); },
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
    createConvolver() { return makeNode({ buffer: null }); },
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
    createChannelSplitter() { return makeNode(); },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data, sampleRate, length, numberOfChannels: _channels, duration: length / sampleRate };
    },
    createDelay() { return makeNode({ delayTime: makeAudioParam(0) }); },
  } as unknown as AudioContext;
}

describe('TrackNode sends', () => {
  let ctx: AudioContext;
  let destination: ReturnType<typeof makeNode>;
  let node: TrackNode;
  let returnInput: ReturnType<typeof makeNode>;

  beforeEach(() => {
    ctx = makeAudioContext();
    destination = makeNode();
    node = new TrackNode(ctx, destination as unknown as AudioNode);
    returnInput = makeNode({ gain: makeAudioParam(1) });
  });

  describe('connectSend', () => {
    it('creates pre and post gain nodes connected to destination', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.6, false);
      // Post-fader: volumeGain should connect to a post gain node
      const volumeGainConnects = (node.volumeGain as any).connect.mock.calls;
      // volumeGain connects to: analyserNode, splitter, and now a post-fader send gain
      expect(volumeGainConnects.length).toBeGreaterThanOrEqual(3);
    });

    it('post-fader send: pre gain = 0, post gain = amount', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.7, false);
      const sends = (node as any).sendGains;
      const send = sends.get('ret1');
      expect(send).not.toBeUndefined();
      expect(send.pre.gain.value).toBe(0);
      expect(send.post.gain.value).toBe(0.7);
    });

    it('pre-fader send: pre gain = amount, post gain = 0', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.5, true);
      const send = (node as any).sendGains.get('ret1');
      expect(send.pre.gain.value).toBe(0.5);
      expect(send.post.gain.value).toBe(0);
    });

    it('overwrites existing send on same returnTrackId', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.3, false);
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.9, true);
      const send = (node as any).sendGains.get('ret1');
      expect(send.pre.gain.value).toBe(0.9);
      expect(send.post.gain.value).toBe(0);
    });
  });

  describe('updateSendAmount', () => {
    it('ramps gain values for click-free transition', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.5, false);
      node.updateSendAmount('ret1', 0.8, false);
      const send = (node as any).sendGains.get('ret1');
      // Post gain should be ramped to 0.8
      expect(send.post.gain.rampCalls.length).toBeGreaterThan(0);
      expect(send.post.gain.value).toBe(0.8);
    });

    it('switches from post to pre-fader', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.6, false);
      node.updateSendAmount('ret1', 0.6, true);
      const send = (node as any).sendGains.get('ret1');
      // Pre should now have the amount, post should be 0
      expect(send.pre.gain.value).toBe(0.6);
      expect(send.post.gain.value).toBe(0);
    });

    it('no-op for unknown returnTrackId', () => {
      node.updateSendAmount('unknown', 0.5, false);
      // Should not throw
    });
  });

  describe('disconnectSend', () => {
    it('removes send gains and disconnects', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.5, false);
      node.disconnectSend('ret1');
      expect((node as any).sendGains.has('ret1')).toBe(false);
    });

    it('no-op for unknown returnTrackId', () => {
      node.disconnectSend('unknown');
      // Should not throw
    });
  });

  describe('disconnectAllSends', () => {
    it('removes all sends', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.5, false);
      node.connectSend('ret2', returnInput as unknown as AudioNode, 0.3, true);
      node.disconnectAllSends();
      expect((node as any).sendGains.size).toBe(0);
    });
  });

  describe('disconnect cleans up sends', () => {
    it('disconnect() also disconnects all sends', () => {
      node.connectSend('ret1', returnInput as unknown as AudioNode, 0.5, false);
      node.disconnect();
      expect((node as any).sendGains.size).toBe(0);
    });
  });

  describe('preFaderOutput', () => {
    it('returns compressor by default', () => {
      expect(node.preFaderOutput).toBe((node as any).compressor);
    });

    it('returns latencyCompNode when set', () => {
      node.setLatencyCompensation(512, 44100);
      expect(node.preFaderOutput).toBe((node as any).latencyCompNode);
    });

    it('returns compressor after removing latency compensation', () => {
      node.setLatencyCompensation(512, 44100);
      node.setLatencyCompensation(0, 44100);
      expect(node.preFaderOutput).toBe((node as any).compressor);
    });
  });
});

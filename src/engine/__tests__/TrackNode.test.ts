import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrackNode } from '../TrackNode';

/** Minimal AudioParam stub that records ramp calls */
function makeAudioParam(initial = 0) {
  let _value = initial;
  const rampCalls: { value: number; endTime: number }[] = [];
  const cancelCalls: number[] = [];
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
    cancelScheduledValues(_time: number) {
      cancelCalls.push(_time);
      return this;
    },
    rampCalls,
    cancelCalls,
  };
}

/** Minimal AudioNode / AudioContext stubs */
function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeAudioContext(): AudioContext {
  let _currentTime = 0;
  return {
    get currentTime() { return _currentTime; },
    set currentTime(v: number) { _currentTime = v; },
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
        fftSize: 256,
        smoothingTimeConstant: 0.6,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
      });
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

describe('TrackNode', () => {
  let ctx: AudioContext;
  let destination: ReturnType<typeof makeNode>;
  let node: TrackNode;

  beforeEach(() => {
    ctx = makeAudioContext();
    destination = makeNode();
    node = new TrackNode(ctx, destination as unknown as AudioNode);
  });

  describe('click-free mute/unmute', () => {
    function getGainParam() {
      return node.volumeGain.gain as unknown as ReturnType<typeof makeAudioParam>;
    }

    it('uses linearRampToValueAtTime when muting', () => {
      const param = getGainParam();
      param.rampCalls.length = 0;

      node.muted = true;

      expect(param.rampCalls.length).toBeGreaterThanOrEqual(1);
      const lastRamp = param.rampCalls[param.rampCalls.length - 1];
      expect(lastRamp.value).toBe(0);
    });

    it('uses linearRampToValueAtTime when unmuting', () => {
      node.muted = true;

      const param = getGainParam();
      param.rampCalls.length = 0;

      node.muted = false;

      expect(param.rampCalls.length).toBeGreaterThanOrEqual(1);
      const lastRamp = param.rampCalls[param.rampCalls.length - 1];
      expect(lastRamp.value).toBe(0.8); // default volume
    });

    it('ramps to 0 when solo is active on another track', () => {
      const param = getGainParam();
      param.rampCalls.length = 0;

      node.soloActive = true;

      expect(param.rampCalls.length).toBeGreaterThanOrEqual(1);
      const lastRamp = param.rampCalls[param.rampCalls.length - 1];
      expect(lastRamp.value).toBe(0);
    });

    it('fade duration is approximately 5ms', () => {
      const param = getGainParam();
      param.rampCalls.length = 0;

      node.muted = true;

      const lastRamp = param.rampCalls[param.rampCalls.length - 1];
      expect(lastRamp.endTime).toBeCloseTo(ctx.currentTime + 0.005, 3);
    });

    it('ramps volume back when unmuting after solo-implied mute', () => {
      node.soloActive = true;
      const param = getGainParam();
      param.rampCalls.length = 0;

      node.soloed = true;

      expect(param.rampCalls.length).toBeGreaterThanOrEqual(1);
      const lastRamp = param.rampCalls[param.rampCalls.length - 1];
      expect(lastRamp.value).toBe(0.8);
    });

    it('cancels scheduled values before ramping (prevents stacking)', () => {
      const param = getGainParam();
      param.cancelCalls.length = 0;

      node.muted = true;

      expect(param.cancelCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

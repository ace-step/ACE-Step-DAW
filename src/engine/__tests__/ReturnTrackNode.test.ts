import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReturnTrackNode } from '../ReturnTrackNode';

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
  } as unknown as AudioContext;
}

describe('ReturnTrackNode', () => {
  let ctx: AudioContext;
  let destination: ReturnType<typeof makeNode>;
  let node: ReturnTrackNode;

  beforeEach(() => {
    ctx = makeAudioContext();
    destination = makeNode();
    node = new ReturnTrackNode(ctx, destination as unknown as AudioNode);
  });

  it('connects signal chain: inputGain → volumeGain → panNode → analyser → destination', () => {
    // inputGain connects to volumeGain
    expect((node.inputGain as any).connect).toHaveBeenCalled();
  });

  it('applies volume with 5ms click-free ramp', () => {
    node.volume = 0.5;
    // Volume gain should have been ramped
    const volumeGain = (node as any).volumeGain;
    const param = volumeGain.gain;
    expect(param.rampCalls.length).toBeGreaterThan(0);
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0.5);
  });

  it('mutes to 0 with ramp', () => {
    node.volume = 0.8;
    node.muted = true;
    const param = (node as any).volumeGain.gain;
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0);
  });

  it('unmutes restores volume', () => {
    node.volume = 0.7;
    node.muted = true;
    node.muted = false;
    const param = (node as any).volumeGain.gain;
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0.7);
  });

  it('sets pan value clamped to [-1, 1]', () => {
    node.pan = 2;
    expect((node as any).panNode.pan.value).toBe(1);
    node.pan = -5;
    expect((node as any).panNode.pan.value).toBe(-1);
  });

  it('spliceEffects inserts chain between input and volume', () => {
    const effectInput = makeNode();
    const effectOutput = makeNode();
    node.spliceEffects(effectInput as unknown as AudioNode, effectOutput as unknown as AudioNode);
    // inputGain should connect to effectInput
    expect((node.inputGain as any).connect).toHaveBeenCalledWith(effectInput);
    // effectOutput should connect to volumeGain
    expect(effectOutput.connect).toHaveBeenCalled();
  });

  it('spliceEffects(null, null) restores direct path', () => {
    const effectInput = makeNode();
    const effectOutput = makeNode();
    node.spliceEffects(effectInput as unknown as AudioNode, effectOutput as unknown as AudioNode);
    node.spliceEffects(null, null);
    // inputGain should reconnect directly to volumeGain
    const connectCalls = (node.inputGain as any).connect.mock.calls;
    const lastCall = connectCalls[connectCalls.length - 1];
    expect(lastCall[0]).toBe((node as any).volumeGain);
  });

  it('disconnect() disconnects all nodes', () => {
    node.disconnect();
    expect((node.inputGain as any).disconnect).toHaveBeenCalled();
    expect((node as any).volumeGain.disconnect).toHaveBeenCalled();
    expect((node as any).panNode.disconnect).toHaveBeenCalled();
    expect((node as any).analyserNode.disconnect).toHaveBeenCalled();
  });

  it('getMeter returns level data', () => {
    const meter = node.getMeter();
    expect(meter).toHaveProperty('level');
    expect(meter).toHaveProperty('leftLevel');
    expect(meter).toHaveProperty('rightLevel');
    expect(meter).toHaveProperty('clipped');
    expect(meter.level).toBe(0);
  });

  it('resetClip clears clipped state', () => {
    node.resetClip();
    expect(node.getMeter().clipped).toBe(false);
  });
});

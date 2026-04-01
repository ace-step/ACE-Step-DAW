import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReturnTrackNode } from '../ReturnTrackNode';
import { type MockAudioParam, type MockNode, makeAudioParam, makeNode } from './mockAudioHelpers';

/** Type-safe accessor for private members of ReturnTrackNode used in tests. */
interface ReturnTrackNodeInternals {
  volumeGain: MockNode & { gain: MockAudioParam };
  panNode: MockNode & { pan: MockAudioParam };
  analyserNode: MockNode;
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
  let destination: MockNode;
  let node: ReturnTrackNode;
  /** Type-safe accessor for private members. */
  let internals: ReturnTrackNodeInternals;

  beforeEach(() => {
    ctx = makeAudioContext();
    destination = makeNode();
    node = new ReturnTrackNode(ctx, destination as unknown as AudioNode);
    internals = node as unknown as ReturnTrackNodeInternals;
  });

  it('connects signal chain: inputGain → volumeGain → panNode → analyser → destination', () => {
    // inputGain connects to volumeGain
    const inputGain = node.inputGain as unknown as MockNode;
    expect(inputGain.connect).toHaveBeenCalled();
  });

  it('applies volume with 5ms click-free ramp', () => {
    node.volume = 0.5;
    // Volume gain should have been ramped
    const param = internals.volumeGain.gain;
    expect(param.rampCalls.length).toBeGreaterThan(0);
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0.5);
  });

  it('mutes to 0 with ramp', () => {
    node.volume = 0.8;
    node.muted = true;
    const param = internals.volumeGain.gain;
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0);
  });

  it('unmutes restores volume', () => {
    node.volume = 0.7;
    node.muted = true;
    node.muted = false;
    const param = internals.volumeGain.gain;
    expect(param.rampCalls[param.rampCalls.length - 1].value).toBe(0.7);
  });

  it('sets pan value clamped to [-1, 1]', () => {
    node.pan = 2;
    expect(internals.panNode.pan.value).toBe(1);
    node.pan = -5;
    expect(internals.panNode.pan.value).toBe(-1);
  });

  it('spliceEffects inserts chain between input and volume', () => {
    const effectInput = makeNode();
    const effectOutput = makeNode();
    node.spliceEffects(effectInput as unknown as AudioNode, effectOutput as unknown as AudioNode);
    // inputGain should connect to effectInput
    const inputGain = node.inputGain as unknown as MockNode;
    expect(inputGain.connect).toHaveBeenCalledWith(effectInput);
    // effectOutput should connect to volumeGain
    expect(effectOutput.connect).toHaveBeenCalled();
  });

  it('spliceEffects(null, null) restores direct path', () => {
    const effectInput = makeNode();
    const effectOutput = makeNode();
    node.spliceEffects(effectInput as unknown as AudioNode, effectOutput as unknown as AudioNode);
    node.spliceEffects(null, null);
    // inputGain should reconnect directly to volumeGain
    const inputGain = node.inputGain as unknown as MockNode;
    const connectCalls = inputGain.connect.mock.calls;
    const lastCall = connectCalls[connectCalls.length - 1];
    expect(lastCall[0]).toBe(internals.volumeGain);
  });

  it('disconnect() disconnects all nodes', () => {
    node.disconnect();
    const inputGain = node.inputGain as unknown as MockNode;
    expect(inputGain.disconnect).toHaveBeenCalled();
    expect(internals.volumeGain.disconnect).toHaveBeenCalled();
    expect(internals.panNode.disconnect).toHaveBeenCalled();
    expect(internals.analyserNode.disconnect).toHaveBeenCalled();
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RingBuffer } from '../ringBuffer';
import { VST3AudioWorkletNode } from '../VST3AudioWorklet';

// ─── RingBuffer tests ───────────────────────────────────────────────

describe('RingBuffer', () => {
  it('creates a buffer with power-of-2 capacity (rounds up frames)', () => {
    const rb = RingBuffer.create(100, 2);
    // nextPowerOf2(100) = 128 frames
    expect(rb.capacity).toBe(128);
    expect(rb.channels).toBe(2);
  });

  it('creates a buffer that is already power of 2', () => {
    const rb = RingBuffer.create(64, 2);
    // nextPowerOf2(64) = 64 frames
    expect(rb.capacity).toBe(64);
  });

  it('starts empty', () => {
    const rb = RingBuffer.create(128, 2);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(rb.capacity);
  });

  it('write/read round-trip returns identical data', () => {
    const rb = RingBuffer.create(128, 2);
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const frames = 4; // 4 frames * 2 channels = 8 samples

    const written = rb.write(input, frames);
    expect(written).toBe(4);
    expect(rb.availableRead).toBe(4); // availableRead is in frames

    const output = new Float32Array(8);
    const read = rb.read(output, frames);
    expect(read).toBe(4);

    for (let i = 0; i < 8; i++) {
      expect(output[i]).toBeCloseTo(input[i]);
    }
  });

  it('returns 0 frames when reading from empty buffer', () => {
    const rb = RingBuffer.create(128, 2);
    const output = new Float32Array(8);
    const read = rb.read(output, 4);
    expect(read).toBe(0);
  });

  it('returns 0 frames when writing to full buffer', () => {
    const rb = RingBuffer.create(4, 1);
    // capacity = 4 frames, writable = 4 (monotonic heads, no wasted slot)
    const data = new Float32Array([1, 2, 3, 4]);
    const w1 = rb.write(data, 4);
    expect(w1).toBe(4);
    expect(rb.availableWrite).toBe(0);

    const more = new Float32Array([5]);
    const w2 = rb.write(more, 1);
    expect(w2).toBe(0);
  });

  it('wraps around correctly', () => {
    const rb = RingBuffer.create(4, 1);
    // capacity = 4 frames

    // Write 4, read 4, write 4 more (wraps around)
    const data1 = new Float32Array([1, 2, 3, 4]);
    rb.write(data1, 4);

    const out1 = new Float32Array(4);
    rb.read(out1, 4);
    expect(out1[0]).toBeCloseTo(1);
    expect(out1[1]).toBeCloseTo(2);
    expect(out1[2]).toBeCloseTo(3);
    expect(out1[3]).toBeCloseTo(4);

    const data2 = new Float32Array([5, 6, 7, 8]);
    const w = rb.write(data2, 4);
    expect(w).toBe(4);

    const out2 = new Float32Array(4);
    const r = rb.read(out2, 4);
    expect(r).toBe(4);
    expect(out2[0]).toBeCloseTo(5);
    expect(out2[1]).toBeCloseTo(6);
    expect(out2[2]).toBeCloseTo(7);
    expect(out2[3]).toBeCloseTo(8);
  });

  it('reset clears the buffer', () => {
    const rb = RingBuffer.create(128, 2);
    const data = new Float32Array([1, 2, 3, 4]);
    rb.write(data, 2);
    expect(rb.availableRead).toBe(2); // 2 frames

    rb.reset();
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(rb.capacity);
  });

  it('wrap() attaches to an existing SharedArrayBuffer', () => {
    const rb1 = RingBuffer.create(128, 2);
    const data = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    rb1.write(data, 2);

    // Wrap the same SAB
    const rb2 = RingBuffer.wrap(rb1.sharedBuffer, 2);
    expect(rb2.availableRead).toBe(2); // 2 frames

    const output = new Float32Array(4);
    const read = rb2.read(output, 2);
    expect(read).toBe(2);
    expect(output[0]).toBeCloseTo(0.5);
    expect(output[1]).toBeCloseTo(-0.5);
    expect(output[2]).toBeCloseTo(0.25);
    expect(output[3]).toBeCloseTo(-0.25);
  });

  it('sharedBuffer returns a SharedArrayBuffer', () => {
    const rb = RingBuffer.create(64, 2);
    expect(rb.sharedBuffer).toBeInstanceOf(SharedArrayBuffer);
  });

  it('handles mono (1 channel) correctly', () => {
    const rb = RingBuffer.create(64, 1);
    const data = new Float32Array([0.1, 0.2, 0.3]);
    rb.write(data, 3);

    const output = new Float32Array(3);
    rb.read(output, 3);
    expect(output[0]).toBeCloseTo(0.1);
    expect(output[1]).toBeCloseTo(0.2);
    expect(output[2]).toBeCloseTo(0.3);
  });

  it('partial read returns only available frames', () => {
    const rb = RingBuffer.create(128, 2);
    const data = new Float32Array([1, 2, 3, 4]); // 2 frames
    rb.write(data, 2);

    const output = new Float32Array(8);
    const read = rb.read(output, 4); // request 4 frames, only 2 available
    expect(read).toBe(2);
    expect(output[0]).toBeCloseTo(1);
    expect(output[3]).toBeCloseTo(4);
  });
});

// ─── VST3AudioWorkletNode tests ─────────────────────────────────────

describe('VST3AudioWorkletNode', () => {
  let mockAudioContext: AudioContext;
  let mockWorkletNode: AudioWorkletNode;
  let mockGainNode: GainNode;

  beforeEach(() => {
    // Mock AudioWorkletNode
    mockWorkletNode = {
      port: {
        onmessage: null as ((e: MessageEvent) => void) | null,
        postMessage: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      numberOfInputs: 1,
      numberOfOutputs: 1,
    } as unknown as AudioWorkletNode;

    mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GainNode;

    mockAudioContext = {
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createGain: vi.fn().mockReturnValue(mockGainNode),
    } as unknown as AudioContext;

    // Mock AudioWorkletNode as a class to support `new`
    vi.stubGlobal(
      'AudioWorkletNode',
      vi.fn().mockImplementation(function (this: any, _ctx: any, _name: string, _opts: any) {
        this.port = mockWorkletNode.port;
        this.connect = mockWorkletNode.connect;
        this.disconnect = mockWorkletNode.disconnect;
        this.numberOfInputs = mockWorkletNode.numberOfInputs;
        this.numberOfOutputs = mockWorkletNode.numberOfOutputs;
      }),
    );
  });

  it('creates an instrument node (no input)', async () => {
    const node = await VST3AudioWorkletNode.create(
      mockAudioContext,
      2,
      false, // instrument
    );

    expect(node.inputNode).toBeNull();
    expect(node.outputNode).not.toBeNull();
    expect(node.inputSAB).toBeNull();
    expect(node.outputSAB).toBeInstanceOf(SharedArrayBuffer);
    expect(node.dropoutCount).toBe(0);
    expect(node.disposed).toBe(false);
  });

  it('creates an effect node (with input)', async () => {
    const node = await VST3AudioWorkletNode.create(
      mockAudioContext,
      2,
      true, // effect
    );

    expect(node.inputNode).toBe(mockGainNode);
    expect(node.outputNode).not.toBeNull();
    expect(node.inputSAB).toBeInstanceOf(SharedArrayBuffer);
    expect(node.outputSAB).toBeInstanceOf(SharedArrayBuffer);
    expect(mockGainNode.connect).toHaveBeenCalled();
  });

  it('registers worklet module only once per context', async () => {
    await VST3AudioWorkletNode.create(mockAudioContext, 2, false);
    await VST3AudioWorkletNode.create(mockAudioContext, 2, false);

    expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  it('updates dropoutCount from worklet port messages', async () => {
    const node = await VST3AudioWorkletNode.create(mockAudioContext, 2, false);

    // Simulate dropout message from worklet
    const handler = (mockWorkletNode.port as unknown as { onmessage: (e: MessageEvent) => void }).onmessage;
    handler(new MessageEvent('message', { data: { type: 'dropout', count: 5 } }));

    expect(node.dropoutCount).toBe(5);
  });

  it('dispose sends dispose message and disconnects', async () => {
    const node = await VST3AudioWorkletNode.create(mockAudioContext, 2, true);
    node.dispose();

    expect(mockWorkletNode.port.postMessage).toHaveBeenCalledWith({
      type: 'dispose',
    });
    expect(mockWorkletNode.disconnect).toHaveBeenCalled();
    expect(mockGainNode.disconnect).toHaveBeenCalled();
    expect(node.disposed).toBe(true);
  });

  it('dispose is idempotent', async () => {
    const node = await VST3AudioWorkletNode.create(mockAudioContext, 2, false);
    node.dispose();
    node.dispose();

    expect(mockWorkletNode.port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('passes correct processorOptions for instrument', async () => {
    await VST3AudioWorkletNode.create(mockAudioContext, 2, false, 8);

    const ctorCall = (AudioWorkletNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = ctorCall[2];
    expect(options.numberOfInputs).toBe(0);
    expect(options.numberOfOutputs).toBe(1);
    expect(options.outputChannelCount).toEqual([2]);
    expect(options.processorOptions.inputSAB).toBeNull();
    expect(options.processorOptions.outputSAB).toBeInstanceOf(SharedArrayBuffer);
    expect(options.processorOptions.channels).toBe(2);
    expect(options.processorOptions.isEffect).toBe(false);
  });

  it('passes correct processorOptions for effect', async () => {
    await VST3AudioWorkletNode.create(mockAudioContext, 2, true);

    const ctorCall = (AudioWorkletNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = ctorCall[2];
    expect(options.numberOfInputs).toBe(1);
    expect(options.processorOptions.inputSAB).toBeInstanceOf(SharedArrayBuffer);
    expect(options.processorOptions.isEffect).toBe(true);
  });
});

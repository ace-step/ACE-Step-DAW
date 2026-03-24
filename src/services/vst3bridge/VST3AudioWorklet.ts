/**
 * TypeScript wrapper around the VST3 AudioWorklet processor.
 *
 * Manages creation of SharedArrayBuffer ring buffers and the AudioWorkletNode
 * that bridges audio between the Web Audio graph and the companion app.
 */

import { RingBuffer } from './ringBuffer';

/** Default ring buffer depth in blocks (128 samples each). */
const DEFAULT_BUFFER_DEPTH = 4;

/** Web Audio standard block size. */
const BLOCK_SIZE = 128;

/** Track whether the worklet module has been registered on a given AudioContext. */
const registeredContexts = new WeakSet<AudioContext>();

/**
 * Wrapper for a VST3 AudioWorklet node that manages ring buffers
 * and provides a clean API for connecting to the audio graph.
 */
export class VST3AudioWorkletNode {
  private readonly _node: AudioWorkletNode;
  private readonly _inputGain: GainNode | null;
  private readonly _inputRingBuffer: RingBuffer | null;
  private readonly _outputRingBuffer: RingBuffer;
  private _dropoutCount = 0;
  private _disposed = false;

  private constructor(
    node: AudioWorkletNode,
    inputGain: GainNode | null,
    inputRingBuffer: RingBuffer | null,
    outputRingBuffer: RingBuffer,
  ) {
    this._node = node;
    this._inputGain = inputGain;
    this._inputRingBuffer = inputRingBuffer;
    this._outputRingBuffer = outputRingBuffer;

    // Listen for dropout messages from the worklet
    this._node.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'dropout') {
        this._dropoutCount = e.data.count;
      }
    };
  }

  /**
   * Create and connect the AudioWorklet node for a VST3 plugin instance.
   *
   * @param ctx - The AudioContext to use
   * @param channels - Number of audio channels (typically 2 for stereo)
   * @param isEffect - True for effect plugins (have audio input), false for instruments
   * @param bufferDepth - Ring buffer depth in blocks (default 4)
   */
  static async create(
    ctx: AudioContext,
    channels: number,
    isEffect: boolean,
    bufferDepth: number = DEFAULT_BUFFER_DEPTH,
  ): Promise<VST3AudioWorkletNode> {
    // Register the worklet module if not already done for this context
    if (!registeredContexts.has(ctx)) {
      await ctx.audioWorklet.addModule('/vst3-worklet-processor.js');
      registeredContexts.add(ctx);
    }

    const bufferFrames = BLOCK_SIZE * bufferDepth;

    // Create ring buffers
    const outputRingBuffer = RingBuffer.create(bufferFrames, channels);
    let inputRingBuffer: RingBuffer | null = null;

    if (isEffect) {
      inputRingBuffer = RingBuffer.create(bufferFrames, channels);
    }

    // Create the AudioWorkletNode
    const node = new AudioWorkletNode(ctx, 'vst3-worklet-processor', {
      numberOfInputs: isEffect ? 1 : 0,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
      processorOptions: {
        inputSAB: inputRingBuffer?.sharedBuffer ?? null,
        outputSAB: outputRingBuffer.sharedBuffer,
        channels,
        isEffect,
      },
    });

    // For effects, create a GainNode as the input connection point
    let inputGain: GainNode | null = null;
    if (isEffect) {
      inputGain = ctx.createGain();
      inputGain.gain.value = 1;
      inputGain.connect(node);
    }

    return new VST3AudioWorkletNode(node, inputGain, inputRingBuffer, outputRingBuffer);
  }

  /**
   * The AudioNode to connect as input (for effects). Null for instruments.
   */
  get inputNode(): AudioNode | null {
    return this._inputGain;
  }

  /**
   * The AudioNode output. Connect this to downstream nodes (e.g., destination).
   */
  get outputNode(): AudioNode {
    return this._node;
  }

  /**
   * SharedArrayBuffer for the output ring buffer.
   * Main thread writes companion-processed audio here; worklet reads it.
   */
  get outputSAB(): SharedArrayBuffer {
    return this._outputRingBuffer.sharedBuffer;
  }

  /**
   * SharedArrayBuffer for the input ring buffer.
   * Worklet writes input audio here; main thread reads it for the companion.
   * Null for instrument plugins.
   */
  get inputSAB(): SharedArrayBuffer | null {
    return this._inputRingBuffer?.sharedBuffer ?? null;
  }

  /**
   * Number of dropout events (output ring buffer underruns).
   */
  get dropoutCount(): number {
    return this._dropoutCount;
  }

  /**
   * Whether this node has been disposed.
   */
  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Dispose the worklet node and clean up ring buffers.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // Tell the worklet processor to stop
    this._node.port.postMessage({ type: 'dispose' });

    // Disconnect audio graph
    if (this._inputGain) {
      this._inputGain.disconnect();
    }
    this._node.disconnect();

    // Reset ring buffers
    this._outputRingBuffer.reset();
    this._inputRingBuffer?.reset();
  }
}

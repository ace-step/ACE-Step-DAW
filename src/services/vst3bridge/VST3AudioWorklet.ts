/**
 * VST3 Audio Worklet node wrapper — stub.
 *
 * The real implementation (a future work item) registers an
 * AudioWorkletProcessor that shuttles samples between ring buffers
 * and the Web Audio graph. This file defines the public API so the
 * adapter can reference it.
 */

import type { RingBuffer } from './ringBuffer';

/** Options passed when constructing the worklet node. */
export interface VST3AudioWorkletNodeOptions {
  /** Number of input channels (0 for instruments). */
  inputChannels: number;
  /** Number of output channels. */
  outputChannels: number;
  /** Ring buffer for audio coming FROM the worklet (captured input). */
  inputRingBuffer: RingBuffer;
  /** Ring buffer for audio going TO the worklet (processed output). */
  outputRingBuffer: RingBuffer;
}

/**
 * Thin wrapper around an AudioWorkletNode that reads/writes ring buffers.
 */
export interface VST3AudioWorkletNode {
  /** The underlying AudioWorkletNode — connect to Web Audio graph. */
  readonly node: AudioWorkletNode;
  /** Dispose the worklet node and release resources. */
  dispose(): void;
}

/**
 * Create a VST3AudioWorkletNode.
 *
 * Stub — returns a placeholder. The real factory will register the
 * worklet processor and return a live node.
 */
export async function createVST3AudioWorkletNode(
  _ctx: AudioContext,
  _options: VST3AudioWorkletNodeOptions,
): Promise<VST3AudioWorkletNode> {
  throw new Error('VST3AudioWorkletNode: not yet implemented');
}

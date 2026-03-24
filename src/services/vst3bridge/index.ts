/**
 * VST3 Bridge — public API.
 */

export { VST3PluginAdapter } from './VST3PluginAdapter';
export { VST3BridgeClient } from './VST3BridgeClient';
export type { BridgeEvents } from './VST3BridgeClient';
export type {
  VST3PluginInfo,
  VST3ParamInfo,
  InstantiatedMessage,
  InstantiatedResponse,
  VST3MidiEvent,
  AudioFrame,
} from './VST3BridgeProtocol';
export { VST3AudioWorkletNode } from './VST3AudioWorklet';
export { RingBuffer, createRingBuffer } from './ringBuffer';
export type { W9RingBuffer } from './ringBuffer';

/**
 * VST3 Bridge Client — stub interface.
 *
 * The real implementation (a future work item) manages a WebSocket
 * connection to the companion desktop app. This file defines the
 * public API so that VST3PluginAdapter can be developed and tested
 * against a stable contract.
 */

import type { VST3MidiEvent, AudioFrame } from './VST3BridgeProtocol';

/** Events emitted by the bridge client. */
export interface BridgeEvents {
  param_changed: (instanceId: string, paramId: number, value: number) => void;
  audio_frame: (frame: AudioFrame) => void;
  disconnected: () => void;
}

/**
 * Minimal interface that VST3PluginAdapter depends on.
 *
 * A concrete WebSocket-based implementation will be provided in a
 * separate work item.
 */
export interface VST3BridgeClient {
  /** Register a listener for a bridge event. */
  on<K extends keyof BridgeEvents>(event: K, callback: BridgeEvents[K]): void;

  /** Remove a previously registered listener. */
  off<K extends keyof BridgeEvents>(event: K, callback: BridgeEvents[K]): void;

  /** Send a parameter change to the companion. */
  setParam(instanceId: string, paramId: number, value: number): void;

  /** Send MIDI events to the companion. */
  sendMidi(instanceId: string, events: VST3MidiEvent[]): void;

  /** Send an audio frame to the companion for processing. */
  sendAudioFrame(frame: AudioFrame): void;

  /** Request the companion to open the native plugin editor window. */
  openEditor(instanceId: string): Promise<{ width: number; height: number }>;

  /** Request serialised plugin state (preset) from the companion. */
  getState(instanceId: string): Promise<string>;

  /** Send serialised plugin state to the companion to restore. */
  setState(instanceId: string, data: string): Promise<void>;

  /** Destroy a plugin instance on the companion side. */
  destroy(instanceId: string): void;
}

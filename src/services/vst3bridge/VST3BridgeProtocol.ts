/**
 * VST3 Bridge Protocol Types
 *
 * Defines the wire protocol between the browser DAW and the local
 * VST3 companion app communicating over WebSocket.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default WebSocket port for the companion app. */
export const VST3_BRIDGE_PORT = 9851;

/** Protocol version string sent during handshake. */
export const VST3_BRIDGE_VERSION = '1.0';

/**
 * Binary audio frame header size in bytes.
 * Layout: instanceIdHash(u32) + seq(u32) + channels(u32) + samplesPerChannel(u32)
 */
export const AUDIO_HEADER_SIZE = 16;

// ---------------------------------------------------------------------------
// Plugin metadata
// ---------------------------------------------------------------------------

/** Information about a discovered VST3 plugin. */
export interface VST3PluginInfo {
  uid: string;
  name: string;
  vendor: string;
  version: string;
  category: string;
  inputChannels: number;
  outputChannels: number;
  hasEditor: boolean;
  parameters: VST3ParamInfo[];
}

/** Metadata for a single automatable parameter. */
export interface VST3ParamInfo {
  id: number;
  name: string;
  units: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  stepCount: number;
}

/** A preset discovered inside a plugin. */
export interface VST3PresetInfo {
  name: string;
  category: string;
  path: string;
}

/** A single MIDI event to send to a plugin instance. */
export interface VST3MidiEvent {
  /** MIDI status byte (e.g. 0x90 = note-on ch0). */
  status: number;
  /** First data byte (e.g. note number). */
  data1: number;
  /** Second data byte (e.g. velocity). */
  data2: number;
  /** Sample offset within the current processing block. */
  sampleOffset?: number;
}

// ---------------------------------------------------------------------------
// Browser -> Companion messages
// ---------------------------------------------------------------------------

export interface HelloMessage {
  type: 'hello';
  reqId?: string;
  version: string;
  sampleRate: number;
  blockSize: number;
}

export interface ScanPluginsMessage {
  type: 'scan_plugins';
  reqId?: string;
}

export interface InstantiateMessage {
  type: 'instantiate';
  reqId?: string;
  pluginUid: string;
  instanceId: string;
}

export interface SetParamMessage {
  type: 'set_param';
  reqId?: string;
  instanceId: string;
  paramId: number;
  value: number;
}

export interface MidiMessage {
  type: 'midi';
  reqId?: string;
  instanceId: string;
  events: VST3MidiEvent[];
}

export interface OpenEditorMessage {
  type: 'open_editor';
  reqId?: string;
  instanceId: string;
}

export interface CloseEditorMessage {
  type: 'close_editor';
  reqId?: string;
  instanceId: string;
}

export interface GetStateMessage {
  type: 'get_state';
  reqId?: string;
  instanceId: string;
}

export interface SetStateMessage {
  type: 'set_state';
  reqId?: string;
  instanceId: string;
  data: string; // base64
}

export interface LoadPresetMessage {
  type: 'load_preset';
  reqId?: string;
  instanceId: string;
  presetPath: string;
}

export interface DestroyMessage {
  type: 'destroy';
  reqId?: string;
  instanceId: string;
}

export interface SetProcessingMessage {
  type: 'set_processing';
  reqId?: string;
  instanceId: string;
  active: boolean;
}

export interface GetLatencyMessage {
  type: 'get_latency';
  reqId?: string;
  instanceId: string;
}

export interface RouteSidechainMessage {
  type: 'route_sidechain';
  reqId?: string;
  instanceId: string;
  sourceInstanceId: string;
}

// ---------------------------------------------------------------------------
// Companion -> Browser messages
// ---------------------------------------------------------------------------

export interface HelloAckMessage {
  type: 'hello_ack';
  reqId?: string;
  version: string;
  companionVersion: string;
}

export interface ScanProgressMessage {
  type: 'scan_progress';
  reqId?: string;
  current: number;
  total: number;
  pluginName: string;
}

export interface ScanCompleteMessage {
  type: 'scan_complete';
  reqId?: string;
  plugins: VST3PluginInfo[];
}

export interface InstantiatedMessage {
  type: 'instantiated';
  reqId?: string;
  instanceId: string;
  pluginInfo: VST3PluginInfo;
}

export interface ParamChangedMessage {
  type: 'param_changed';
  reqId?: string;
  instanceId: string;
  paramId: number;
  value: number;
}

export interface EditorOpenedMessage {
  type: 'editor_opened';
  reqId?: string;
  instanceId: string;
  width: number;
  height: number;
}

export interface EditorClosedMessage {
  type: 'editor_closed';
  reqId?: string;
  instanceId: string;
}

export interface StateDataMessage {
  type: 'state_data';
  reqId?: string;
  instanceId: string;
  data: string; // base64
}

export interface LatencyInfoMessage {
  type: 'latency_info';
  reqId?: string;
  instanceId: string;
  latencySamples: number;
}

export interface ErrorMessage {
  type: 'error';
  reqId?: string;
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Any message sent from the browser to the companion. */
export type BrowserToCompanionMessage =
  | HelloMessage
  | ScanPluginsMessage
  | InstantiateMessage
  | SetParamMessage
  | MidiMessage
  | OpenEditorMessage
  | CloseEditorMessage
  | GetStateMessage
  | SetStateMessage
  | LoadPresetMessage
  | DestroyMessage
  | SetProcessingMessage
  | GetLatencyMessage
  | RouteSidechainMessage;

/** Any message sent from the companion to the browser. */
export type CompanionToBrowserMessage =
  | HelloAckMessage
  | ScanProgressMessage
  | ScanCompleteMessage
  | InstantiatedMessage
  | ParamChangedMessage
  | EditorOpenedMessage
  | EditorClosedMessage
  | StateDataMessage
  | LatencyInfoMessage
  | ErrorMessage;

/** Any message that can cross the bridge. */
export type VST3BridgeMessage =
  | BrowserToCompanionMessage
  | CompanionToBrowserMessage;

// ---------------------------------------------------------------------------
// Binary audio frame helpers
// ---------------------------------------------------------------------------

/**
 * Encode audio channel data into a single ArrayBuffer with a fixed header.
 *
 * Layout (little-endian):
 *   [0..3]   u32  instanceIdHash
 *   [4..7]   u32  seq
 *   [8..11]  u32  channels
 *   [12..15] u32  samplesPerChannel
 *   [16..]   f32[] interleaved sample data (ch0 then ch1 ...)
 */
export function encodeAudioFrame(
  instanceIdHash: number,
  seq: number,
  channels: number,
  samples: Float32Array[],
): ArrayBuffer {
  const samplesPerChannel = samples[0]?.length ?? 0;
  const bodyBytes = channels * samplesPerChannel * 4;
  const buf = new ArrayBuffer(AUDIO_HEADER_SIZE + bodyBytes);
  const view = new DataView(buf);

  view.setUint32(0, instanceIdHash, true);
  view.setUint32(4, seq, true);
  view.setUint32(8, channels, true);
  view.setUint32(12, samplesPerChannel, true);

  const body = new Float32Array(buf, AUDIO_HEADER_SIZE);
  for (let ch = 0; ch < channels; ch++) {
    body.set(samples[ch], ch * samplesPerChannel);
  }

  return buf;
}

/**
 * Decode a binary audio frame received from the companion.
 *
 * Returns the header fields plus an array of per-channel Float32Arrays.
 */
export function decodeAudioFrame(buf: ArrayBuffer): {
  instanceIdHash: number;
  seq: number;
  channels: number;
  samples: Float32Array[];
} {
  const view = new DataView(buf);
  const instanceIdHash = view.getUint32(0, true);
  const seq = view.getUint32(4, true);
  const channels = view.getUint32(8, true);
  const samplesPerChannel = view.getUint32(12, true);

  const body = new Float32Array(buf, AUDIO_HEADER_SIZE);
  const samples: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    samples.push(body.slice(ch * samplesPerChannel, (ch + 1) * samplesPerChannel));
  }

  return { instanceIdHash, seq, channels, samples };
}

// ---------------------------------------------------------------------------
// FNV-1a hash helper
// ---------------------------------------------------------------------------

/**
 * Compute a 32-bit FNV-1a hash of the given string.
 *
 * Used to convert human-readable instance IDs into the compact u32 used
 * in binary audio frame headers.
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // ensure unsigned 32-bit
}

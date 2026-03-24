/**
 * VST3 Bridge Protocol — WebSocket message types between browser and companion app.
 *
 * Defines every message in the protocol, data models for plugins/parameters/presets,
 * binary audio frame helpers, and type guards for runtime validation.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default WebSocket port for the VST3 companion app. */
export const VST3_BRIDGE_PORT = 9851;

/** Protocol version string used in the handshake. */
export const VST3_BRIDGE_VERSION = '1.0';

/** Size in bytes of the binary audio frame header. */
export const AUDIO_HEADER_SIZE = 16;

// ─── Data Models ────────────────────────────────────────────────────────────

/** Metadata for a scanned VST3 plugin. */
export interface VST3PluginInfo {
  /** Unique plugin identifier from the VST3 binary. */
  uid: string;
  /** Human-readable plugin name. */
  name: string;
  /** Plugin vendor / manufacturer. */
  vendor: string;
  /** Top-level category. */
  category: 'instrument' | 'effect';
  /** Finer-grained subcategory (e.g. "Reverb", "Synth"). */
  subcategory: string;
  /** Number of audio input channels. */
  inputChannels: number;
  /** Number of audio output channels. */
  outputChannels: number;
  /** Whether the plugin provides a custom GUI editor. */
  hasEditor: boolean;
  /** Whether the plugin supports multiple output busses. */
  supportsMultiOutput: boolean;
  /** Descriptions of available output busses. */
  outputBusses: { name: string; channels: number }[];
}

/** Descriptor for a single automatable VST3 parameter. */
export interface VST3ParamInfo {
  /** Parameter ID as reported by the plugin. */
  id: number;
  /** Human-readable parameter name. */
  name: string;
  /** Minimum value. */
  min: number;
  /** Maximum value. */
  max: number;
  /** Default value. */
  default: number;
  /** Number of discrete steps (0 = continuous). */
  stepCount: number;
  /** Unit label (e.g. "dB", "Hz", "%"). */
  unitName: string;
}

/** Descriptor for a factory preset. */
export interface VST3PresetInfo {
  /** Preset ID / index. */
  id: number;
  /** Human-readable preset name. */
  name: string;
}

/** A single MIDI event sent to a plugin instance. */
export interface VST3MidiEvent {
  /** MIDI event type. */
  type: 'noteOn' | 'noteOff' | 'cc' | 'pitchBend';
  /** MIDI note number (noteOn / noteOff). */
  note?: number;
  /** Velocity value (noteOn / noteOff). */
  velocity?: number;
  /** Control-change number (cc). */
  cc?: number;
  /** Generic value (cc value or pitch-bend amount). */
  value?: number;
  /** Sample offset within the current processing block. */
  sampleOffset: number;
}

// ─── Browser → Companion Messages ───────────────────────────────────────────

/** Handshake initiation from browser. */
export interface HelloMessage {
  type: 'hello';
  version: string;
  sampleRate: number;
  blockSize: number;
}

/** Request a full plugin scan. */
export interface ScanPluginsMessage {
  type: 'scan_plugins';
}

/** Request to instantiate a plugin. */
export interface InstantiateMessage {
  type: 'instantiate';
  reqId: string;
  pluginUid: string;
  instanceId: string;
}

/** Set a parameter value on a plugin instance. */
export interface SetParamMessage {
  type: 'set_param';
  instanceId: string;
  paramId: number;
  value: number;
}

/** Send MIDI events to a plugin instance. */
export interface MidiMessage {
  type: 'midi';
  instanceId: string;
  events: VST3MidiEvent[];
}

/** Request opening the plugin's native GUI editor. */
export interface OpenEditorMessage {
  type: 'open_editor';
  instanceId: string;
}

/** Request closing the plugin's native GUI editor. */
export interface CloseEditorMessage {
  type: 'close_editor';
  instanceId: string;
}

/** Request the full serialized state of a plugin instance. */
export interface GetStateMessage {
  type: 'get_state';
  instanceId: string;
}

/** Restore serialized state to a plugin instance. */
export interface SetStateMessage {
  type: 'set_state';
  instanceId: string;
  /** Base64-encoded plugin state blob. */
  data: string;
}

/** Load a factory preset by ID. */
export interface LoadPresetMessage {
  type: 'load_preset';
  instanceId: string;
  presetId: number;
}

/** Destroy a plugin instance and free resources. */
export interface DestroyMessage {
  type: 'destroy';
  instanceId: string;
}

/** Enable or disable audio processing on a plugin instance. */
export interface SetProcessingMessage {
  type: 'set_processing';
  instanceId: string;
  active: boolean;
}

/** Query the current processing latency of a plugin instance. */
export interface GetLatencyMessage {
  type: 'get_latency';
  instanceId: string;
}

/** Configure sidechain routing for a plugin instance. */
export interface RouteSidechainMessage {
  type: 'route_sidechain';
  instanceId: string;
  sidechainInputBus: number;
  sourceInstanceId: string;
}

// ─── Companion → Browser Messages ───────────────────────────────────────────

/** Handshake acknowledgement from companion. */
export interface HelloAckMessage {
  type: 'hello_ack';
  version: string;
  capabilities: string[];
}

/** Progress update during plugin scanning. */
export interface ScanProgressMessage {
  type: 'scan_progress';
  found: number;
  current: string;
}

/** Scan complete with full plugin list. */
export interface ScanCompleteMessage {
  type: 'scan_complete';
  plugins: VST3PluginInfo[];
}

/** Plugin instance created successfully. */
export interface InstantiatedMessage {
  type: 'instantiated';
  reqId: string;
  instanceId: string;
  parameters: VST3ParamInfo[];
  latencySamples: number;
  tailSamples: number;
  presets: VST3PresetInfo[];
}

/** A parameter value was changed (e.g. from the plugin GUI). */
export interface ParamChangedMessage {
  type: 'param_changed';
  instanceId: string;
  paramId: number;
  value: number;
}

/** Plugin editor window opened. */
export interface EditorOpenedMessage {
  type: 'editor_opened';
  instanceId: string;
  width: number;
  height: number;
}

/** Plugin editor window closed. */
export interface EditorClosedMessage {
  type: 'editor_closed';
  instanceId: string;
}

/** Serialized plugin state (base64). */
export interface StateDataMessage {
  type: 'state_data';
  instanceId: string;
  /** Base64-encoded plugin state blob. */
  data: string;
}

/** Latency information for a plugin instance. */
export interface LatencyInfoMessage {
  type: 'latency_info';
  instanceId: string;
  samples: number;
}

/** Error response from the companion. */
export interface ErrorMessage {
  type: 'error';
  reqId?: string;
  instanceId?: string;
  code: string;
  message: string;
}

// ─── Union Type ─────────────────────────────────────────────────────────────

/** Union of all possible VST3 Bridge protocol messages. */
export type VST3BridgeMessage =
  | HelloMessage
  | HelloAckMessage
  | ScanPluginsMessage
  | ScanProgressMessage
  | ScanCompleteMessage
  | InstantiateMessage
  | InstantiatedMessage
  | SetParamMessage
  | ParamChangedMessage
  | MidiMessage
  | OpenEditorMessage
  | EditorOpenedMessage
  | CloseEditorMessage
  | EditorClosedMessage
  | GetStateMessage
  | StateDataMessage
  | SetStateMessage
  | LoadPresetMessage
  | DestroyMessage
  | SetProcessingMessage
  | GetLatencyMessage
  | LatencyInfoMessage
  | RouteSidechainMessage
  | ErrorMessage;

// ─── Valid Message Types ────────────────────────────────────────────────────

/** Set of all valid message type strings for runtime validation. */
const VALID_MESSAGE_TYPES = new Set<string>([
  'hello',
  'hello_ack',
  'scan_plugins',
  'scan_progress',
  'scan_complete',
  'instantiate',
  'instantiated',
  'set_param',
  'param_changed',
  'midi',
  'open_editor',
  'editor_opened',
  'close_editor',
  'editor_closed',
  'get_state',
  'state_data',
  'set_state',
  'load_preset',
  'destroy',
  'set_processing',
  'get_latency',
  'latency_info',
  'route_sidechain',
  'error',
]);

// ─── Type Guard ─────────────────────────────────────────────────────────────

/**
 * Runtime type guard that checks whether an unknown value is a valid VST3BridgeMessage.
 * Validates that the value is a non-null object with a recognised `type` field.
 */
export function isVST3BridgeMessage(msg: unknown): msg is VST3BridgeMessage {
  if (msg === null || msg === undefined || typeof msg !== 'object') {
    return false;
  }
  const obj = msg as Record<string, unknown>;
  return typeof obj.type === 'string' && VALID_MESSAGE_TYPES.has(obj.type);
}

// ─── FNV-1a Hash ────────────────────────────────────────────────────────────

/**
 * Compute a 32-bit FNV-1a hash of a string.
 * Used to convert instance UUID strings into compact uint32 identifiers
 * for the binary audio frame header.
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime multiply — use Math.imul for correct 32-bit multiply
    hash = Math.imul(hash, 0x01000193);
  }
  // Return as unsigned 32-bit integer
  return hash >>> 0;
}

// ─── Binary Audio Frame Helpers ─────────────────────────────────────────────

/**
 * Encode audio samples into a binary frame with a 16-byte header.
 *
 * Header layout (16 bytes, little-endian):
 *   [0..3]   uint32  instanceIdHash  (FNV-1a of the instance UUID)
 *   [4..7]   uint32  sequenceNumber
 *   [8..11]  uint32  numChannels
 *   [12..15] uint32  numSamples (per channel)
 *
 * Body: float32[] interleaved audio (channel-first: all samples of ch0, then ch1, ...).
 *
 * @param instanceIdHash - FNV-1a hash of the instance UUID.
 * @param seq - Monotonically increasing sequence number.
 * @param channels - Number of audio channels.
 * @param samples - Array of Float32Arrays, one per channel.
 * @returns An ArrayBuffer containing the complete frame.
 */
export function encodeAudioFrame(
  instanceIdHash: number,
  seq: number,
  channels: number,
  samples: Float32Array[],
): ArrayBuffer {
  const numSamples = samples.length > 0 ? samples[0].length : 0;
  const bodyBytes = channels * numSamples * 4; // float32 = 4 bytes
  const buffer = new ArrayBuffer(AUDIO_HEADER_SIZE + bodyBytes);
  const view = new DataView(buffer);

  // Write header (little-endian)
  view.setUint32(0, instanceIdHash, true);
  view.setUint32(4, seq, true);
  view.setUint32(8, channels, true);
  view.setUint32(12, numSamples, true);

  // Write interleaved body (channel-first layout)
  const body = new Float32Array(buffer, AUDIO_HEADER_SIZE);
  for (let ch = 0; ch < channels; ch++) {
    body.set(samples[ch], ch * numSamples);
  }

  return buffer;
}

/**
 * Decode a binary audio frame into its header fields and per-channel sample arrays.
 *
 * @param buffer - The raw ArrayBuffer received over WebSocket.
 * @returns Parsed header fields and an array of Float32Arrays (one per channel).
 */
export function decodeAudioFrame(buffer: ArrayBuffer): {
  instanceIdHash: number;
  seq: number;
  channels: number;
  samples: Float32Array[];
} {
  const view = new DataView(buffer);

  const instanceIdHash = view.getUint32(0, true);
  const seq = view.getUint32(4, true);
  const channels = view.getUint32(8, true);
  const numSamples = view.getUint32(12, true);

  const body = new Float32Array(buffer, AUDIO_HEADER_SIZE);
  const samplesOut: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    samplesOut.push(body.slice(ch * numSamples, (ch + 1) * numSamples));
  }

  return { instanceIdHash, seq, channels, samples: samplesOut };
}

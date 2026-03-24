/**
 * VST3 Bridge Protocol types.
 *
 * Defines the message format between the DAW (browser) and the
 * companion desktop app that hosts VST3 plugins.
 */

// ─── Plugin Discovery ───────────────────────────────────────────────────────

/** Information about an installed VST3 plugin reported by the companion. */
export interface VST3PluginInfo {
  /** Unique VST3 class ID (UID). */
  uid: string;
  /** Human-readable name. */
  name: string;
  /** Vendor / manufacturer. */
  vendor: string;
  /** Plugin category as reported by the VST3 SDK. */
  category: 'instrument' | 'effect' | 'other';
  /** Number of audio input channels (0 for instruments). */
  audioInputs: number;
  /** Number of audio output channels. */
  audioOutputs: number;
}

// ─── Parameter Info ─────────────────────────────────────────────────────────

/** VST3 parameter information returned after instantiation. */
export interface VST3ParamInfo {
  /** Numeric parameter ID used by the VST3 SDK. */
  id: number;
  /** Human-readable parameter name. */
  title: string;
  /** Short label (e.g., "dB", "ms"). */
  units: string;
  /** Minimum normalised value (usually 0). */
  min: number;
  /** Maximum normalised value (usually 1). */
  max: number;
  /** Default normalised value. */
  defaultValue: number;
  /** Step count (0 = continuous). */
  stepCount: number;
}

// ─── Instantiation ──────────────────────────────────────────────────────────

/** Response from the companion after successfully instantiating a plugin. */
export interface InstantiatedResponse {
  /** Unique instance ID assigned by the companion. */
  instanceId: string;
  /** Parameters exposed by the plugin. */
  parameters: VST3ParamInfo[];
  /** Latency in samples introduced by the plugin. */
  latencySamples: number;
}

// ─── MIDI ───────────────────────────────────────────────────────────────────

/** A single MIDI event sent to/from the companion. */
export interface VST3MidiEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  velocity: number;
  /** Sample offset within the current audio block. */
  sampleOffset: number;
}

// ─── Audio Frame ────────────────────────────────────────────────────────────

/** A block of interleaved Float32 audio samples exchanged over the bridge. */
export interface AudioFrame {
  /** Instance this frame belongs to. */
  instanceId: string;
  /** Interleaved sample data. */
  samples: Float32Array;
  /** Number of channels in the frame. */
  channels: number;
  /** Number of sample frames (samples.length / channels). */
  frameCount: number;
}

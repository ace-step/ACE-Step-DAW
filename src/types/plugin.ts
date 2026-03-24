/**
 * WAP (Web Audio Plugin) type definitions.
 *
 * Defines the standard interface for community-created instruments,
 * effects, and MIDI processors in ACE-Step DAW.
 */

// ─── Parameter Descriptors ──────────────────────────────────────────────────

export type PluginParamType = 'float' | 'int' | 'enum' | 'bool';

export interface PluginParamDescriptorBase<T extends PluginParamType> {
  id: string;
  name: string;
  type: T;
}

export interface FloatParamDescriptor extends PluginParamDescriptorBase<'float'> {
  min: number;
  max: number;
  defaultValue: number;
  step?: number;
}

export interface IntParamDescriptor extends PluginParamDescriptorBase<'int'> {
  min: number;
  max: number;
  defaultValue: number;
}

export interface EnumParamDescriptor extends PluginParamDescriptorBase<'enum'> {
  options: string[];
  defaultValue: string;
}

export interface BoolParamDescriptor extends PluginParamDescriptorBase<'bool'> {
  defaultValue: boolean;
}

export type PluginParamDescriptor =
  | FloatParamDescriptor
  | IntParamDescriptor
  | EnumParamDescriptor
  | BoolParamDescriptor;

/** Runtime parameter value — numeric for float/int/bool, string for enum. */
export type PluginParamValue = number | string | boolean;

/** A map of parameter ID → current value. */
export type PluginParamValues = Record<string, PluginParamValue>;

// ─── Plugin Types ───────────────────────────────────────────────────────────

export type PluginType = 'effect' | 'instrument' | 'midi-effect';

// ─── Plugin Interface ───────────────────────────────────────────────────────

/**
 * The core interface every WAP plugin must implement.
 *
 * Plugins are ES modules that export a class implementing this interface.
 * Effect plugins process audio (input → output).
 * Instrument plugins generate audio from MIDI events (no input, output only).
 */
export interface WAPPlugin {
  /** Human-readable name. */
  readonly name: string;
  /** Plugin type: effect, instrument, or midi-effect. */
  readonly pluginType: PluginType;
  /** Version string (semver). */
  readonly version: string;
  /** Author / creator name. */
  readonly author: string;
  /** Short description. */
  readonly description: string;

  /**
   * Create the audio processing nodes.
   * Called once when the plugin is loaded onto a track.
   * @param ctx - The AudioContext to create nodes in.
   * @returns An object with input/output AudioNodes (effects) or just output (instruments).
   */
  createAudioNode(ctx: AudioContext): PluginAudioNode;

  /**
   * Return the parameter descriptors for this plugin.
   * Called once at load time to build the parameter UI.
   */
  getParameterDescriptors(): PluginParamDescriptor[];

  /**
   * Set a parameter value at runtime.
   * @param paramId - The parameter ID from getParameterDescriptors().
   * @param value - The new value.
   */
  setParameter(paramId: string, value: PluginParamValue): void;

  /**
   * Get the current value of a parameter.
   */
  getParameter(paramId: string): PluginParamValue | undefined;

  /**
   * Get all current parameter values.
   */
  getParameters(): PluginParamValues;

  /**
   * For instrument plugins: handle a MIDI note-on event.
   */
  noteOn?(note: number, velocity: number, time?: number): void;

  /**
   * For instrument plugins: handle a MIDI note-off event.
   */
  noteOff?(note: number, time?: number): void;

  /**
   * For MIDI effect plugins: transform MIDI data.
   */
  processMidi?(events: MidiEvent[]): MidiEvent[];

  /**
   * Clean up all audio nodes and resources.
   */
  dispose(): void;
}

/** Audio node pair returned by plugin.createAudioNode(). */
export interface PluginAudioNode {
  /** Input node for effect plugins. Null for instrument plugins. */
  inputNode: AudioNode | null;
  /** Output node — all plugins must provide an output. */
  outputNode: AudioNode;
}

/** MIDI event for MIDI effect plugins. */
export interface MidiEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  velocity: number;
  time: number;
}

// ─── Plugin Manifest ────────────────────────────────────────────────────────

/** Metadata for a plugin in the registry. */
export interface PluginManifest {
  /** Unique plugin identifier (e.g., "ace-bitcrusher"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Plugin type. */
  pluginType: PluginType;
  /** Version string. */
  version: string;
  /** Author name. */
  author: string;
  /** Short description. */
  description: string;
  /** Parameter descriptors (populated after loading). */
  parameters: PluginParamDescriptor[];
}

// ─── Plugin Instance (Store State) ──────────────────────────────────────────

/** Serializable plugin instance state stored in the project. */
export interface PluginInstance {
  /** Unique instance ID (UUID). */
  id: string;
  /** Plugin manifest ID (e.g., "ace-bitcrusher"). */
  pluginId: string;
  /** Whether the plugin is enabled. */
  enabled: boolean;
  /** Current parameter values. */
  params: PluginParamValues;
  /** Plugin manifest snapshot for display. */
  manifest: PluginManifest;
}

// ─── VST3 Plugin Types ──────────────────────────────────────────────────────

/** Manifest for a VST3 plugin, extending the base PluginManifest. */
export interface VST3PluginManifest extends PluginManifest {
  /** VST3 unique component identifier. */
  vst3Uid: string;
  /** Plugin vendor name. */
  vendor: string;
  /** Latency introduced by the plugin in samples. */
  latencySamples: number;
  /** Output bus configuration. */
  outputBusses: { name: string; channels: number }[];
  /** Whether the plugin provides a GUI editor. */
  hasEditor: boolean;
  /** Discriminator to distinguish from base PluginManifest. */
  isVST3: true;
}

/** Info returned from a VST3 plugin scan (before registration). */
export interface VST3PluginInfo {
  /** VST3 unique component identifier. */
  uid: string;
  /** Human-readable name. */
  name: string;
  /** Plugin vendor name. */
  vendor: string;
  /** Plugin type. */
  pluginType: PluginType;
  /** Version string. */
  version: string;
  /** Short description. */
  description: string;
  /** Latency in samples. */
  latencySamples: number;
  /** Output bus configuration. */
  outputBusses: { name: string; channels: number }[];
  /** Whether the plugin provides a GUI editor. */
  hasEditor: boolean;
  /** Parameter descriptors. */
  parameters: PluginParamDescriptor[];
}

// ─── Plugin Factory ─────────────────────────────────────────────────────────

/**
 * A plugin factory function — the default export of a WAP plugin module.
 * Returns a new plugin instance.
 */
export type PluginFactory = () => WAPPlugin;

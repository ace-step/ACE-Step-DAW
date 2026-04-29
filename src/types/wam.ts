/**
 * WAM (Web Audio Module) 2.0 type definitions for ACE-Step DAW.
 *
 * Defines metadata, discovery catalog, and instance state for WAM plugins.
 */

// ─── WAM Plugin Descriptor ────────────────────────────────────────────────────

/** Metadata from a WAM plugin's descriptor.json */
export interface WAMPluginDescriptor {
  /** Unique identifier (vendor + name) */
  identifier: string;
  /** Human-readable name */
  name: string;
  /** Vendor / developer name */
  vendor: string;
  /** Version string */
  version: string;
  /** WAM API version */
  apiVersion: string;
  /** Short description */
  description: string;
  /** Whether the plugin is an instrument (true) or effect (false) */
  isInstrument: boolean;
  /** Thumbnail URL */
  thumbnail: string;
  /** Keywords for search/discovery */
  keywords: string[];
  /** Website URL */
  website: string;
  /** I/O capabilities */
  hasAudioInput: boolean;
  hasAudioOutput: boolean;
  hasMidiInput: boolean;
  hasMidiOutput: boolean;
}

// ─── WAM Plugin Catalog Entry ─────────────────────────────────────────────────

/** A plugin entry in the curated WAM plugin catalog. */
export interface WAMCatalogEntry {
  /** Unique identifier in the catalog */
  id: string;
  /** Human-readable name */
  name: string;
  /** Vendor name */
  vendor: string;
  /** Short description */
  description: string;
  /** Category: 'instrument' or 'effect' */
  category: 'instrument' | 'effect';
  /** Sub-category for filtering (e.g., 'delay', 'reverb', 'synth') */
  subcategory: string;
  /** URL to load the WAM plugin module from */
  url: string;
  /** Thumbnail/icon URL */
  thumbnail?: string;
  /** Tags for search */
  tags: string[];
}

// ─── WAM Parameter ────────────────────────────────────────────────────────────

/** WAM parameter info (from WamParameterInfo) */
export interface WAMParameterInfo {
  id: string;
  label: string;
  type: 'float' | 'int' | 'boolean' | 'choice';
  defaultValue: number;
  minValue: number;
  maxValue: number;
  discreteStep: number;
  exponent: number;
  /** For 'choice' type: list of option labels */
  choices?: string[];
}

/** WAM parameter data (current value) */
export interface WAMParameterData {
  id: string;
  value: number;
  normalized: boolean;
}

// ─── WAM Instance State ───────────────────────────────────────────────────────

/** State of an active WAM plugin instance in the store. */
export interface WAMActiveInstance {
  /** Unique instance ID */
  instanceId: string;
  /** Catalog entry ID or custom URL */
  pluginId: string;
  /** Plugin name */
  pluginName: string;
  /** Plugin vendor */
  vendor: string;
  /** Track this instance is loaded on */
  trackId: string;
  /** Whether the instance is enabled (not bypassed) */
  enabled: boolean;
  /** Parameter info from the plugin */
  parameters: WAMParameterInfo[];
  /** Current parameter values (actual range, non-normalized) */
  parameterValues: Record<string, number>;
  /** Saved preset name (if any) */
  activePreset: string | null;
  /** Available preset names */
  presets: string[];
  /** Whether the plugin has a custom GUI */
  hasGui: boolean;
  /** Whether the custom GUI is currently visible */
  guiVisible: boolean;
  /** Descriptor metadata */
  descriptor: WAMPluginDescriptor | null;
}

/** Serializable WAM preset */
export interface WAMPreset {
  /** Preset name */
  name: string;
  /** Plugin identifier this preset is for */
  pluginId: string;
  /** Parameter values (actual range, non-normalized) */
  parameterValues: Record<string, number>;
  /** Opaque state blob from the plugin (base64) */
  state?: string;
}

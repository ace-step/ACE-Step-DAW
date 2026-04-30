/** VST3 companion app connection status */
export type VST3ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Metadata for a scanned VST3 plugin */
export interface VST3PluginInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
  subcategory: string;
  /** 'instrument' or 'effect' */
  category: 'instrument' | 'effect';
}

/**
 * Alias kept for backwards compatibility with W9 stub code.
 * Prefer VST3PluginInfo for new code.
 */
export type VST3PluginDescriptor = VST3PluginInfo;

/**
 * Alias kept for backwards compatibility with W9 stub code.
 * Prefer VST3Parameter for new code.
 */
export type VST3ParamDescriptor = VST3Parameter;

/** A loaded VST3 plugin instance on a track */
export interface VST3ActiveInstance {
  instanceId: string;
  pluginId: string;
  pluginName: string;
  vendor: string;
  trackId: string;
  enabled: boolean;
  /** Whether the instance is currently reachable via the bridge. */
  online: boolean;
  parameters: VST3Parameter[];
  presets: string[];
  activePreset: string | null;
  /** Whether the plugin has a secondary (sidechain) input bus. */
  hasSidechainInput?: boolean;
  /** Track ID feeding the sidechain input, or null if none. */
  sidechainSourceTrackId?: string | null;
  /** Processing latency currently reported by the VST3 companion. */
  latencySamples?: number;
}

/** A single parameter exposed by a VST3 plugin */
export interface VST3Parameter {
  id: number;
  name: string;
  /** Normalised 0..1 for float, string index for enum */
  value: number;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  /** If non-empty this is an enum-style parameter */
  enumValues: string[];
  unit: string;
}

/** Scan progress reported by the companion */
export interface VST3ScanProgress {
  scanned: number;
  total: number;
  currentPlugin: string;
}

/** Companion app installation/update status */
export type CompanionAppStatus =
  | 'unknown'      // Haven't checked yet
  | 'not-installed' // Connection failed — likely not installed
  | 'outdated'     // Connected but version is below minimum
  | 'running'      // Connected and version is acceptable
  | 'not-running'; // Was previously connected but now disconnected

/** Download info for companion app per platform */
export interface CompanionDownloadInfo {
  platform: 'windows' | 'macos' | 'linux';
  label: string;
  url: string;
  fileSize: string;
}

/** Minimum required companion version */
export const MIN_COMPANION_VERSION = '1.0.0';

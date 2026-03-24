/** VST3 companion app connection status */
export type VST3ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

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

/** A loaded VST3 plugin instance on a track */
export interface VST3ActiveInstance {
  instanceId: string;
  pluginId: string;
  pluginName: string;
  vendor: string;
  trackId: string;
  enabled: boolean;
  parameters: VST3Parameter[];
  presets: string[];
  activePreset: string | null;
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

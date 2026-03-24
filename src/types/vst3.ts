/**
 * VST3 type definitions for companion app integration.
 *
 * These types define the protocol between the DAW and the local
 * companion app that hosts VST3 plugins via WebSocket bridge.
 */

// ─── Connection ─────────────────────────────────────────────────────────────

export type VST3ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ─── Plugin Descriptors ─────────────────────────────────────────────────────

/** Describes a VST3 plugin discovered by the companion app's scanner. */
export interface VST3PluginDescriptor {
  /** Unique plugin identifier (e.g., "com.vendor.PluginName"). */
  uid: string;
  /** Human-readable name. */
  name: string;
  /** Vendor / manufacturer. */
  vendor: string;
  /** Version string. */
  version: string;
  /** Plugin category (e.g., "Fx|EQ", "Instrument|Synth"). */
  category: string;
  /** Number of audio inputs. */
  audioInputs: number;
  /** Number of audio outputs. */
  audioOutputs: number;
}

/** Describes a single parameter on a VST3 plugin instance. */
export interface VST3ParamDescriptor {
  id: number;
  name: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  stepCount: number;
  units: string;
}

// ─── Plugin Instance State ──────────────────────────────────────────────────

/** Runtime state for a VST3 plugin instance on a track. */
export interface VST3PluginInstance {
  /** Unique instance ID (UUID, assigned by the DAW). */
  instanceId: string;
  /** The plugin descriptor UID. */
  pluginUid: string;
  /** Track ID this instance lives on. */
  trackId: string;
  /** Whether the plugin is currently bypassed. */
  bypassed: boolean;
  /** Parameter values (paramId -> normalized 0-1 value). */
  params: Record<number, number>;
  /** Whether the companion app has this instance loaded. */
  online: boolean;
}

// ─── Bridge Protocol Messages ───────────────────────────────────────────────

export interface VST3BridgeMessage {
  type: string;
  payload?: unknown;
}

export interface VST3ScanResultMessage extends VST3BridgeMessage {
  type: 'scanResult';
  payload: { plugins: VST3PluginDescriptor[] };
}

export interface VST3InstanceCreatedMessage extends VST3BridgeMessage {
  type: 'instanceCreated';
  payload: { instanceId: string; params: VST3ParamDescriptor[] };
}

export interface VST3ParamChangedMessage extends VST3BridgeMessage {
  type: 'paramChanged';
  payload: { instanceId: string; paramId: number; value: number };
}

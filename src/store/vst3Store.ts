/**
 * vst3Store — Zustand store for VST3 companion app state.
 *
 * Tracks connection status, scanned plugins, and active instances.
 */
import { create } from 'zustand';
import type { VST3ConnectionStatus, VST3PluginDescriptor, VST3PluginInstance } from '../types/vst3';

export interface VST3StoreState {
  /** Connection status to the companion app. */
  connectionStatus: VST3ConnectionStatus;
  /** Last connection error message. */
  connectionError: string | null;
  /** Companion app version string. */
  companionVersion: string | null;
  /** Available plugins from the last scan. */
  scannedPlugins: VST3PluginDescriptor[];
  /** Timestamp of the last successful scan. */
  lastScanTime: number | null;
  /** Active plugin instances keyed by instanceId. */
  instances: Record<string, VST3PluginInstance>;

  // ─── Actions ────────────────────────────────────────────────────────────

  setConnectionStatus: (status: VST3ConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  setCompanionVersion: (version: string | null) => void;
  setScannedPlugins: (plugins: VST3PluginDescriptor[]) => void;
  addInstance: (instance: VST3PluginInstance) => void;
  removeInstance: (instanceId: string) => void;
  updateInstanceParam: (instanceId: string, paramId: number, value: number) => void;
  setInstanceOnline: (instanceId: string, online: boolean) => void;
  markAllInstancesOffline: () => void;
}

export const useVST3Store = create<VST3StoreState>((set) => ({
  connectionStatus: 'disconnected',
  connectionError: null,
  companionVersion: null,
  scannedPlugins: [],
  lastScanTime: null,
  instances: {},

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (error) => set({ connectionError: error }),
  setCompanionVersion: (version) => set({ companionVersion: version }),

  setScannedPlugins: (plugins) =>
    set({ scannedPlugins: plugins, lastScanTime: Date.now() }),

  addInstance: (instance) =>
    set((s) => ({ instances: { ...s.instances, [instance.instanceId]: instance } })),

  removeInstance: (instanceId) =>
    set((s) => {
      const { [instanceId]: _, ...rest } = s.instances;
      void _;
      return { instances: rest };
    }),

  updateInstanceParam: (instanceId, paramId, value) =>
    set((s) => {
      const inst = s.instances[instanceId];
      if (!inst) return s;
      return {
        instances: {
          ...s.instances,
          [instanceId]: {
            ...inst,
            params: { ...inst.params, [paramId]: value },
          },
        },
      };
    }),

  setInstanceOnline: (instanceId, online) =>
    set((s) => {
      const inst = s.instances[instanceId];
      if (!inst) return s;
      return {
        instances: {
          ...s.instances,
          [instanceId]: { ...inst, online },
        },
      };
    }),

  markAllInstancesOffline: () =>
    set((s) => {
      const entries = Object.entries(s.instances);
      if (entries.length === 0) return s;
      // Skip if all are already offline
      if (entries.every(([, inst]) => !inst.online)) return s;
      const updated: Record<string, VST3PluginInstance> = {};
      for (const [id, inst] of entries) {
        updated[id] = inst.online ? { ...inst, online: false } : inst;
      }
      return { instances: updated };
    }),
}));

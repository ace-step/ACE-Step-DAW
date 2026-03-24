import { create } from 'zustand';
import type {
  VST3ConnectionStatus,
  VST3PluginInfo,
  VST3ActiveInstance,
  VST3ScanProgress,
  VST3Parameter,
} from '../types/vst3';

export interface VST3Store {
  /* ── Connection ──────────────────────────────────────── */
  connectionStatus: VST3ConnectionStatus;
  companionVersion: string | null;

  /* ── Scanned plugin catalogue ───────────────────────── */
  plugins: VST3PluginInfo[];
  scanning: boolean;
  scanProgress: VST3ScanProgress | null;

  /* ── Active instances (keyed by instanceId) ─────────── */
  instances: Record<string, VST3ActiveInstance>;

  /* ── Actions ────────────────────────────────────────── */
  connect: () => void;
  disconnect: () => void;
  scanPlugins: () => void;

  loadPlugin: (pluginId: string, trackId: string) => void;
  removeInstance: (instanceId: string) => void;
  toggleInstance: (instanceId: string) => void;
  openEditor: (instanceId: string) => void;
  setParameter: (instanceId: string, paramId: number, value: number) => void;
  selectPreset: (instanceId: string, preset: string) => void;
  savePreset: (instanceId: string, name: string) => void;

  /* ── Internal setters (used by bridge callbacks) ────── */
  _setConnectionStatus: (status: VST3ConnectionStatus) => void;
  _setCompanionVersion: (version: string) => void;
  _setPlugins: (plugins: VST3PluginInfo[]) => void;
  _setScanning: (scanning: boolean) => void;
  _setScanProgress: (progress: VST3ScanProgress | null) => void;
  _upsertInstance: (instance: VST3ActiveInstance) => void;
  _removeInstance: (instanceId: string) => void;
  _updateParameter: (instanceId: string, paramId: number, value: number) => void;
}

export const useVST3Store = create<VST3Store>()((set, get) => ({
  connectionStatus: 'disconnected',
  companionVersion: null,
  plugins: [],
  scanning: false,
  scanProgress: null,
  instances: {},

  // ── Connection ──────────────────────────────────────────
  connect: () => {
    set({ connectionStatus: 'connecting' });
    // Bridge implementation will call _setConnectionStatus('connected')
  },

  disconnect: () => {
    set({ connectionStatus: 'disconnected', companionVersion: null });
  },

  // ── Scanning ────────────────────────────────────────────
  scanPlugins: () => {
    set({ scanning: true, scanProgress: null });
    // Bridge implementation will update scan progress and call _setPlugins
  },

  // ── Plugin lifecycle ────────────────────────────────────
  loadPlugin: (_pluginId: string, _trackId: string) => {
    // Bridge will call _upsertInstance once loaded
  },

  removeInstance: (instanceId: string) => {
    get()._removeInstance(instanceId);
  },

  toggleInstance: (instanceId: string) => {
    const { instances } = get();
    const inst = instances[instanceId];
    if (!inst) return;
    set({
      instances: {
        ...instances,
        [instanceId]: { ...inst, enabled: !inst.enabled },
      },
    });
  },

  openEditor: (_instanceId: string) => {
    // Bridge tells companion to show native window
  },

  setParameter: (instanceId: string, paramId: number, value: number) => {
    get()._updateParameter(instanceId, paramId, value);
  },

  selectPreset: (instanceId: string, preset: string) => {
    const { instances } = get();
    const inst = instances[instanceId];
    if (!inst) return;
    set({
      instances: {
        ...instances,
        [instanceId]: { ...inst, activePreset: preset },
      },
    });
  },

  savePreset: (_instanceId: string, _name: string) => {
    // Bridge implementation
  },

  // ── Internal setters ────────────────────────────────────
  _setConnectionStatus: (status) => set({ connectionStatus: status }),
  _setCompanionVersion: (version) => set({ companionVersion: version }),
  _setPlugins: (plugins) => set({ plugins }),
  _setScanning: (scanning) => set({ scanning }),
  _setScanProgress: (progress) => set({ scanProgress: progress }),

  _upsertInstance: (instance) => {
    const { instances } = get();
    set({ instances: { ...instances, [instance.instanceId]: instance } });
  },

  _removeInstance: (instanceId) => {
    const { instances } = get();
    const next = { ...instances };
    delete next[instanceId];
    set({ instances: next });
  },

  _updateParameter: (instanceId, paramId, value) => {
    const { instances } = get();
    const inst = instances[instanceId];
    if (!inst) return;
    set({
      instances: {
        ...instances,
        [instanceId]: {
          ...inst,
          parameters: inst.parameters.map((p: VST3Parameter) =>
            p.id === paramId ? { ...p, value } : p,
          ),
        },
      },
    });
  },
}));

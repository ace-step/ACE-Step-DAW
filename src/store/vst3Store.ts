import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  VST3ConnectionStatus,
  VST3PluginInfo,
  VST3ActiveInstance,
  VST3ScanProgress,
  VST3Parameter,
} from '../types/vst3';
import { toastSuccess, toastError } from '../hooks/useToast';
import { _getBridgeClient } from '../hooks/useVST3Connection';
import { VST3PluginAdapter } from '../services/vst3bridge/VST3PluginAdapter';
import { pluginEngine } from '../engine/PluginEngine';

export interface VST3Store {
  /* ── Connection ──────────────────────────────────────── */
  connectionStatus: VST3ConnectionStatus;
  connectionError: string | null;
  companionVersion: string | null;

  /* ── Scanned plugin catalogue ───────────────────────── */
  plugins: VST3PluginInfo[];
  scanning: boolean;
  scanProgress: VST3ScanProgress | null;

  /* ── Active instances (keyed by instanceId) ─────────── */
  instances: Record<string, VST3ActiveInstance>;

  /* ── Per-track plugin ordering ──────────────────────── */
  pluginOrder: Record<string, string[]>;

  /* ── Actions ────────────────────────────────────────── */
  connect: () => void;
  disconnect: () => void;
  scanPlugins: () => void;

  loadPlugin: (pluginId: string, trackId: string) => Promise<void>;
  removeInstance: (instanceId: string) => void;
  toggleInstance: (instanceId: string) => void;
  openEditor: (instanceId: string) => void;
  setParameter: (instanceId: string, paramId: number, value: number) => void;
  selectPreset: (instanceId: string, preset: string) => void;
  savePreset: (instanceId: string, name: string) => void;
  reorderPlugins: (trackId: string, instanceIds: string[]) => void;
  setSidechain: (instanceId: string, sourceTrackId: string | null) => void;

  /* ── Public setters (used by hooks / bridge callbacks) ── */
  setConnectionStatus: (status: VST3ConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  setCompanionVersion: (version: string | null) => void;
  setScannedPlugins: (plugins: VST3PluginInfo[]) => void;
  markAllInstancesOffline: () => void;

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
  connectionError: null,
  companionVersion: null,
  plugins: [],
  scanning: false,
  scanProgress: null,
  instances: {},
  pluginOrder: {},

  // ── Connection ──────────────────────────────────────────
  connect: () => {
    set({ connectionStatus: 'connecting' });
    _getBridgeClient().connect();
  },

  disconnect: () => {
    set({ connectionStatus: 'disconnected', companionVersion: null });
    _getBridgeClient().disconnect();
  },

  // ── Scanning ────────────────────────────────────────────
  scanPlugins: () => {
    set({ scanning: true, scanProgress: null });
    // Bridge implementation will update scan progress and call _setPlugins
  },

  // ── Plugin lifecycle ────────────────────────────────────
  loadPlugin: async (pluginId: string, trackId: string) => {
    const { plugins } = get();
    const pluginInfo = plugins.find((p) => p.id === pluginId);
    if (!pluginInfo) {
      toastError(`Plugin "${pluginId}" not found in catalogue`);
      return;
    }

    const instanceId = `vst3-${uuidv4()}`;

    try {
      const client = _getBridgeClient();

      // Listen for the instanceCreated event from the bridge
      const instancePromise = new Promise<VST3Parameter[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.off('instanceCreated', onCreated);
          client.off('error', onError);
          reject(new Error('Plugin instantiation timed out'));
        }, 10_000);

        const onCreated = (msg: Record<string, unknown>) => {
          const createdId = msg.instanceId as string;
          if (createdId === instanceId) {
            clearTimeout(timeout);
            client.off('instanceCreated', onCreated);
            client.off('error', onError);
            const params = (msg.parameters as VST3Parameter[]) ?? [];
            resolve(params);
          }
        };

        const onError = (msg: Record<string, unknown>) => {
          clearTimeout(timeout);
          client.off('instanceCreated', onCreated);
          client.off('error', onError);
          reject(new Error((msg.message as string) ?? 'Unknown error'));
        };

        client.on('instanceCreated', onCreated);
        client.on('error', onError);
      });

      await client.createInstance(pluginId, instanceId);
      const parameters = await instancePromise;

      get()._upsertInstance({
        instanceId,
        pluginId,
        pluginName: pluginInfo.name,
        vendor: pluginInfo.vendor,
        trackId,
        enabled: true,
        online: true,
        parameters,
        presets: [],
        activePreset: null,
      });

      // Create the audio adapter and register with the plugin engine
      // so audio routing (effects) and MIDI (instruments) work through the graph
      try {
        const { getContext } = await import('tone');
        const ctx = getContext().rawContext as AudioContext;
        const adapter = new VST3PluginAdapter(
          instanceId,
          { ...pluginInfo, uid: pluginInfo.id },
          {
            instanceId,
            parameters: parameters.map((p) => ({
              id: p.id,
              name: p.name,
              title: p.name,
              default: p.defaultValue,
              defaultValue: p.defaultValue,
              min: p.minValue,
              max: p.maxValue,
              stepCount: 0,
              unit: '',
            })),
            latencySamples: 0,
          },
          client,
        );
        pluginEngine.addPlugin(trackId, instanceId, adapter, ctx);
      } catch {
        // Audio engine not ready — adapter will be created on next rebuild
      }

      toastSuccess(`Loaded ${pluginInfo.name}`);
    } catch (err) {
      toastError(`Failed to load ${pluginInfo.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
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

  openEditor: (instanceId: string) => {
    _getBridgeClient().send({ type: 'openEditor', instanceId });
  },

  setParameter: (instanceId: string, paramId: number, value: number) => {
    get()._updateParameter(instanceId, paramId, value);
    // Fire-and-forget: forward to bridge companion
    try {
      const client = _getBridgeClient();
      client.setParam(instanceId, paramId, value);
    } catch {
      // Bridge not connected — ignore silently
    }
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

  // ── Plugin chain ordering ──────────────────────────────
  reorderPlugins: (trackId: string, instanceIds: string[]) => {
    const { instances, pluginOrder } = get();
    // Filter to only IDs that belong to this track
    const trackInstanceIds = new Set(
      Object.values(instances)
        .filter((inst) => inst.trackId === trackId)
        .map((inst) => inst.instanceId),
    );
    if (trackInstanceIds.size === 0) return;

    const validOrder = instanceIds.filter((id) => trackInstanceIds.has(id));
    if (validOrder.length === 0) return;

    set({ pluginOrder: { ...pluginOrder, [trackId]: validOrder } });
  },

  setSidechain: (instanceId: string, sourceTrackId: string | null) => {
    const { instances } = get();
    const inst = instances[instanceId];
    if (!inst) return;
    set({
      instances: {
        ...instances,
        [instanceId]: { ...inst, sidechainSourceTrackId: sourceTrackId },
      },
    });
    // Forward to bridge companion
    try {
      const client = _getBridgeClient();
      client.send({ type: 'setSidechain', instanceId, sourceTrackId });
    } catch {
      // Bridge not connected — ignore silently
    }
  },

  // ── Public setters (used by hooks) ──────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (error) => set({ connectionError: error }),
  setCompanionVersion: (version) => set({ companionVersion: version }),
  setScannedPlugins: (plugins) => set({ plugins, scanning: false, scanProgress: null }),
  markAllInstancesOffline: () => {
    const { instances } = get();
    const updated: Record<string, VST3ActiveInstance> = {};
    for (const [id, inst] of Object.entries(instances)) {
      updated[id] = { ...inst, online: false };
    }
    set({ instances: updated });
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

/**
 * wamStore — Zustand store for WAM (Web Audio Module) plugin state.
 *
 * Manages WAM host initialization, plugin loading/unloading,
 * parameter updates, preset management, and instance lifecycle.
 */
import { create } from 'zustand';
import type { WAMActiveInstance, WAMPreset, WAMCatalogEntry } from '../types/wam';
import { wamHost } from '../services/wam/WAMHost';
import { WAMPluginAdapter } from '../services/wam/WAMPluginAdapter';
import { WAM_CATALOG, searchCatalog } from '../services/wam/WAMCatalog';
import { pluginRegistry } from '../engine/PluginRegistry';
import type { PluginManifest } from '../types/plugin';

export type WAMHostStatus = 'idle' | 'initializing' | 'ready' | 'error';

interface WAMState {
  /** Host initialization status */
  hostStatus: WAMHostStatus;
  /** Error message if host init fails */
  hostError: string | null;
  /** Active WAM plugin instances by instanceId */
  instances: Record<string, WAMActiveInstance>;
  /** Per-track plugin ordering */
  pluginOrder: Record<string, string[]>;
  /** Saved presets by plugin ID */
  presets: Record<string, WAMPreset[]>;
  /** Live WAMPluginAdapter references (not serializable — keyed by instanceId) */
  _adapters: Map<string, WAMPluginAdapter>;
}

interface WAMActions {
  /** Initialize the WAM host on the current AudioContext */
  initializeHost: (audioContext: BaseAudioContext) => Promise<void>;
  /** Load a WAM plugin from a catalog entry onto a track */
  loadPlugin: (entry: WAMCatalogEntry, trackId: string) => Promise<string | null>;
  /** Load a WAM plugin from a custom URL */
  loadPluginFromUrl: (url: string, trackId: string) => Promise<string | null>;
  /** Remove a WAM plugin instance */
  removeInstance: (instanceId: string) => void;
  /** Toggle enable/bypass for a WAM instance */
  toggleInstance: (instanceId: string) => void;
  /** Update a parameter value */
  setParameter: (instanceId: string, paramId: string, value: number) => void;
  /** Toggle GUI visibility for a WAM instance */
  toggleGui: (instanceId: string) => void;
  /** Save the current state as a preset */
  savePreset: (instanceId: string, name: string) => Promise<void>;
  /** Load a preset onto an instance */
  loadPreset: (instanceId: string, presetName: string) => Promise<void>;
  /** Reorder plugins on a track */
  reorderPlugins: (trackId: string, orderedIds: string[]) => void;
  /** Get a live adapter by instance ID */
  getAdapter: (instanceId: string) => WAMPluginAdapter | undefined;
  /** Search the WAM catalog */
  searchCatalog: (query: string, category?: 'instrument' | 'effect') => WAMCatalogEntry[];
  /** Get all catalog entries */
  getCatalog: () => WAMCatalogEntry[];
}

export const useWAMStore = create<WAMState & WAMActions>()((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  hostStatus: 'idle',
  hostError: null,
  instances: {},
  pluginOrder: {},
  presets: {},
  _adapters: new Map(),

  // ── Actions ────────────────────────────────────────────────────────────────

  initializeHost: async (audioContext: BaseAudioContext) => {
    const { hostStatus } = get();
    if (hostStatus === 'ready' || hostStatus === 'initializing') return;

    set({ hostStatus: 'initializing', hostError: null });

    try {
      await wamHost.initialize(audioContext);
      set({ hostStatus: 'ready' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize WAM host';
      set({ hostStatus: 'error', hostError: message });
    }
  },

  loadPlugin: async (entry: WAMCatalogEntry, trackId: string) => {
    const { hostStatus, _adapters } = get();
    if (hostStatus !== 'ready') {
      console.warn('[WAM] Host not ready, cannot load plugin');
      return null;
    }

    try {
      const handle = await wamHost.loadPlugin(entry.url);
      const adapter = await WAMPluginAdapter.create(handle);

      const instanceId = handle.instanceId;
      _adapters.set(instanceId, adapter);

      // Register in the main plugin registry for audio chain integration
      const manifest: PluginManifest = {
        id: `wam:${entry.id}`,
        name: adapter.name,
        pluginType: adapter.pluginType,
        version: adapter.version,
        author: adapter.author,
        description: adapter.description,
        parameters: adapter.getParameterDescriptors(),
      };

      const paramValues: Record<string, number> = {};
      const params = adapter.getParameters();
      for (const [id, val] of Object.entries(params)) {
        paramValues[id] = typeof val === 'number' ? val : 0;
      }

      const instance: WAMActiveInstance = {
        instanceId,
        pluginId: entry.id,
        pluginName: adapter.name,
        vendor: adapter.author,
        trackId,
        enabled: true,
        parameters: adapter.getParameterDescriptors().map((d) => ({
          id: d.id,
          label: d.name,
          type: d.type === 'enum' ? 'choice' as const : d.type as 'float' | 'int' | 'boolean',
          defaultValue: 'defaultValue' in d ? (typeof d.defaultValue === 'number' ? d.defaultValue : 0) : 0,
          minValue: 'min' in d ? d.min : 0,
          maxValue: 'max' in d ? d.max : 1,
          discreteStep: 0,
          exponent: 1,
          choices: d.type === 'enum' ? (d as any).options : undefined,
        })),
        parameterValues: paramValues,
        activePreset: null,
        presets: get().presets[entry.id]?.map((p) => p.name) ?? [],
        hasGui: adapter.hasGui(),
        guiVisible: false,
        descriptor: handle.descriptor,
      };

      set((state) => {
        const order = state.pluginOrder[trackId] ?? [];
        return {
          instances: { ...state.instances, [instanceId]: instance },
          pluginOrder: { ...state.pluginOrder, [trackId]: [...order, instanceId] },
        };
      });

      return instanceId;
    } catch (err) {
      console.error('[WAM] Failed to load plugin:', err);
      return null;
    }
  },

  loadPluginFromUrl: async (url: string, trackId: string) => {
    const customEntry: WAMCatalogEntry = {
      id: `custom-${Date.now()}`,
      name: 'Custom WAM Plugin',
      vendor: 'Unknown',
      description: 'Plugin loaded from custom URL',
      category: 'effect',
      subcategory: 'custom',
      url,
      tags: ['custom'],
    };
    return get().loadPlugin(customEntry, trackId);
  },

  removeInstance: (instanceId: string) => {
    const { instances, _adapters } = get();
    const instance = instances[instanceId];
    if (!instance) return;

    const adapter = _adapters.get(instanceId);
    if (adapter) {
      adapter.dispose();
      _adapters.delete(instanceId);
    }

    set((state) => {
      const { [instanceId]: removed, ...rest } = state.instances;
      const trackId = instance.trackId;
      const order = (state.pluginOrder[trackId] ?? []).filter((id) => id !== instanceId);
      return {
        instances: rest,
        pluginOrder: {
          ...state.pluginOrder,
          [trackId]: order.length > 0 ? order : [],
        },
      };
    });
  },

  toggleInstance: (instanceId: string) => {
    set((state) => {
      const inst = state.instances[instanceId];
      if (!inst) return state;
      return {
        instances: {
          ...state.instances,
          [instanceId]: { ...inst, enabled: !inst.enabled },
        },
      };
    });
  },

  setParameter: (instanceId: string, paramId: string, value: number) => {
    const adapter = get()._adapters.get(instanceId);
    if (adapter) {
      adapter.setParameter(paramId, value);
    }

    set((state) => {
      const inst = state.instances[instanceId];
      if (!inst) return state;
      return {
        instances: {
          ...state.instances,
          [instanceId]: {
            ...inst,
            parameterValues: { ...inst.parameterValues, [paramId]: value },
          },
        },
      };
    });
  },

  toggleGui: (instanceId: string) => {
    set((state) => {
      const inst = state.instances[instanceId];
      if (!inst) return state;
      return {
        instances: {
          ...state.instances,
          [instanceId]: { ...inst, guiVisible: !inst.guiVisible },
        },
      };
    });
  },

  savePreset: async (instanceId: string, name: string) => {
    const adapter = get()._adapters.get(instanceId);
    const instance = get().instances[instanceId];
    if (!adapter || !instance) return;

    const state = await adapter.getState();
    const preset: WAMPreset = {
      name,
      pluginId: instance.pluginId,
      parameterValues: { ...instance.parameterValues },
      state: state ? btoa(JSON.stringify(state)) : undefined,
    };

    set((s) => {
      const existing = s.presets[instance.pluginId] ?? [];
      const filtered = existing.filter((p) => p.name !== name);
      return {
        presets: {
          ...s.presets,
          [instance.pluginId]: [...filtered, preset],
        },
        instances: {
          ...s.instances,
          [instanceId]: {
            ...instance,
            activePreset: name,
            presets: [...filtered, preset].map((p) => p.name),
          },
        },
      };
    });
  },

  loadPreset: async (instanceId: string, presetName: string) => {
    const adapter = get()._adapters.get(instanceId);
    const instance = get().instances[instanceId];
    if (!adapter || !instance) return;

    const presets = get().presets[instance.pluginId] ?? [];
    const preset = presets.find((p) => p.name === presetName);
    if (!preset) return;

    // Restore state if available
    if (preset.state) {
      try {
        const state = JSON.parse(atob(preset.state));
        await adapter.setState(state);
      } catch {
        // Fall back to parameter values
      }
    }

    // Apply parameter values
    for (const [paramId, value] of Object.entries(preset.parameterValues)) {
      adapter.setParameter(paramId, value);
    }

    set((s) => ({
      instances: {
        ...s.instances,
        [instanceId]: {
          ...instance,
          parameterValues: { ...preset.parameterValues },
          activePreset: presetName,
        },
      },
    }));
  },

  reorderPlugins: (trackId: string, orderedIds: string[]) => {
    set((state) => ({
      pluginOrder: { ...state.pluginOrder, [trackId]: orderedIds },
    }));
  },

  getAdapter: (instanceId: string) => {
    return get()._adapters.get(instanceId);
  },

  searchCatalog: (query: string, category?: 'instrument' | 'effect') => {
    return searchCatalog(query, category);
  },

  getCatalog: () => WAM_CATALOG,
}));

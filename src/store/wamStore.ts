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
import { pluginEngine } from '../engine/PluginEngine';

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

    let adapter: WAMPluginAdapter | undefined;
    let instanceId: string | undefined;

    try {
      const handle = await wamHost.loadPlugin(entry.url);
      adapter = await WAMPluginAdapter.create(handle);

      instanceId = handle.instanceId;
      _adapters.set(instanceId, adapter);
      const { getAudioEngine } = await import('../hooks/useAudioEngine');
      pluginEngine.addPlugin(trackId, instanceId, adapter, getAudioEngine().ctx);

      // Build numeric parameter values from the adapter's cached values.
      // Adapter returns actual-range values (non-normalized), safe to store as numbers.
      const paramValues: Record<string, number> = {};
      const params = adapter.getParameters();
      for (const [id, val] of Object.entries(params)) {
        if (typeof val === 'number') {
          paramValues[id] = val;
        } else if (typeof val === 'boolean') {
          paramValues[id] = val ? 1 : 0;
        } else if (typeof val === 'string') {
          // For enum values, find the index; clamp to 0 if not found
          const desc = adapter.getParameterDescriptors().find((d) => d.id === id);
          if (desc?.type === 'enum' && Array.isArray((desc as any).options)) {
            const optionIndex = (desc as any).options.indexOf(val);
            paramValues[id] = optionIndex >= 0 ? optionIndex : 0;
          } else {
            paramValues[id] = 0;
          }
        }
      }

      const instance: WAMActiveInstance = {
        instanceId,
        pluginId: entry.id,
        pluginName: adapter.name,
        vendor: adapter.author,
        trackId,
        enabled: true,
        parameters: adapter.getParameterDescriptors().map((d) => {
          const type = d.type === 'enum'
            ? 'choice' as const
            : d.type === 'bool'
              ? 'boolean' as const
              : d.type as 'float' | 'int';
          const descriptorStep = d.type === 'float' && typeof d.step === 'number' && d.step > 0 ? d.step : undefined;
          const discreteStep = descriptorStep ?? (
            d.type === 'enum' || d.type === 'int' || d.type === 'bool' ? 1 : 0
          );

          const choices = d.type === 'enum' ? d.options : undefined;
          const defaultValue = d.type === 'enum'
            ? Math.max(0, d.options.indexOf(d.defaultValue))
            : d.type === 'bool'
              ? (d.defaultValue ? 1 : 0)
              : d.defaultValue;

          return {
            id: d.id,
            label: d.name,
            type,
            defaultValue,
            minValue: d.type === 'float' || d.type === 'int' ? d.min : 0,
            maxValue: d.type === 'float' || d.type === 'int' ? d.max : 1,
            discreteStep,
            exponent: 1,
            choices,
          };
        }),
        parameterValues: paramValues,
        activePreset: null,
        presets: get().presets[entry.id]?.map((p) => p.name) ?? [],
        hasGui: adapter.hasGui(),
        guiVisible: false,
        descriptor: handle.descriptor,
      };

      const id = instanceId;
      set((state) => {
        const order = state.pluginOrder[trackId] ?? [];
        return {
          instances: { ...state.instances, [id]: instance },
          pluginOrder: { ...state.pluginOrder, [trackId]: [...order, id] },
        };
      });

      return id;
    } catch (err) {
      // Clean up partially created WAM instance/adapter to prevent AudioWorklet leaks
      if (adapter) {
        try { adapter.dispose(); } catch { /* best effort */ }
      }
      if (instanceId && _adapters.has(instanceId)) {
        _adapters.delete(instanceId);
      }
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
      if (pluginEngine.getPlugin(instance.trackId, instanceId)) {
        pluginEngine.removePlugin(instance.trackId, instanceId);
      } else {
        adapter.dispose();
      }
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
      const nextEnabled = !inst.enabled;
      pluginEngine.setPluginBypassed(inst.trackId, instanceId, !nextEnabled);
      return {
        instances: {
          ...state.instances,
          [instanceId]: { ...inst, enabled: nextEnabled },
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
      // Use TextEncoder for UTF-8 safe base64 encoding
      state: state
        ? btoa(
            Array.from(new TextEncoder().encode(JSON.stringify(state)))
              .map((b) => String.fromCharCode(b))
              .join(''),
          )
        : undefined,
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
        // UTF-8 safe base64 decoding
        const binary = atob(preset.state);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const state = JSON.parse(new TextDecoder().decode(bytes));
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
    set((state) => {
      const validInstanceIds = new Set(
        Object.values(state.instances)
          .filter((instance) => instance.trackId === trackId)
          .map((instance) => instance.instanceId),
      );
      const filteredOrder = orderedIds.filter((id) => validInstanceIds.has(id));

      if (filteredOrder.length === 0) return state;

      return {
        pluginOrder: { ...state.pluginOrder, [trackId]: filteredOrder },
      };
    });
  },

  getAdapter: (instanceId: string) => {
    return get()._adapters.get(instanceId);
  },

  searchCatalog: (query: string, category?: 'instrument' | 'effect') => {
    return searchCatalog(query, category);
  },

  getCatalog: () => WAM_CATALOG,
}));

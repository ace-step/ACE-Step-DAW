import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────

export type VST3ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Metadata for a scanned VST3 plugin. */
export interface VST3PluginInfo {
  uid: string;
  name: string;
  vendor: string;
  category: 'instrument' | 'effect';
  subcategory: string;
  inputChannels: number;
  outputChannels: number;
  hasEditor: boolean;
  supportsMultiOutput: boolean;
  outputBusses: { name: string; channels: number }[];
}

/** A running VST3 plugin instance bound to a track. */
export interface VST3ActiveInstance {
  instanceId: string;
  pluginUid: string;
  trackId: string;
  latencySamples: number;
  editorOpen: boolean;
}

export interface VST3StoreState {
  // Connection
  connectionStatus: VST3ConnectionStatus;
  connectionError: string | null;
  companionVersion: string | null;
  capabilities: string[];

  // Scanning
  isScanning: boolean;
  scanProgress: { found: number; current: string } | null;
  scannedPlugins: VST3PluginInfo[];
  lastScanTimestamp: number | null;

  // Active instances
  activeInstances: Map<string, VST3ActiveInstance>;

  // Actions — connection
  setConnectionStatus: (status: VST3ConnectionStatus, error?: string | null) => void;
  setCompanionInfo: (version: string, capabilities: string[]) => void;

  // Actions — scanning
  startScan: () => void;
  updateScanProgress: (found: number, current: string) => void;
  completeScan: (plugins: VST3PluginInfo[]) => void;

  // Actions — instances
  addInstance: (instance: VST3ActiveInstance) => void;
  removeInstance: (instanceId: string) => void;
  updateInstanceLatency: (instanceId: string, samples: number) => void;
  setEditorOpen: (instanceId: string, open: boolean) => void;

  // Derived queries
  getPluginsByCategory: (category: 'instrument' | 'effect') => VST3PluginInfo[];
  searchPlugins: (query: string) => VST3PluginInfo[];
  getInstancesForTrack: (trackId: string) => VST3ActiveInstance[];

  // Reset
  reset: () => void;
}

// ─── localStorage cache helpers ──────────────────────────────────────────────

const CACHE_KEY = 'vst3-scanned-plugins';

interface CachedScanData {
  plugins: VST3PluginInfo[];
  timestamp: number;
}

/** Load cached scan results from localStorage (best-effort). */
function loadCachedPlugins(): { plugins: VST3PluginInfo[]; timestamp: number | null } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { plugins: [], timestamp: null };
    const data: CachedScanData = JSON.parse(raw);
    if (Array.isArray(data.plugins) && typeof data.timestamp === 'number') {
      return { plugins: data.plugins, timestamp: data.timestamp };
    }
  } catch {
    // Corrupt or missing — ignore
  }
  return { plugins: [], timestamp: null };
}

/** Persist scan results to localStorage. */
function saveCachedPlugins(plugins: VST3PluginInfo[], timestamp: number): void {
  try {
    const data: CachedScanData = { plugins, timestamp };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — ignore
  }
}

// ─── Initial state ───────────────────────────────────────────────────────────

function getInitialState() {
  const cached = loadCachedPlugins();
  return {
    connectionStatus: 'disconnected' as VST3ConnectionStatus,
    connectionError: null as string | null,
    companionVersion: null as string | null,
    capabilities: [] as string[],
    isScanning: false,
    scanProgress: null as { found: number; current: string } | null,
    scannedPlugins: cached.plugins,
    lastScanTimestamp: cached.timestamp,
    activeInstances: new Map<string, VST3ActiveInstance>(),
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useVST3Store = create<VST3StoreState>((set, get) => ({
  ...getInitialState(),

  // Connection
  setConnectionStatus: (status, error) =>
    set({
      connectionStatus: status,
      connectionError: status === 'error' ? (error ?? null) : null,
    }),

  setCompanionInfo: (version, capabilities) =>
    set({ companionVersion: version, capabilities }),

  // Scanning
  startScan: () =>
    set({ isScanning: true, scanProgress: null }),

  updateScanProgress: (found, current) =>
    set({ scanProgress: { found, current } }),

  completeScan: (plugins) => {
    const timestamp = Date.now();
    saveCachedPlugins(plugins, timestamp);
    set({
      isScanning: false,
      scanProgress: null,
      scannedPlugins: plugins,
      lastScanTimestamp: timestamp,
    });
  },

  // Instances
  addInstance: (instance) =>
    set((state) => {
      const next = new Map(state.activeInstances);
      next.set(instance.instanceId, instance);
      return { activeInstances: next };
    }),

  removeInstance: (instanceId) =>
    set((state) => {
      if (!state.activeInstances.has(instanceId)) return state;
      const next = new Map(state.activeInstances);
      next.delete(instanceId);
      return { activeInstances: next };
    }),

  updateInstanceLatency: (instanceId, samples) =>
    set((state) => {
      const existing = state.activeInstances.get(instanceId);
      if (!existing) return state;
      const next = new Map(state.activeInstances);
      next.set(instanceId, { ...existing, latencySamples: samples });
      return { activeInstances: next };
    }),

  setEditorOpen: (instanceId, open) =>
    set((state) => {
      const existing = state.activeInstances.get(instanceId);
      if (!existing) return state;
      const next = new Map(state.activeInstances);
      next.set(instanceId, { ...existing, editorOpen: open });
      return { activeInstances: next };
    }),

  // Derived queries
  getPluginsByCategory: (category) =>
    get().scannedPlugins.filter((p) => p.category === category),

  searchPlugins: (query) => {
    const q = query.toLowerCase();
    return get().scannedPlugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q),
    );
  },

  getInstancesForTrack: (trackId) =>
    [...get().activeInstances.values()].filter((i) => i.trackId === trackId),

  // Reset
  reset: () => set(getInitialState()),
}));

// Expose globally for agent/testing access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__vst3Store = useVST3Store;
}

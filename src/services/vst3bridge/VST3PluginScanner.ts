/**
 * VST3 Plugin Scanner Service
 *
 * Triggers plugin scans via the bridge client, caches results in IndexedDB
 * (with localStorage fallback), and provides search/filter utilities.
 *
 * Cache invalidation triggers:
 * - Companion app version changes
 * - Cache older than 24 hours
 * - User triggers manual "Rescan" (force flag)
 */
import { VST3ScanCache } from './VST3ScanCache';

// ─── Types ──────────────────────────────────────────────────────────────────

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

export interface VST3BridgeClientLike {
  scanPlugins(): Promise<VST3PluginInfo[]>;
  on(type: string, handler: (msg: Record<string, unknown>) => void): () => void;
  get isConnected(): boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_KEY = 'ace-step-vst3-scan-cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Scanner ────────────────────────────────────────────────────────────────

export class VST3PluginScanner {
  private bridgeClient: VST3BridgeClientLike | null = null;
  private cachedPlugins: VST3PluginInfo[] = [];
  private lastScanTimestamp: number | null = null;
  private companionVersion: string | null = null;
  private readonly idbCache = new VST3ScanCache();

  constructor() {
    this.loadFromLocalStorage();
  }

  /** Set the bridge client (called when connection is established). */
  setBridgeClient(client: VST3BridgeClientLike): void {
    this.bridgeClient = client;
  }

  /** Set companion version for cache invalidation. */
  setCompanionVersion(version: string): void {
    this.companionVersion = version;
  }

  /**
   * Load plugins from IndexedDB cache if valid, otherwise return null.
   * Validates companion version match and cache age (<24h).
   */
  async loadFromCache(): Promise<VST3PluginInfo[] | null> {
    if (!this.companionVersion) return null;

    // Single retrieve call to avoid redundant IndexedDB opens
    const entry = await this.idbCache.retrieve();
    if (!entry) return null;
    if (entry.companionVersion !== this.companionVersion) return null;
    if (Date.now() - entry.timestamp > 24 * 60 * 60 * 1000) return null;

    this.cachedPlugins = entry.plugins;
    this.lastScanTimestamp = entry.timestamp;
    return entry.plugins;
  }

  /**
   * Trigger a full plugin scan. Returns scanned plugins.
   * @param onProgress - Progress callback receiving (found, currentPlugin)
   * @param force - Skip cache and force a fresh scan
   */
  async scan(
    onProgress?: (found: number, current: string) => void,
    force?: boolean,
  ): Promise<VST3PluginInfo[]> {
    // Try cache first unless force rescan
    if (!force && this.companionVersion) {
      const cached = await this.loadFromCache();
      if (cached) return cached;
    }
    if (!this.bridgeClient) {
      throw new Error('Bridge client not set');
    }
    if (!this.bridgeClient.isConnected) {
      throw new Error('Bridge client is not connected');
    }

    // Subscribe to progress events if callback provided
    let unsubscribe: (() => void) | null = null;
    if (onProgress) {
      unsubscribe = this.bridgeClient.on('scanProgress', (msg) => {
        const found = msg.found;
        const current = msg.current;
        if (typeof found === 'number' && typeof current === 'string') {
          onProgress(found, current);
        }
      });
    }

    try {
      const plugins = await this.bridgeClient.scanPlugins();
      this.cachedPlugins = plugins;
      this.lastScanTimestamp = Date.now();
      this.saveToLocalStorage();

      // Also persist to IndexedDB with companion version
      if (this.companionVersion) {
        this.idbCache.store(plugins, this.companionVersion).catch(() => {
          // IndexedDB write failed — localStorage is still available
        });
      }

      return plugins;
    } finally {
      unsubscribe?.();
    }
  }

  /** Get cached plugins (from memory or localStorage). */
  getCachedPlugins(): VST3PluginInfo[] {
    return this.cachedPlugins;
  }

  /** Check if cache is stale (>24h old or nonexistent). */
  isCacheStale(): boolean {
    if (this.lastScanTimestamp === null) return true;
    return Date.now() - this.lastScanTimestamp > CACHE_MAX_AGE_MS;
  }

  /** Search plugins by query (matches name, vendor, subcategory). */
  search(query: string): VST3PluginInfo[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [...this.cachedPlugins];

    return this.cachedPlugins.filter((plugin) => {
      const searchable = `${plugin.name} ${plugin.vendor} ${plugin.subcategory}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  /** Filter by category. */
  getByCategory(category: 'instrument' | 'effect'): VST3PluginInfo[] {
    return this.cachedPlugins.filter((p) => p.category === category);
  }

  /** Get unique vendors. */
  getVendors(): string[] {
    return [...new Set(this.cachedPlugins.map((p) => p.vendor))];
  }

  /** Get unique subcategories. */
  getSubcategories(): string[] {
    return [...new Set(this.cachedPlugins.map((p) => p.subcategory))];
  }

  /** Clear cache (both localStorage and IndexedDB). */
  clearCache(): void {
    this.cachedPlugins = [];
    this.lastScanTimestamp = null;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // localStorage unavailable — ignore
    }
    this.idbCache.clear().catch(() => {
      // IndexedDB clear failed — ignore
    });
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private loadFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.plugins)) {
        this.cachedPlugins = data.plugins;
        this.lastScanTimestamp = data.timestamp ?? null;
      }
    } catch {
      // Corrupted cache — ignore
    }
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          plugins: this.cachedPlugins,
          timestamp: this.lastScanTimestamp,
        }),
      );
    } catch {
      // localStorage full or unavailable — ignore
    }
  }
}

/**
 * VST3 Plugin Scanner Service
 *
 * Triggers plugin scans via the bridge client, caches results in localStorage,
 * and provides search/filter utilities for the scanned plugin list.
 */

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
  on(type: string, handler: (msg: any) => void): () => void;
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

  constructor() {
    this.loadFromLocalStorage();
  }

  /** Set the bridge client (called when connection is established). */
  setBridgeClient(client: VST3BridgeClientLike): void {
    this.bridgeClient = client;
  }

  /** Trigger a full plugin scan. Returns scanned plugins. */
  async scan(
    onProgress?: (found: number, current: string) => void,
  ): Promise<VST3PluginInfo[]> {
    if (!this.bridgeClient) {
      throw new Error('Bridge client not set');
    }
    if (!this.bridgeClient.isConnected) {
      throw new Error('Bridge client is not connected');
    }

    // Subscribe to progress events if callback provided
    let unsubscribe: (() => void) | null = null;
    if (onProgress) {
      unsubscribe = this.bridgeClient.on('scan_progress', (msg) => {
        onProgress(msg.found, msg.current);
      });
    }

    try {
      const plugins = await this.bridgeClient.scanPlugins();
      this.cachedPlugins = plugins;
      this.lastScanTimestamp = Date.now();
      this.saveToLocalStorage();
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

  /** Clear cache. */
  clearCache(): void {
    this.cachedPlugins = [];
    this.lastScanTimestamp = null;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // localStorage unavailable — ignore
    }
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

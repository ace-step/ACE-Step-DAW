/**
 * VST3 Scan Cache — IndexedDB-backed plugin scan result cache.
 *
 * Stores scan results with companion version and timestamp.
 * Invalidates when:
 * - Companion app version changes (new plugins may be available)
 * - Cache is older than 24 hours
 * - User triggers manual rescan
 *
 * Falls back to in-memory storage if IndexedDB is unavailable
 * (e.g., private browsing mode in some browsers).
 */
import type { VST3PluginInfo } from './VST3PluginScanner';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScanCacheEntry {
  plugins: VST3PluginInfo[];
  companionVersion: string;
  timestamp: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = 'ace-step-vst3-cache';
const DB_VERSION = 1;
const STORE_NAME = 'scan-results';
const CACHE_KEY = 'latest';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<ScanCacheEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as ScanCacheEntry | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: ScanCacheEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ─── VST3ScanCache ──────────────────────────────────────────────────────────

export class VST3ScanCache {
  /** In-memory fallback when IndexedDB is unavailable */
  private memoryFallback: ScanCacheEntry | null = null;
  private useMemoryFallback = false;

  /** Store scan results with companion version and optional timestamp override. */
  async store(
    plugins: VST3PluginInfo[],
    companionVersion: string,
    timestamp?: number,
  ): Promise<void> {
    const entry: ScanCacheEntry = {
      plugins,
      companionVersion,
      timestamp: timestamp ?? Date.now(),
    };

    try {
      const db = await openDB();
      await idbPut(db, CACHE_KEY, entry);
      db.close();
    } catch {
      this.useMemoryFallback = true;
      this.memoryFallback = entry;
    }
  }

  /** Retrieve cached scan results, or null if cache is empty. */
  async retrieve(): Promise<ScanCacheEntry | null> {
    if (this.useMemoryFallback) {
      return this.memoryFallback;
    }

    try {
      const db = await openDB();
      const entry = await idbGet(db, CACHE_KEY);
      db.close();
      return entry ?? null;
    } catch {
      this.useMemoryFallback = true;
      return this.memoryFallback;
    }
  }

  /**
   * Check if cache is valid for the given companion version.
   * Returns false if:
   * - Cache is empty
   * - Companion version has changed
   * - Cache is older than 24 hours
   */
  async isValid(companionVersion: string): Promise<boolean> {
    const entry = await this.retrieve();
    if (!entry) return false;
    if (entry.companionVersion !== companionVersion) return false;
    if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) return false;
    return true;
  }

  /** Clear all cached data. */
  async clear(): Promise<void> {
    this.memoryFallback = null;

    try {
      const db = await openDB();
      await idbDelete(db, CACHE_KEY);
      db.close();
    } catch {
      // IndexedDB unavailable — memory already cleared
    }
  }

  /** Get the number of cached plugins (0 if no cache). */
  async getPluginCount(): Promise<number> {
    const entry = await this.retrieve();
    return entry?.plugins.length ?? 0;
  }
}

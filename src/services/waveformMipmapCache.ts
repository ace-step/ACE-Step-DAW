/**
 * Synchronous mipmap cache for main-thread rendering.
 *
 * Stores deserialized mipmap bytes in memory, keyed by audioKey.
 * query_peaks_wasm() is called synchronously on the main thread —
 * it's pure computation, fast enough for real-time rendering.
 */

import initWasm, { query_peaks_wasm } from '../wasm/waveform-pkg/ace_waveform_wasm';
import { get } from 'idb-keyval';

const MIPMAP_KEY_PREFIX = 'mipmap:';
const MAX_CACHE = 20;

// In-memory cache: audioKey → Uint8Array (serialized mipmap)
const cache = new Map<string, Uint8Array>();

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

/** Initialize WASM module (call once at startup). */
export async function initWaveformWasm(): Promise<void> {
  if (wasmReady) return;
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        // Use absolute path to public/ so it works from both main thread and workers
        await initWasm('/ace_waveform_wasm_bg.wasm');
        wasmReady = true;
      } catch {
        // Expected in test/SSR environments where fetch('/...') fails
        wasmInitPromise = null;
      }
    })();
  }
  await wasmInitPromise;
}

/** Load mipmap from IndexedDB into memory cache. */
export async function loadMipmapIntoCache(audioKey: string): Promise<boolean> {
  if (cache.has(audioKey)) return true;
  try {
    const stored = await get<ArrayBuffer>(`${MIPMAP_KEY_PREFIX}${audioKey}`);
    if (!stored) return false;
    cache.set(audioKey, new Uint8Array(stored));
    evict();
    return true;
  } catch {
    return false; // IndexedDB unavailable (test/SSR environment)
  }
}

/** Store mipmap bytes in memory cache (called after compute). */
export function cacheMipmapBytes(audioKey: string, bytes: Uint8Array): void {
  cache.set(audioKey, bytes);
  evict();
}

/** Check if mipmap is in memory (synchronous). */
export function hasCachedMipmap(audioKey: string): boolean {
  return cache.has(audioKey);
}

/**
 * Query peaks synchronously from cached mipmap.
 * Returns Float32Array stride-6 per column, or null if no mipmap cached.
 * This is the hot path — called during every canvas draw.
 */
export function queryPeaksSync(
  audioKey: string,
  startSample: number,
  endSample: number,
  numColumns: number,
): Float32Array | null {
  if (!wasmReady) return null;
  const bytes = cache.get(audioKey);
  if (!bytes) return null;
  try {
    return query_peaks_wasm(bytes, startSample, endSample, numColumns);
  } catch {
    return null;
  }
}

function evict(): void {
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

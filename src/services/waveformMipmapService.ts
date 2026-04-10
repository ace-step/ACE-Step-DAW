/**
 * Waveform Mipmap Service — manages mipmap computation, storage, and queries.
 *
 * Uses a Web Worker (waveformWorker.ts) to run ace-waveform-wasm off the main thread.
 * Mipmaps are stored in IndexedDB via idb-keyval and cached in memory (LRU, max 10).
 *
 * Usage:
 *   await waveformMipmapService.computeMipmap(audioKey, left, right, sampleRate);
 *   const peaks = await waveformMipmapService.queryPeaks(audioKey, start, end, columns);
 */

import { get, set } from 'idb-keyval';
import type { WaveformWorkerRequest, WaveformWorkerResponse } from '../workers/waveformWorker';
import { CLIP_WAVEFORM_PEAK_COUNT } from '../utils/clipAudio';

const MIPMAP_KEY_PREFIX = 'mipmap:';
const MAX_CACHE_SIZE = 10;

// LRU memory cache for mipmap binary data
const mipmapCache = new Map<string, ArrayBuffer>();

function makeMipmapKey(audioKey: string): string {
  return `${MIPMAP_KEY_PREFIX}${audioKey}`;
}

function evictIfNeeded(): void {
  while (mipmapCache.size > MAX_CACHE_SIZE) {
    const oldest = mipmapCache.keys().next().value;
    if (oldest) mipmapCache.delete(oldest);
  }
}

// Worker management
let worker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, {
  resolve: (value: WaveformWorkerResponse) => void;
  reject: (reason: Error) => void;
}>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/waveformWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e: MessageEvent<WaveformWorkerResponse>) => {
      const resp = e.data;
      const pending = pendingRequests.get(resp.id);
      if (pending) {
        pendingRequests.delete(resp.id);
        if (resp.type === 'error') {
          pending.reject(new Error(resp.error ?? 'Worker error'));
        } else {
          pending.resolve(resp);
        }
      }
    };
    worker.onerror = (e) => {
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error(`Worker error: ${e.message}`));
        pendingRequests.delete(id);
      }
    };
  }
  return worker;
}

function sendWorkerRequest(
  req: Omit<WaveformWorkerRequest, 'id'>,
  transfer?: Transferable[],
): Promise<WaveformWorkerResponse> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    const fullReq = { ...req, id } as WaveformWorkerRequest;
    getWorker().postMessage(fullReq, transfer ?? []);
  });
}

/**
 * Get cached mipmap bytes, loading from IndexedDB if necessary.
 */
async function getMipmapBytes(audioKey: string): Promise<ArrayBuffer | null> {
  const cached = mipmapCache.get(audioKey);
  if (cached) return cached;

  const stored = await get<ArrayBuffer>(makeMipmapKey(audioKey));
  if (stored) {
    mipmapCache.set(audioKey, stored);
    evictIfNeeded();
    return stored;
  }
  return null;
}

export const waveformMipmapService = {
  /**
   * Compute mipmap from raw audio and store in IndexedDB.
   * Returns legacy peaks (stride-4 number[]) for backward compatibility.
   */
  async computeMipmap(
    audioKey: string,
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
  ): Promise<number[]> {
    // Compute mipmap in Worker
    const resp = await sendWorkerRequest({
      type: 'compute',
      left,
      right,
      sampleRate,
    });

    if (!resp.mipmapBytes) {
      throw new Error('No mipmap bytes returned');
    }

    // Store in IndexedDB, local memory cache, and sync render cache
    const bytes = resp.mipmapBytes;
    await set(makeMipmapKey(audioKey), bytes);
    mipmapCache.set(audioKey, bytes);
    evictIfNeeded();

    // Also populate the synchronous main-thread cache for rendering
    try {
      const { cacheMipmapBytes, initWaveformWasm } = await import('./waveformMipmapCache');
      await initWaveformWasm();
      cacheMipmapBytes(audioKey, new Uint8Array(bytes));
    } catch { /* WASM not available */ }

    // Extract legacy peaks for Clip.waveformPeaks
    const legacyResp = await sendWorkerRequest({
      type: 'extract-legacy',
      mipmapBytes: bytes.slice(0), // copy since bytes may be transferred
      numPeaks: Math.floor(CLIP_WAVEFORM_PEAK_COUNT / 4), // logical peak count
    });

    if (legacyResp.legacyPeaks) {
      return Array.from(legacyResp.legacyPeaks);
    }
    return [];
  },

  /**
   * Query peaks from a stored mipmap for rendering.
   * Returns Float32Array with stride 6: [min_l, max_l, rms_l, min_r, max_r, rms_r, ...]
   */
  async queryPeaks(
    audioKey: string,
    startSample: number,
    endSample: number,
    numColumns: number,
  ): Promise<Float32Array | null> {
    const bytes = await getMipmapBytes(audioKey);
    if (!bytes) return null;

    const resp = await sendWorkerRequest({
      type: 'query',
      mipmapBytes: bytes.slice(0), // copy since Worker takes ownership
      startSample,
      endSample,
      numColumns,
    });

    return resp.peakData ?? null;
  },

  /**
   * Check if a mipmap exists for the given audio key (memory cache only — fast).
   */
  hasMipmap(audioKey: string): boolean {
    return mipmapCache.has(audioKey);
  },

  /**
   * Check if a mipmap exists (including IndexedDB — async).
   */
  async hasMipmapAsync(audioKey: string): Promise<boolean> {
    if (mipmapCache.has(audioKey)) return true;
    const stored = await get<ArrayBuffer>(makeMipmapKey(audioKey));
    if (stored) {
      mipmapCache.set(audioKey, stored);
      evictIfNeeded();
      return true;
    }
    return false;
  },

  /**
   * Dispose the worker and clear caches.
   */
  dispose(): void {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    pendingRequests.clear();
    mipmapCache.clear();
  },
};

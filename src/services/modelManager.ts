/**
 * ONNX model manager — lazy download, IndexedDB caching, progress reporting.
 */
import { get, set } from 'idb-keyval';
import type { AnalysisModelId, AnalysisModelMeta, ModelDownloadProgress } from '../types/analysis';

export const MODEL_REGISTRY: Record<AnalysisModelId, AnalysisModelMeta> = {
  'beat-this-small': {
    id: 'beat-this-small',
    name: 'Beat This! (small)',
    sizeBytes: 8_400_000,
    url: '/models/beat-this-small.onnx',
    cacheKey: 'onnx-model:beat-this-small',
  },
  'consonance-ace': {
    id: 'consonance-ace',
    name: 'Consonance-ACE',
    sizeBytes: 15_000_000,
    url: '/models/consonance-ace.onnx',
    cacheKey: 'onnx-model:consonance-ace',
  },
};

/**
 * Load model bytes from IndexedDB cache, or fetch from network and cache.
 */
export async function loadModelBytes(
  modelId: AnalysisModelId,
  onProgress?: (p: ModelDownloadProgress) => void,
): Promise<ArrayBuffer> {
  const meta = MODEL_REGISTRY[modelId];

  // Try cache first
  const cached = await get<ArrayBuffer>(meta.cacheKey);
  if (cached) {
    onProgress?.({
      modelName: meta.name,
      bytesLoaded: cached.byteLength,
      bytesTotal: cached.byteLength,
      percent: 100,
    });
    return cached;
  }

  // Fetch with streaming progress
  const response = await fetch(meta.url);
  if (!response.ok) {
    throw new Error(`Failed to download model ${meta.name}: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('Content-Length')) || meta.sizeBytes;
  const reader = response.body?.getReader();

  if (!reader) {
    // Fallback: no streaming — download entire response
    const buffer = await response.arrayBuffer();
    await set(meta.cacheKey, buffer);
    onProgress?.({ modelName: meta.name, bytesLoaded: buffer.byteLength, bytesTotal: buffer.byteLength, percent: 100 });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let bytesLoaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesLoaded += value.byteLength;
    onProgress?.({
      modelName: meta.name,
      bytesLoaded,
      bytesTotal: contentLength,
      percent: Math.round((bytesLoaded / contentLength) * 100),
    });
  }

  // Merge chunks into single ArrayBuffer
  const buffer = new ArrayBuffer(bytesLoaded);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Cache in IndexedDB
  await set(meta.cacheKey, buffer);

  return buffer;
}

/**
 * Check if a model is already cached in IndexedDB.
 */
export async function isModelCached(modelId: AnalysisModelId): Promise<boolean> {
  const meta = MODEL_REGISTRY[modelId];
  const cached = await get<ArrayBuffer>(meta.cacheKey);
  return cached !== undefined;
}

/**
 * Get model metadata.
 */
export function getModelMeta(modelId: AnalysisModelId): AnalysisModelMeta {
  return MODEL_REGISTRY[modelId];
}

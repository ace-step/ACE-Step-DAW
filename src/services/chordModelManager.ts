/**
 * ChordSeqAI model manager — download, cache, and provide ONNX models for chord prediction.
 *
 * Follows the same pattern as modelManager.ts but for chord-specific models.
 */
import { get, set } from 'idb-keyval';
import type { ChordModelVariant, ChordModelMeta } from '../types/chordSuggestion';

export const CHORD_MODEL_REGISTRY: Record<ChordModelVariant, ChordModelMeta> = {
  'rnn': {
    id: 'rnn',
    name: 'Recurrent Network',
    sizeBytes: 1_400_000,
    url: '/models/chord-rnn.onnx',
    conditional: false,
    cacheKey: 'onnx-model:chord-rnn',
  },
  'transformer-s': {
    id: 'transformer-s',
    name: 'Transformer S',
    sizeBytes: 4_500_000,
    url: '/models/chord-transformer-s.onnx',
    conditional: false,
    cacheKey: 'onnx-model:chord-transformer-s',
  },
  'transformer-m': {
    id: 'transformer-m',
    name: 'Transformer M',
    sizeBytes: 9_400_000,
    url: '/models/chord-transformer-m.onnx',
    conditional: false,
    cacheKey: 'onnx-model:chord-transformer-m',
  },
  'transformer-l': {
    id: 'transformer-l',
    name: 'Transformer L',
    sizeBytes: 17_800_000,
    url: '/models/chord-transformer-l.onnx',
    conditional: false,
    cacheKey: 'onnx-model:chord-transformer-l',
  },
  'conditional-s': {
    id: 'conditional-s',
    name: 'Conditional Transformer S',
    sizeBytes: 4_600_000,
    url: '/models/chord-conditional-s.onnx',
    conditional: true,
    cacheKey: 'onnx-model:chord-conditional-s',
  },
  'conditional-m': {
    id: 'conditional-m',
    name: 'Conditional Transformer M',
    sizeBytes: 9_600_000,
    url: '/models/chord-conditional-m.onnx',
    conditional: true,
    cacheKey: 'onnx-model:chord-conditional-m',
  },
  'conditional-l': {
    id: 'conditional-l',
    name: 'Conditional Transformer L',
    sizeBytes: 18_000_000,
    url: '/models/chord-conditional-l.onnx',
    conditional: true,
    cacheKey: 'onnx-model:chord-conditional-l',
  },
};

/**
 * Load chord model bytes from IndexedDB cache or fetch from network.
 */
export async function loadChordModelBytes(
  variant: ChordModelVariant,
  onProgress?: (percent: number, message: string) => void,
): Promise<ArrayBuffer> {
  const meta = CHORD_MODEL_REGISTRY[variant];

  const cached = await get<ArrayBuffer>(meta.cacheKey);
  if (cached) {
    onProgress?.(100, `${meta.name} loaded from cache`);
    return cached;
  }

  onProgress?.(0, `Downloading ${meta.name}...`);

  const response = await fetch(meta.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${meta.name}: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('Content-Length')) || meta.sizeBytes;
  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();
    await set(meta.cacheKey, buffer);
    onProgress?.(100, `${meta.name} ready`);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let bytesLoaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesLoaded += value.byteLength;
    onProgress?.(
      Math.round((bytesLoaded / contentLength) * 100),
      `Downloading ${meta.name}... ${Math.round(bytesLoaded / 1024)}KB`,
    );
  }

  const buffer = new ArrayBuffer(bytesLoaded);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  await set(meta.cacheKey, buffer);
  onProgress?.(100, `${meta.name} ready`);
  return buffer;
}

/**
 * Check if a chord model is cached.
 */
export async function isChordModelCached(variant: ChordModelVariant): Promise<boolean> {
  const meta = CHORD_MODEL_REGISTRY[variant];
  const cached = await get<ArrayBuffer>(meta.cacheKey);
  return cached !== undefined;
}

/**
 * Get chord model metadata.
 */
export function getChordModelMeta(variant: ChordModelVariant): ChordModelMeta {
  return CHORD_MODEL_REGISTRY[variant];
}

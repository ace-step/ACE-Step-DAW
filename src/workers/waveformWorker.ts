/**
 * Web Worker for mipmap waveform computation via WASM.
 *
 * Runs ace-waveform-wasm in a separate thread to avoid blocking the main thread.
 * Accepts Float32Array audio data, computes mipmap pyramid, returns binary result.
 */

import init, {
  compute_mipmap_wasm,
  query_peaks_wasm,
  extract_legacy_peaks_wasm,
} from '../wasm/waveform-pkg/ace_waveform_wasm';

export interface WaveformWorkerRequest {
  id: number;
  type: 'compute' | 'query' | 'extract-legacy';
  // compute
  left?: Float32Array;
  right?: Float32Array;
  sampleRate?: number;
  // query
  mipmapBytes?: ArrayBuffer;
  startSample?: number;
  endSample?: number;
  numColumns?: number;
  // extract-legacy
  numPeaks?: number;
}

export interface WaveformWorkerResponse {
  id: number;
  type: 'compute-result' | 'query-result' | 'extract-legacy-result' | 'error';
  // compute-result
  mipmapBytes?: ArrayBuffer;
  // query-result
  peakData?: Float32Array;
  // extract-legacy-result
  legacyPeaks?: Float32Array;
  // error
  error?: string;
}

let wasmReady = false;
let initPromise: Promise<void> | null = null;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  if (!initPromise) {
    // Use absolute path — Worker's import.meta.url differs from main thread
    initPromise = init('/ace_waveform_wasm_bg.wasm').then(() => { wasmReady = true; });
  }
  await initPromise;
}

self.onmessage = async (e: MessageEvent<WaveformWorkerRequest>) => {
  const req = e.data;

  try {
    await ensureWasm();

    if (req.type === 'compute') {
      const left = req.left!;
      const right = req.right!;
      const sampleRate = req.sampleRate!;

      const bytes = compute_mipmap_wasm(left, right, sampleRate);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);

      const msg: WaveformWorkerResponse = { id: req.id, type: 'compute-result', mipmapBytes: buffer };
      (self as unknown as Worker).postMessage(msg, [buffer]);
    } else if (req.type === 'query') {
      const mipmapArr = new Uint8Array(req.mipmapBytes!);
      const result = query_peaks_wasm(mipmapArr, req.startSample!, req.endSample!, req.numColumns!);
      const buffer = new ArrayBuffer(result.byteLength);
      new Float32Array(buffer).set(result);

      const msg: WaveformWorkerResponse = { id: req.id, type: 'query-result', peakData: new Float32Array(buffer) };
      (self as unknown as Worker).postMessage(msg, [buffer]);
    } else if (req.type === 'extract-legacy') {
      const mipmapArr = new Uint8Array(req.mipmapBytes!);
      const result = extract_legacy_peaks_wasm(mipmapArr, req.numPeaks!);
      const buffer = new ArrayBuffer(result.byteLength);
      new Float32Array(buffer).set(result);

      const msg: WaveformWorkerResponse = { id: req.id, type: 'extract-legacy-result', legacyPeaks: new Float32Array(buffer) };
      (self as unknown as Worker).postMessage(msg, [buffer]);
    }
  } catch (err) {
    self.postMessage({
      id: req.id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies WaveformWorkerResponse);
  }
};

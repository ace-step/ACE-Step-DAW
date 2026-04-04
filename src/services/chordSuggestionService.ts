/**
 * Chord suggestion service — orchestrates the ChordSeqAI worker,
 * model lifecycle, and store updates.
 */
import type { ChordModelVariant, ChordStyleCondition, ChordWorkerResponse } from '../types/chordSuggestion';
import { useChordSuggestionStore } from '../store/chordSuggestionStore';
import { loadChordModelBytes, CHORD_MODEL_REGISTRY } from './chordModelManager';

let worker: Worker | null = null;
let loadedModelVariant: ChordModelVariant | null = null;
let pendingPrediction = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/chordWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      useChordSuggestionStore.getState().setError(`Worker error: ${e.message}`);
    };
  }
  return worker;
}

function handleWorkerMessage(e: MessageEvent<ChordWorkerResponse>) {
  const msg = e.data;
  const store = useChordSuggestionStore.getState();

  switch (msg.type) {
    case 'model-loaded':
      store.setStatus('ready');
      // If there's a pending prediction after model load, run it
      if (pendingPrediction) {
        pendingPrediction = false;
        void requestPrediction();
      }
      break;

    case 'prediction':
      store.setSuggestions(msg.suggestions);
      break;

    case 'progress':
      store.setStatus('loading-model');
      break;

    case 'error':
      store.setError(msg.error);
      break;
  }
}

/**
 * Ensure the model is loaded, downloading if necessary.
 */
export async function ensureModelLoaded(variant?: ChordModelVariant): Promise<void> {
  const store = useChordSuggestionStore.getState();
  const targetVariant = variant ?? store.modelVariant;

  if (loadedModelVariant === targetVariant) return;

  store.setStatus('loading-model');

  const meta = CHORD_MODEL_REGISTRY[targetVariant];
  const w = getWorker();

  try {
    const modelBytes = await loadChordModelBytes(targetVariant, (percent, message) => {
      // Progress is reported but we don't update the store for download progress
      // to avoid excessive re-renders; the status is already 'loading-model'
      void percent;
      void message;
    });

    w.postMessage({ type: 'load-model', modelUrl: meta.url, modelBytes });
    loadedModelVariant = targetVariant;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load model');
  }
}

/**
 * Request a prediction based on current progression.
 * Automatically loads the model if needed.
 */
export async function requestPrediction(): Promise<void> {
  const store = useChordSuggestionStore.getState();

  if (store.progression.length === 0) {
    store.setSuggestions([]);
    return;
  }

  if (store.status === 'loading-model') {
    pendingPrediction = true;
    return;
  }

  if (loadedModelVariant !== store.modelVariant) {
    pendingPrediction = true;
    await ensureModelLoaded();
    return;
  }

  store.setStatus('predicting');
  const w = getWorker();

  const meta = CHORD_MODEL_REGISTRY[store.modelVariant];
  const style = meta.conditional ? store.styleCondition : undefined;

  w.postMessage({
    type: 'predict',
    sequence: store.progression,
    style,
    topK: store.topK,
  });
}

/**
 * Add a chord and immediately request prediction for next chord.
 */
export async function addChordAndPredict(tokenIndex: number): Promise<void> {
  useChordSuggestionStore.getState().addChord(tokenIndex);
  await requestPrediction();
}

/**
 * Remove last chord and re-predict.
 */
export async function undoLastChordAndPredict(): Promise<void> {
  useChordSuggestionStore.getState().removeLastChord();
  await requestPrediction();
}

/**
 * Clear progression and suggestions.
 */
export function clearAll(): void {
  useChordSuggestionStore.getState().clearProgression();
}

/**
 * Terminate the worker (cleanup).
 */
export function dispose(): void {
  worker?.terminate();
  worker = null;
  loadedModelVariant = null;
}

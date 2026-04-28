/**
 * Chord suggestion service — orchestrates the ChordSeqAI worker,
 * model lifecycle, and store updates.
 */
import type { ChordModelVariant, ChordStyleCondition, ChordWorkerResponse } from '../types/chordSuggestion';
import { useChordSuggestionStore } from '../store/chordSuggestionStore';
import { loadChordModelBytes, CHORD_MODEL_REGISTRY } from './chordModelManager';
import { loadFullVocabulary, isFullVocabularyLoaded } from '../utils/chordVocabulary';

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
      // Only now confirm the model variant is loaded (after worker confirms success)
      loadedModelVariant = useChordSuggestionStore.getState().modelVariant;
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
      // Reset loadedModelVariant so retry is possible
      loadedModelVariant = null;
      store.setError(msg.error);
      break;
  }
}

/**
 * Ensure the full ChordSeqAI vocabulary (1033 tokens) is loaded.
 */
async function ensureVocabulary(): Promise<void> {
  if (!isFullVocabularyLoaded()) {
    await loadFullVocabulary();
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
    // Load vocabulary and model in parallel; both must complete before predictions
    const [, modelBytes] = await Promise.all([
      ensureVocabulary(),
      loadChordModelBytes(targetVariant, (percent, message) => {
        void percent;
        void message;
      }),
    ]);

    // Don't set loadedModelVariant here — wait for worker 'model-loaded' confirmation
    w.postMessage({ type: 'load-model', modelUrl: meta.url, modelBytes });
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

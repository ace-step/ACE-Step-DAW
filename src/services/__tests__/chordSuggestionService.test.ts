import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Store mock ────────────────────────────────────────────────────

const mockStore = {
  progression: [] as number[],
  suggestions: [] as Array<{ tokenIndex: number; label: string; probability: number }>,
  status: 'idle' as string,
  modelVariant: 'small' as string,
  styleCondition: null as unknown,
  topK: 5,
  setStatus: vi.fn(),
  setSuggestions: vi.fn(),
  setError: vi.fn(),
  addChord: vi.fn(),
  removeLastChord: vi.fn(),
  clearProgression: vi.fn(),
};

vi.mock('../../store/chordSuggestionStore', () => ({
  useChordSuggestionStore: { getState: () => mockStore },
}));

// ── Worker mock ───────────────────────────────────────────────────

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postedMessages: Array<Record<string, unknown>> = [];
  terminate = vi.fn();

  postMessage(msg: Record<string, unknown>) {
    this.postedMessages.push(msg);
  }
}

let lastWorker: MockWorker | null = null;

class WorkerProxy {
  constructor() {
    lastWorker = new MockWorker();
    return lastWorker as unknown as WorkerProxy;
  }
}

vi.stubGlobal('Worker', WorkerProxy);

// ── Model manager mock ────────────────────────────────────────────

vi.mock('../chordModelManager', () => ({
  loadChordModelBytes: vi.fn(async () => new ArrayBuffer(100)),
  CHORD_MODEL_REGISTRY: {
    small: { url: 'model-small.onnx', conditional: false },
    large: { url: 'model-large.onnx', conditional: true },
  },
}));

vi.mock('../../utils/chordVocabulary', () => ({
  loadFullVocabulary: vi.fn(async () => {}),
  isFullVocabularyLoaded: vi.fn(() => true),
}));

// ── Import after mocks ────────────────────────────────────────────

import {
  ensureModelLoaded,
  requestPrediction,
  addChordAndPredict,
  undoLastChordAndPredict,
  clearAll,
  dispose,
} from '../chordSuggestionService';

// ── Tests ─────────────────────────────────────────────────────────

describe('chordSuggestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWorker = null;
    mockStore.progression = [];
    mockStore.status = 'idle';
    mockStore.modelVariant = 'small';
    mockStore.topK = 5;
    mockStore.styleCondition = null;
    dispose(); // Reset module state
  });

  afterEach(() => {
    dispose();
  });

  describe('ensureModelLoaded', () => {
    it('sets status to loading-model and posts to worker', async () => {
      await ensureModelLoaded('small');

      expect(mockStore.setStatus).toHaveBeenCalledWith('loading-model');
      expect(lastWorker).toBeTruthy();
      expect(lastWorker!.postedMessages).toHaveLength(1);
      expect(lastWorker!.postedMessages[0]).toEqual(
        expect.objectContaining({ type: 'load-model' }),
      );
    });

    it('skips loading if model is already loaded', async () => {
      // Load once
      await ensureModelLoaded('small');
      // Simulate worker confirming load
      lastWorker!.onmessage?.(new MessageEvent('message', {
        data: { type: 'model-loaded' },
      }));

      // Remember how many messages were posted so far
      const prevCount = lastWorker!.postedMessages.length;

      // Try loading same variant again
      await ensureModelLoaded('small');

      // Should not post any new load messages
      expect(lastWorker!.postedMessages.length).toBe(prevCount);
    });
  });

  describe('requestPrediction', () => {
    it('clears suggestions when progression is empty', async () => {
      mockStore.progression = [];
      await requestPrediction();
      expect(mockStore.setSuggestions).toHaveBeenCalledWith([]);
    });

    it('defers prediction if model is loading', async () => {
      mockStore.progression = [42];
      mockStore.status = 'loading-model';

      await requestPrediction();

      // Should not have posted a predict message
      if (lastWorker) {
        const predictMsgs = lastWorker.postedMessages.filter(m => m.type === 'predict');
        expect(predictMsgs).toHaveLength(0);
      }
    });

    it('loads model if not yet loaded then defers prediction', async () => {
      mockStore.progression = [42];

      await requestPrediction();

      expect(mockStore.setStatus).toHaveBeenCalledWith('loading-model');
    });
  });

  describe('addChordAndPredict', () => {
    it('adds chord to store and requests prediction', async () => {
      mockStore.progression = [];
      await addChordAndPredict(42);

      expect(mockStore.addChord).toHaveBeenCalledWith(42);
    });
  });

  describe('undoLastChordAndPredict', () => {
    it('removes last chord and requests prediction', async () => {
      mockStore.progression = [42, 43];
      await undoLastChordAndPredict();

      expect(mockStore.removeLastChord).toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('clears the progression in the store', () => {
      clearAll();
      expect(mockStore.clearProgression).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('terminates the worker', async () => {
      await ensureModelLoaded('small');
      const workerRef = lastWorker;
      dispose();
      expect(workerRef!.terminate).toHaveBeenCalled();
    });

    it('is safe to call multiple times', () => {
      dispose();
      dispose();
      // No error
    });
  });

  describe('worker message handling', () => {
    it('handles model-loaded message', async () => {
      await ensureModelLoaded('small');
      lastWorker!.onmessage?.(new MessageEvent('message', {
        data: { type: 'model-loaded' },
      }));
      expect(mockStore.setStatus).toHaveBeenCalledWith('ready');
    });

    it('handles prediction message', async () => {
      await ensureModelLoaded('small');
      const suggestions = [
        { tokenIndex: 10, label: 'C', probability: 0.5 },
        { tokenIndex: 20, label: 'G', probability: 0.3 },
      ];
      lastWorker!.onmessage?.(new MessageEvent('message', {
        data: { type: 'prediction', suggestions },
      }));
      expect(mockStore.setSuggestions).toHaveBeenCalledWith(suggestions);
    });

    it('handles error message and resets loaded model state', async () => {
      await ensureModelLoaded('small');
      expect(lastWorker!.postedMessages.filter((msg) => msg.type === 'load-model')).toHaveLength(1);

      lastWorker!.onmessage?.(new MessageEvent('message', {
        data: { type: 'error', error: 'Model failed to load' },
      }));
      expect(mockStore.setError).toHaveBeenCalledWith('Model failed to load');

      // After error, re-loading the same variant should post a new load-model message
      await ensureModelLoaded('small');
      expect(lastWorker!.postedMessages.filter((msg) => msg.type === 'load-model')).toHaveLength(2);
    });

    it('handles progress message', async () => {
      await ensureModelLoaded('small');
      lastWorker!.onmessage?.(new MessageEvent('message', {
        data: { type: 'progress' },
      }));
      expect(mockStore.setStatus).toHaveBeenCalledWith('loading-model');
    });
  });
});

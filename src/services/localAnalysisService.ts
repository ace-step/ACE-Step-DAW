/**
 * Local audio analysis service — orchestrates Web Worker for BPM/chord detection.
 */
import { useProjectStore } from '../store/projectStore';
import { useAnalysisStore } from '../store/analysisStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { downsampleToMono } from '../utils/melSpectrogram';
import type {
  AnalysisTask,
  AnalysisWorkerMessage,
  AnalysisWorkerRequest,
  LocalAnalysisResult,
} from '../types/analysis';

const TARGET_SAMPLE_RATE = 22050;

// Singleton worker — kept alive for session reuse
let workerInstance: Worker | null = null;

function getOrCreateWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/analysisWorker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return workerInstance;
}

/**
 * Terminate the analysis worker (e.g., on cleanup).
 */
export function terminateAnalysisWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

/**
 * Analyze a clip locally using ONNX models in a Web Worker.
 * Returns the analysis result and writes it to the clip's inferredMetas.
 */
export async function analyzeClipLocally(
  clipId: string,
  tasks: AnalysisTask[] = ['bpm', 'chords'],
): Promise<LocalAnalysisResult> {
  const store = useAnalysisStore.getState();
  const jobId = store.createJob(clipId);

  try {
    // 1. Load audio blob from IndexedDB
    const clip = useProjectStore.getState().getClipById(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) throw new Error('No audio available for this clip');

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) throw new Error('Audio blob not found in storage');

    // 2. Decode to AudioBuffer
    useAnalysisStore.getState().updateJobProgress(jobId, {
      type: 'progress',
      status: 'decoding-audio',
      percent: 5,
      message: 'Decoding audio...',
    });

    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, 1, TARGET_SAMPLE_RATE);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // 3. Downsample to mono
    const samples = downsampleToMono(audioBuffer, TARGET_SAMPLE_RATE);

    // 4. Send to worker
    const worker = getOrCreateWorker();

    const result = await new Promise<LocalAnalysisResult>((resolve, reject) => {
      const handleMessage = (e: MessageEvent<AnalysisWorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          useAnalysisStore.getState().updateJobProgress(jobId, msg);
        } else if (msg.type === 'result') {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          useAnalysisStore.getState().completeJob(jobId, msg.result);
          resolve(msg.result);
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          reject(new Error(msg.error));
        }
      };

      const handleError = (e: ErrorEvent) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(new Error(e.message || 'Worker error'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const request: AnalysisWorkerRequest = {
        type: 'analyze',
        samples,
        sampleRate: TARGET_SAMPLE_RATE,
        tasks,
      };

      // Transfer the samples buffer to the worker (zero-copy)
      worker.postMessage(request, [samples.buffer]);
    });

    // 5. Write results to clip.inferredMetas
    useProjectStore.getState().updateClip(clipId, {
      inferredMetas: {
        ...clip.inferredMetas,
        bpm: result.bpm,
        keyScale: result.keyScale ?? undefined,
        timeSignature: result.timeSignature ?? undefined,
        beats: result.beats,
        chords: result.chords,
        analysisSource: 'local',
      },
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    useAnalysisStore.getState().failJob(jobId, errorMsg);
    throw err;
  }
}

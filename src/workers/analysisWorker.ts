/**
 * Web Worker for local audio analysis (BPM/chord detection via ONNX Runtime).
 *
 * Receives Float32Array samples, computes features, runs inference, posts results.
 * ONNX sessions are kept alive for reuse across multiple analyses.
 */
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerProgress,
  AnalysisWorkerResult,
  AnalysisWorkerError,
  BeatEvent,
  ChordEvent,
  LocalAnalysisResult,
} from '../types/analysis';
import { computeMelSpectrogram } from '../utils/melSpectrogram';

// ONNX Runtime session handles — lazily initialized
let bpmSession: unknown = null;
let chordSession: unknown = null;
let ortModule: typeof import('onnxruntime-web') | null = null;

function postProgress(status: AnalysisWorkerProgress['status'], percent: number, message: string) {
  self.postMessage({ type: 'progress', status, percent, message } satisfies AnalysisWorkerProgress);
}

async function getOrt() {
  if (!ortModule) {
    ortModule = await import('onnxruntime-web');
  }
  return ortModule;
}

async function loadOnnxSession(modelUrl: string) {
  const ort = await getOrt();
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
  });
}

/**
 * Run Beat This! small model inference.
 * Input: mel spectrogram [1, n_mels, n_frames]
 * Output: beat activations [1, n_frames, 2] (beat prob, downbeat prob)
 */
async function runBpmInference(
  session: Awaited<ReturnType<typeof loadOnnxSession>>,
  melFrames: Float32Array[],
  sampleRate: number,
  hopLength: number,
): Promise<{ bpm: number; beats: BeatEvent[] }> {
  const ort = await getOrt();
  const nFrames = melFrames.length;
  const nMels = melFrames[0]?.length ?? 128;

  // Flatten mel spectrogram to [1, nMels, nFrames] (channels-first)
  const inputData = new Float32Array(nMels * nFrames);
  for (let m = 0; m < nMels; m++) {
    for (let f = 0; f < nFrames; f++) {
      inputData[m * nFrames + f] = melFrames[f][m];
    }
  }

  const inputTensor = new ort.Tensor('float32', inputData, [1, nMels, nFrames]);
  const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};

  // Try common input names — model may use 'input', 'audio', 'mel', etc.
  const inputNames = session.inputNames;
  feeds[inputNames[0]] = inputTensor;

  const results = await session.run(feeds);
  const outputNames = session.outputNames;
  const output = results[outputNames[0]];
  const outputData = output.data as Float32Array;

  // Parse output: assume [n_frames, 2] or [1, n_frames, 2]
  // Column 0 = beat probability, Column 1 = downbeat probability
  const beats: BeatEvent[] = [];
  const frameTimeStep = hopLength / sampleRate;
  const beatThreshold = 0.5;

  const totalOutputFrames = outputData.length / 2;
  for (let i = 0; i < totalOutputFrames; i++) {
    const beatProb = outputData[i * 2];
    const downbeatProb = outputData[i * 2 + 1];
    if (beatProb > beatThreshold) {
      beats.push({
        time: i * frameTimeStep,
        isDownbeat: downbeatProb > beatThreshold,
        confidence: beatProb,
      });
    }
  }

  // Estimate BPM from beat intervals
  let bpm = 120; // fallback
  if (beats.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i].time - beats[i - 1].time);
    }
    const medianInterval = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    if (medianInterval > 0) {
      bpm = Math.round(60 / medianInterval);
    }
  }

  return { bpm, beats };
}

/**
 * Run consonance-ACE model inference.
 * Input: mel/CQT features
 * Output: chord activations (root, bass, notes) → chord labels
 */
async function runChordInference(
  session: Awaited<ReturnType<typeof loadOnnxSession>>,
  melFrames: Float32Array[],
  sampleRate: number,
  hopLength: number,
): Promise<ChordEvent[]> {
  const ort = await getOrt();
  const nFrames = melFrames.length;
  const nMels = melFrames[0]?.length ?? 128;

  // Flatten to [1, nMels, nFrames]
  const inputData = new Float32Array(nMels * nFrames);
  for (let m = 0; m < nMels; m++) {
    for (let f = 0; f < nFrames; f++) {
      inputData[m * nFrames + f] = melFrames[f][m];
    }
  }

  const inputTensor = new ort.Tensor('float32', inputData, [1, nMels, nFrames]);
  const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);

  // Parse chord outputs — consonance-ACE outputs decomposed activations
  // For now, extract per-frame chord class indices from the first output
  const outputNames = session.outputNames;
  const output = results[outputNames[0]];
  const outputData = output.data as Float32Array;

  // Interpret as per-frame chord class probabilities or labels
  const frameTimeStep = hopLength / sampleRate;
  const chordLabels = decodeChordLabels(outputData, nFrames);

  // Merge consecutive identical chords
  const chords: ChordEvent[] = [];
  let currentLabel = '';
  let startTime = 0;
  let maxConf = 0;

  for (let i = 0; i < chordLabels.length; i++) {
    const { label, confidence } = chordLabels[i];
    if (label !== currentLabel) {
      if (currentLabel) {
        chords.push({
          startTime,
          endTime: i * frameTimeStep,
          label: currentLabel,
          confidence: maxConf,
        });
      }
      currentLabel = label;
      startTime = i * frameTimeStep;
      maxConf = confidence;
    } else {
      maxConf = Math.max(maxConf, confidence);
    }
  }
  // Final chord
  if (currentLabel) {
    chords.push({
      startTime,
      endTime: chordLabels.length * frameTimeStep,
      label: currentLabel,
      confidence: maxConf,
    });
  }

  return chords;
}

// Basic chord vocabulary for consonance-ACE (170 classes simplified to common labels)
const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const QUALITY_NAMES = ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'min7', 'dim7', 'hdim7', 'sus2', 'sus4', 'N'];

function decodeChordLabels(
  outputData: Float32Array,
  nFrames: number,
): { label: string; confidence: number }[] {
  const nClasses = Math.floor(outputData.length / nFrames);
  const labels: { label: string; confidence: number }[] = [];

  for (let f = 0; f < nFrames; f++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < nClasses; c++) {
      const val = outputData[f * nClasses + c];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }

    // Map class index to chord label
    const confidence = Math.min(1, Math.max(0, maxVal));
    if (maxIdx === 0 || nClasses <= 1) {
      labels.push({ label: 'N', confidence });
    } else {
      // Map index to root + quality
      const adjustedIdx = maxIdx - 1; // 0 = "N" (no chord)
      const rootIdx = adjustedIdx % 12;
      const qualityIdx = Math.floor(adjustedIdx / 12) % QUALITY_NAMES.length;
      const root = ROOT_NAMES[rootIdx];
      const quality = QUALITY_NAMES[qualityIdx];
      labels.push({ label: `${root}:${quality}`, confidence });
    }
  }

  return labels;
}

/**
 * Infer key/scale from the most frequent chord roots.
 */
function inferKeyFromChords(chords: ChordEvent[]): string | null {
  if (chords.length === 0) return null;

  // Weight by duration
  const rootWeights = new Map<string, number>();
  for (const chord of chords) {
    if (chord.label === 'N') continue;
    const root = chord.label.split(':')[0];
    const duration = chord.endTime - chord.startTime;
    rootWeights.set(root, (rootWeights.get(root) ?? 0) + duration);
  }

  if (rootWeights.size === 0) return null;

  // Most frequent root is likely the key
  let maxRoot = '';
  let maxWeight = 0;
  for (const [root, weight] of rootWeights) {
    if (weight > maxWeight) {
      maxWeight = weight;
      maxRoot = root;
    }
  }

  // Check if major or minor chords dominate for that root
  const majorWeight = chords
    .filter((c) => c.label.startsWith(`${maxRoot}:maj`))
    .reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
  const minorWeight = chords
    .filter((c) => c.label.startsWith(`${maxRoot}:min`))
    .reduce((sum, c) => sum + (c.endTime - c.startTime), 0);

  return `${maxRoot} ${majorWeight >= minorWeight ? 'major' : 'minor'}`;
}

/**
 * Infer time signature from downbeat spacing.
 */
function inferTimeSignature(beats: BeatEvent[]): string | null {
  const downbeats = beats.filter((b) => b.isDownbeat);
  if (downbeats.length < 2) return null;

  // Count beats between consecutive downbeats
  const beatsPerBar: number[] = [];
  for (let i = 0; i < downbeats.length - 1; i++) {
    const start = downbeats[i].time;
    const end = downbeats[i + 1].time;
    const count = beats.filter((b) => b.time >= start && b.time < end).length;
    beatsPerBar.push(count);
  }

  // Most frequent beats-per-bar
  const counts = new Map<number, number>();
  for (const c of beatsPerBar) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let bestCount = 4;
  let bestFreq = 0;
  for (const [count, freq] of counts) {
    if (freq > bestFreq) {
      bestFreq = freq;
      bestCount = count;
    }
  }

  return `${bestCount}/4`;
}

// ---------- Worker message handler ----------

self.onmessage = async (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { samples, sampleRate, tasks } = e.data;

  try {
    // Compute mel spectrogram
    postProgress('computing-features', 10, 'Computing mel spectrogram...');
    const hopLength = 441;
    const melFrames = computeMelSpectrogram(samples, {
      sampleRate,
      nFft: 2048,
      hopLength,
      nMels: 128,
      fMin: 30,
      fMax: 11000,
    });

    let beats: BeatEvent[] = [];
    let bpm = 120;

    if (tasks.includes('bpm')) {
      postProgress('loading-model', 20, 'Loading BPM model...');
      if (!bpmSession) {
        bpmSession = await loadOnnxSession('/models/beat-this-small.onnx');
      }
      postProgress('running-bpm', 40, 'Detecting beats...');
      const bpmResult = await runBpmInference(
        bpmSession as Awaited<ReturnType<typeof loadOnnxSession>>,
        melFrames,
        sampleRate,
        hopLength,
      );
      beats = bpmResult.beats;
      bpm = bpmResult.bpm;
    }

    let chords: ChordEvent[] = [];

    if (tasks.includes('chords')) {
      postProgress('loading-model', 55, 'Loading chord model...');
      if (!chordSession) {
        chordSession = await loadOnnxSession('/models/consonance-ace.onnx');
      }
      postProgress('running-chords', 70, 'Recognizing chords...');
      chords = await runChordInference(
        chordSession as Awaited<ReturnType<typeof loadOnnxSession>>,
        melFrames,
        sampleRate,
        hopLength,
      );
    }

    postProgress('post-processing', 90, 'Finalizing results...');
    const keyScale = inferKeyFromChords(chords);
    const timeSignature = inferTimeSignature(beats);

    const result: LocalAnalysisResult = { bpm, beats, chords, keyScale, timeSignature };
    self.postMessage({ type: 'result', result } satisfies AnalysisWorkerResult);
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies AnalysisWorkerError);
  }
};

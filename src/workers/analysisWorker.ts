/**
 * Web Worker for local audio analysis (BPM/chord detection via ONNX Runtime).
 *
 * Beat This! pipeline:
 *   audio → mel spectrogram (n_fft=1024, hop=441, power=1, log1p(1000*mel))
 *   → ONNX inference → 2 outputs: beat_logits[1,T], downbeat_logits[1,T]
 *   → peak-picking (max_pool1d kernel=7, logit > 0)
 *   → BPM from median inter-beat interval
 *
 * consonance-ACE pipeline:
 *   audio → CQT (144 bins, 24 bins/oct, 6 octaves from C1, hop=512)
 *   → ONNX inference → 3 outputs: root[1,T,13], bass[1,T,13], chord[1,T,12]
 *   → argmax root/bass, sigmoid chord → chord labels
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
import { computeMelSpectrogram, BEAT_THIS_MEL_OPTIONS } from '../utils/melSpectrogram';
import { computeCQT, cqtToOnnxInput, CONSONANCE_ACE_CQT_OPTIONS } from '../utils/cqt';

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

// ---------- Peak-picking for beat detection ----------

/**
 * 1D max-pooling: for each position, returns the max value in a window of `kernelSize`.
 * Matches PyTorch's F.max_pool1d with padding=kernelSize//2.
 */
function maxPool1d(data: Float32Array, kernelSize: number): Float32Array {
  const n = data.length;
  const result = new Float32Array(n);
  const pad = Math.floor(kernelSize / 2);
  for (let i = 0; i < n; i++) {
    let max = -Infinity;
    for (let j = -pad; j <= pad; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < n) {
        max = Math.max(max, data[idx]);
      } else {
        // Padding with -Infinity (matching Beat This! which uses -1000)
        max = Math.max(max, -1000);
      }
    }
    result[i] = max;
  }
  return result;
}

/**
 * Pick local maxima from logits, matching Beat This! minimal postprocessor.
 * 1. max_pool1d with kernel=7 (±70ms at 50fps) to find local maxima
 * 2. Keep peaks where logit > 0 (probability > 0.5 after sigmoid)
 */
export function peakPick(logits: Float32Array, kernelSize: number = 7): number[] {
  const pooled = maxPool1d(logits, kernelSize);
  const peaks: number[] = [];
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] === pooled[i] && logits[i] > 0) {
      peaks.push(i);
    }
  }
  return peaks;
}

// ---------- BPM inference ----------

/**
 * Run Beat This! ONNX model inference.
 *
 * Model I/O (from beat_this_cpp ONNX):
 *   Input:  "input_spectrogram" [1, time, 128]  (batch, time_frames, mel_bins)
 *   Output: "beat" [1, time], "downbeat" [1, time]  (logits, not probabilities)
 */
async function runBpmInference(
  session: Awaited<ReturnType<typeof loadOnnxSession>>,
  melFrames: Float32Array[],
): Promise<{ bpm: number; beats: BeatEvent[] }> {
  const ort = await getOrt();
  const nFrames = melFrames.length;
  const nMels = melFrames[0]?.length ?? 128;

  // Flatten to [1, nFrames, nMels] — Beat This! expects [batch, time, freq]
  const inputData = new Float32Array(nFrames * nMels);
  for (let f = 0; f < nFrames; f++) {
    for (let m = 0; m < nMels; m++) {
      inputData[f * nMels + m] = melFrames[f][m];
    }
  }

  const inputTensor = new ort.Tensor('float32', inputData, [1, nFrames, nMels]);
  const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);

  // Beat This! outputs two separate tensors: "beat" and "downbeat"
  const outputNames = session.outputNames;
  const beatLogits = results[outputNames[0]].data as Float32Array;
  const downbeatLogits = results[outputNames[1]].data as Float32Array;

  // Peak-picking: max_pool1d(kernel=7) + threshold at logit > 0
  const beatFrames = peakPick(beatLogits, 7);
  const downbeatFrames = new Set(peakPick(downbeatLogits, 7));

  // Convert frames to time (hop=441 @ 22050Hz = 20ms per frame)
  const frameTimeStep = 441 / 22050;

  const beats: BeatEvent[] = beatFrames.map((frame) => ({
    time: frame * frameTimeStep,
    isDownbeat: downbeatFrames.has(frame),
    confidence: 1 / (1 + Math.exp(-beatLogits[frame])), // sigmoid
  }));

  // Estimate BPM from median inter-beat interval
  let bpm = 120; // fallback
  if (beats.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i].time - beats[i - 1].time);
    }
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    if (medianInterval > 0) {
      bpm = Math.round(60 / medianInterval);
    }
  }

  return { bpm, beats };
}

// ---------- Chord inference ----------

const ROOT_LABELS = ['N', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Decode chord label from consonance-ACE decomposed outputs.
 * root: argmax of 13 classes (0=N, 1-12=C..B)
 * chord: sigmoid of 12 classes (C..B note activations), threshold=0.5
 */
function decodeChord(rootIdx: number, _bassIdx: number, chordProbs: number[]): string {
  if (rootIdx === 0) return 'N';

  const root = ROOT_LABELS[rootIdx];
  const activeNotes: string[] = [];
  for (let i = 0; i < chordProbs.length; i++) {
    if (chordProbs[i] > 0.5) {
      activeNotes.push(PITCH_CLASSES[i]);
    }
  }

  // Determine quality from active notes relative to root
  if (activeNotes.length === 0) return root;

  // Simple quality detection based on intervals
  const rootPitchIdx = rootIdx - 1; // 0-based pitch class
  const intervals = activeNotes.map((note) => {
    const noteIdx = PITCH_CLASSES.indexOf(note);
    return (noteIdx - rootPitchIdx + 12) % 12;
  });

  const hasMinor3 = intervals.includes(3);
  const hasMajor3 = intervals.includes(4);
  const hasDim5 = intervals.includes(6);
  const hasPerfect5 = intervals.includes(7);
  const hasMinor7 = intervals.includes(10);
  const hasMajor7 = intervals.includes(11);

  if (hasDim5 && hasMinor3) return `${root}:dim`;
  if (hasMajor3 && !hasPerfect5 && !hasDim5) return `${root}:aug`;
  if (hasMinor3 && hasMinor7) return `${root}:min7`;
  if (hasMajor3 && hasMinor7) return `${root}:7`;
  if (hasMajor3 && hasMajor7) return `${root}:maj7`;
  if (hasMinor3) return `${root}:min`;
  if (hasMajor3) return `${root}:maj`;

  return root;
}

/**
 * Run consonance-ACE ONNX model inference.
 *
 * Model I/O:
 *   Input:  "cqt_features" [1, 1, 144, n_frames]
 *   Output: "root_logits" [1, T, 13], "bass_logits" [1, T, 13], "chord_logits" [1, T, 12]
 */
async function runChordInference(
  session: Awaited<ReturnType<typeof loadOnnxSession>>,
  samples: Float32Array,
): Promise<ChordEvent[]> {
  const ort = await getOrt();

  // Compute CQT features
  const { data: cqtData, nBins, nFrames } = computeCQT(samples, CONSONANCE_ACE_CQT_OPTIONS);

  // Flatten to [1, 1, nBins, nFrames]
  const inputData = cqtToOnnxInput(cqtData, nBins, nFrames);
  const inputTensor = new ort.Tensor('float32', inputData, [1, 1, nBins, nFrames]);

  const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);

  // consonance-ACE outputs 3 tensors
  const outputNames = session.outputNames;
  const rootLogits = results[outputNames[0]].data as Float32Array;   // [1, T, 13]
  const bassLogits = results[outputNames[1]].data as Float32Array;   // [1, T, 13]
  const chordLogits = results[outputNames[2]].data as Float32Array;  // [1, T, 12]

  // Decode per-frame chord labels
  const nRootClasses = 13;
  const nBassClasses = 13;
  const nChordClasses = 12;
  const frameTimeStep = CONSONANCE_ACE_CQT_OPTIONS.hopLength / CONSONANCE_ACE_CQT_OPTIONS.sampleRate;

  const frameLabels: { label: string; confidence: number }[] = [];
  for (let f = 0; f < nFrames; f++) {
    // Argmax for root
    let rootIdx = 0, rootMax = -Infinity;
    for (let c = 0; c < nRootClasses; c++) {
      const val = rootLogits[f * nRootClasses + c];
      if (val > rootMax) { rootMax = val; rootIdx = c; }
    }

    // Argmax for bass
    let bassIdx = 0, bassMax = -Infinity;
    for (let c = 0; c < nBassClasses; c++) {
      const val = bassLogits[f * nBassClasses + c];
      if (val > bassMax) { bassMax = val; bassIdx = c; }
    }

    // Sigmoid for chord note activations
    const chordProbs: number[] = [];
    for (let c = 0; c < nChordClasses; c++) {
      const logit = chordLogits[f * nChordClasses + c];
      chordProbs.push(1 / (1 + Math.exp(-logit)));
    }

    const label = decodeChord(rootIdx, bassIdx, chordProbs);
    // Confidence: softmax probability of the root class
    const rootConfidence = Math.exp(rootMax) / (
      Array.from({ length: nRootClasses }, (_, c) =>
        Math.exp(rootLogits[f * nRootClasses + c])
      ).reduce((a, b) => a + b, 0)
    );

    frameLabels.push({ label, confidence: rootConfidence });
  }

  // Merge consecutive identical chords
  const chords: ChordEvent[] = [];
  let currentLabel = '';
  let startTime = 0;
  let maxConf = 0;

  for (let i = 0; i < frameLabels.length; i++) {
    const { label, confidence } = frameLabels[i];
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
      endTime: frameLabels.length * frameTimeStep,
      label: currentLabel,
      confidence: maxConf,
    });
  }

  // Filter out very short chords (< 0.3s)
  return chords.filter((c) => c.endTime - c.startTime >= 0.3);
}

// ---------- Key and time signature inference ----------

function inferKeyFromChords(chords: ChordEvent[]): string | null {
  if (chords.length === 0) return null;

  const rootWeights = new Map<string, number>();
  for (const chord of chords) {
    if (chord.label === 'N') continue;
    const root = chord.label.split(':')[0];
    const duration = chord.endTime - chord.startTime;
    rootWeights.set(root, (rootWeights.get(root) ?? 0) + duration);
  }
  if (rootWeights.size === 0) return null;

  let maxRoot = '';
  let maxWeight = 0;
  for (const [root, weight] of rootWeights) {
    if (weight > maxWeight) { maxWeight = weight; maxRoot = root; }
  }

  const majorWeight = chords
    .filter((c) => c.label.startsWith(`${maxRoot}:maj`))
    .reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
  const minorWeight = chords
    .filter((c) => c.label.startsWith(`${maxRoot}:min`))
    .reduce((sum, c) => sum + (c.endTime - c.startTime), 0);

  return `${maxRoot} ${majorWeight >= minorWeight ? 'major' : 'minor'}`;
}

function inferTimeSignature(beats: BeatEvent[]): string | null {
  const downbeats = beats.filter((b) => b.isDownbeat);
  if (downbeats.length < 2) return null;

  const beatsPerBar: number[] = [];
  for (let i = 0; i < downbeats.length - 1; i++) {
    const start = downbeats[i].time;
    const end = downbeats[i + 1].time;
    const count = beats.filter((b) => b.time >= start && b.time < end).length;
    beatsPerBar.push(count);
  }

  const counts = new Map<number, number>();
  for (const c of beatsPerBar) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let bestCount = 4;
  let bestFreq = 0;
  for (const [count, freq] of counts) {
    if (freq > bestFreq) { bestFreq = freq; bestCount = count; }
  }

  return `${bestCount}/4`;
}

// ---------- Worker message handler ----------

self.onmessage = async (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { samples, sampleRate, tasks } = e.data;

  try {
    let beats: BeatEvent[] = [];
    let bpm = 120;

    if (tasks.includes('bpm')) {
      // Compute mel spectrogram with Beat This! settings
      postProgress('computing-features', 10, 'Computing mel spectrogram...');
      const melFrames = computeMelSpectrogram(samples, {
        ...BEAT_THIS_MEL_OPTIONS,
        sampleRate,
      });

      postProgress('loading-model', 20, 'Loading BPM model...');
      if (!bpmSession) {
        bpmSession = await loadOnnxSession('/models/beat-this.onnx');
      }
      postProgress('running-bpm', 40, 'Detecting beats...');
      const bpmResult = await runBpmInference(
        bpmSession as Awaited<ReturnType<typeof loadOnnxSession>>,
        melFrames,
      );
      beats = bpmResult.beats;
      bpm = bpmResult.bpm;
    }

    let chords: ChordEvent[] = [];

    if (tasks.includes('chords')) {
      // Normalize audio to [-1, 1] for CQT (matching consonance-ACE preprocessing)
      const maxVal = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      const normalizedSamples = maxVal > 0
        ? samples.map((v) => v / maxVal)
        : samples;

      postProgress('computing-features', 50, 'Computing CQT features...');
      postProgress('loading-model', 55, 'Loading chord model...');
      if (!chordSession) {
        chordSession = await loadOnnxSession('/models/consonance-ace.onnx');
      }
      postProgress('running-chords', 70, 'Recognizing chords...');
      chords = await runChordInference(
        chordSession as Awaited<ReturnType<typeof loadOnnxSession>>,
        normalizedSamples,
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

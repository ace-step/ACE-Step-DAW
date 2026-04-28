/**
 * Web Worker for ChordSeqAI ONNX inference.
 *
 * Handles model loading and next-chord prediction.
 * Input: sequence of chord token indices → Output: probability distribution over all tokens.
 *
 * ChordSeqAI model format:
 *   - Input "input.1": int64 tensor [1, 256] — chord token sequence (0-padded)
 *   - Optional "onnx::Gemm_1": float32 tensor [1, 28] — style conditioning (conditional models)
 *   - Output: float32 tensor [1, 256, numTokens] — logits for each position
 *   - We take the logits at the last chord position, apply softmax, return top-K.
 */
import type { ChordWorkerRequest, ChordWorkerResponse, ChordStyleCondition } from '../types/chordSuggestion';
import { CHORD_GENRES, CHORD_DECADES } from '../types/chordSuggestion';

const MAX_SEQ_LEN = 256;
const NUM_GENRES = 20;
const NUM_DECADES = 8;
const STYLE_VEC_LEN = NUM_GENRES + NUM_DECADES; // 28

let session: unknown = null;
let ortModule: typeof import('onnxruntime-web') | null = null;
let isConditional = false;

function postResponse(msg: ChordWorkerResponse) {
  self.postMessage(msg);
}

async function getOrt() {
  if (!ortModule) {
    ortModule = await import('onnxruntime-web');
  }
  return ortModule;
}

async function loadModel(modelUrl: string, modelBytes?: ArrayBuffer) {
  const ort = await getOrt();

  postResponse({ type: 'progress', percent: 10, message: 'Loading ONNX model...' });

  let buffer: ArrayBuffer;
  if (modelBytes) {
    buffer = modelBytes;
  } else {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Failed to fetch chord model: ${response.status}`);
    buffer = await response.arrayBuffer();
  }

  postResponse({ type: 'progress', percent: 60, message: 'Creating inference session...' });

  session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
  });

  // Check if this is a conditional model by inspecting input names
  const sess = session as { inputNames: string[] };
  isConditional = sess.inputNames.some((name: string) => name.includes('Gemm'));

  postResponse({ type: 'progress', percent: 100, message: 'Model ready' });
  postResponse({ type: 'model-loaded' });
}

/**
 * Softmax over a Float32Array slice, masking specified indices to -Infinity.
 */
function softmax(logits: Float32Array, maskIndices?: Set<number>): Float32Array {
  const result = new Float32Array(logits.length);

  // Apply masks
  let maxVal = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    const val = maskIndices?.has(i) ? -Infinity : logits[i];
    result[i] = val;
    if (val > maxVal) maxVal = val;
  }

  // Compute exp and sum
  let sum = 0;
  for (let i = 0; i < result.length; i++) {
    result[i] = Math.exp(result[i] - maxVal);
    sum += result[i];
  }

  // Normalize
  if (sum > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] /= sum;
    }
  }

  return result;
}

/**
 * Build style conditioning vector for conditional models.
 * 28 floats: [20 genre weights, 8 decade weights].
 */
function buildStyleVector(style?: ChordStyleCondition): Float32Array {
  const vec = new Float32Array(STYLE_VEC_LEN);
  if (!style) return vec;

  const genreOrder: readonly string[] = CHORD_GENRES;
  const decadeOrder: readonly string[] = CHORD_DECADES;

  for (let i = 0; i < genreOrder.length; i++) {
    vec[i] = (style.genres as Record<string, number>)[genreOrder[i]] ?? 0;
  }
  for (let i = 0; i < decadeOrder.length; i++) {
    vec[NUM_GENRES + i] = (style.decades as Record<string, number>)[decadeOrder[i]] ?? 0;
  }

  return vec;
}

async function predict(sequence: number[], style?: ChordStyleCondition, topK = 8) {
  if (!session || !ortModule) {
    throw new Error('Model not loaded');
  }

  const ort = ortModule;
  const sess = session as {
    run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  };

  // Build input tensor: [1, 256] int64
  // Truncate to the most recent MAX_SEQ_LEN tokens for long progressions
  const truncated = sequence.length > MAX_SEQ_LEN
    ? sequence.slice(sequence.length - MAX_SEQ_LEN)
    : sequence;
  const inputData = new BigInt64Array(MAX_SEQ_LEN);
  for (let i = 0; i < truncated.length; i++) {
    inputData[i] = BigInt(truncated[i]);
  }

  const feeds: Record<string, unknown> = {
    'input.1': new ort.Tensor('int64', inputData, [1, MAX_SEQ_LEN]),
  };

  // Add style conditioning for conditional models
  if (isConditional) {
    const styleVec = buildStyleVector(style);
    feeds['onnx::Gemm_1'] = new ort.Tensor('float32', styleVec, [1, STYLE_VEC_LEN]);
  }

  const results = await sess.run(feeds);

  // Get output tensor — find the first output
  const outputKey = Object.keys(results)[0];
  const output = results[outputKey];
  const outputData = output.data;
  const dims = output.dims; // [1, 256, numTokens]

  const numTokens = dims[2];
  // Get logits at the position of the last chord in the (truncated) sequence
  const lastPos = Math.max(0, truncated.length - 1);
  const offset = lastPos * numTokens;
  const positionLogits = outputData.slice(offset, offset + numTokens);

  // Mask: prevent repeating the previous chord and special tokens
  const maskSet = new Set<number>();
  if (sequence.length > 0) {
    maskSet.add(sequence[sequence.length - 1]); // don't repeat last
  }
  // Mask start/end tokens (last 2 indices)
  maskSet.add(numTokens - 1);
  maskSet.add(numTokens - 2);

  const probabilities = softmax(positionLogits, maskSet);

  // Extract top-K
  const indexed: Array<{ tokenIndex: number; probability: number }> = [];
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] > 0) {
      indexed.push({ tokenIndex: i, probability: probabilities[i] });
    }
  }
  indexed.sort((a, b) => b.probability - a.probability);

  postResponse({
    type: 'prediction',
    suggestions: indexed.slice(0, topK),
  });
}

self.onmessage = async (e: MessageEvent<ChordWorkerRequest>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'load-model':
        await loadModel(msg.modelUrl, msg.modelBytes);
        break;
      case 'predict':
        await predict(msg.sequence, msg.style, msg.topK);
        break;
    }
  } catch (err) {
    postResponse({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Time-stretch service — unified API for two engines:
 *
 * 1. Signalsmith Stretch (real-time) — AudioWorklet-based, for playback preview
 * 2. Rubber Band (offline) — Web Worker-based, for bounce/export
 *
 * Phase 1: npm WASM packages (C++ compiled)
 * Phase 2: Replace with pure Rust WASM (ace-timestretch crate)
 */

import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('timestretch');

// ── Rubber Band (offline high-quality) ─────────────────────────────

let rubberbandInterface: RubberbandAPI | null = null;
let rubberbandInitPromise: Promise<void> | null = null;

interface RubberbandAPI {
  rubberband_new: (sr: number, ch: number, opts: number, timeRatio: number, pitchScale: number) => number;
  rubberband_delete: (state: number) => void;
  rubberband_set_expected_input_duration: (state: number, samples: number) => void;
  rubberband_study: (state: number, input: number, samples: number, final_: number) => void;
  rubberband_process: (state: number, input: number, samples: number, final_: number) => void;
  rubberband_available: (state: number) => number;
  rubberband_retrieve: (state: number, output: number, samples: number) => number;
  rubberband_set_time_ratio: (state: number, ratio: number) => void;
  rubberband_set_pitch_scale: (state: number, scale: number) => void;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  memWrite: (dest: number, data: Float32Array) => void;
  memReadF32: (src: number, length: number) => Float32Array;
  memWritePtr: (dest: number, src: number) => void;
}

const RB_OPTION_PROCESS_OFFLINE = 0x00000000;
const RB_OPTION_ENGINE_FINER = 0x20000000;
const RB_OPTION_TRANSIENTS_CRISP = 0x00000000;
const RB_OPTION_PHASE_LAMINAR = 0x00000000;
const RB_OPTION_THREADING_NEVER = 0x00010000; // WASM is single-threaded

const RB_HIGH_QUALITY = RB_OPTION_PROCESS_OFFLINE | RB_OPTION_ENGINE_FINER |
  RB_OPTION_TRANSIENTS_CRISP | RB_OPTION_PHASE_LAMINAR | RB_OPTION_THREADING_NEVER;

async function initRubberBand(): Promise<void> {
  if (rubberbandInterface) return;
  if (rubberbandInitPromise) return rubberbandInitPromise;

  rubberbandInitPromise = (async () => {
    try {
      const { RubberBandInterface } = await import('rubberband-wasm');
      // rubberband-wasm requires loading the WASM module
      // WASM binary copied to public/ by vite.config.ts
      const wasmModule = await WebAssembly.compileStreaming(
        fetch('/rubberband.wasm')
      );
      rubberbandInterface = await RubberBandInterface.initialize(wasmModule) as unknown as RubberbandAPI;
      logger.info('Rubber Band WASM initialized');
    } catch (err) {
      logger.warn('Rubber Band WASM init failed, offline stretch unavailable:', err);
      rubberbandInterface = null;
    }
  })();

  return rubberbandInitPromise;
}

/**
 * Stretch audio offline using Rubber Band (highest quality).
 *
 * @param channelData - Array of Float32Arrays, one per channel
 * @param sampleRate - Audio sample rate
 * @param timeRatio - Time ratio (2.0 = double length, 0.5 = half length)
 * @param pitchScale - Pitch scale (1.0 = no change, 2.0 = octave up)
 * @returns Stretched channel data
 */
export async function stretchOffline(
  channelData: Float32Array[],
  sampleRate: number,
  timeRatio: number,
  pitchScale: number = 1.0,
): Promise<Float32Array[]> {
  await initRubberBand();
  if (!rubberbandInterface) {
    throw new Error('Rubber Band not available');
  }

  const rb = rubberbandInterface;
  const channels = channelData.length;
  const inputLength = channelData[0].length;

  // Create Rubber Band state
  const state = rb.rubberband_new(sampleRate, channels, RB_HIGH_QUALITY, timeRatio, pitchScale);
  rb.rubberband_set_expected_input_duration(state, inputLength);

  // Allocate memory for channel pointers
  const ptrArrayPtr = rb.malloc(channels * 4); // array of pointers
  const channelPtrs: number[] = [];

  // Allocate and write each channel
  for (let ch = 0; ch < channels; ch++) {
    const ptr = rb.malloc(inputLength * 4);
    rb.memWrite(ptr, channelData[ch]);
    channelPtrs.push(ptr);
    rb.memWritePtr(ptrArrayPtr + ch * 4, ptr);
  }

  // Study phase (offline mode)
  rb.rubberband_study(state, ptrArrayPtr, inputLength, 1);

  // Process
  rb.rubberband_process(state, ptrArrayPtr, inputLength, 1);

  // Retrieve output
  const available = rb.rubberband_available(state);
  const outputLength = available > 0 ? available : Math.round(inputLength * timeRatio);

  // Allocate output channel pointers
  const outPtrArrayPtr = rb.malloc(channels * 4);
  const outChannelPtrs: number[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const ptr = rb.malloc(outputLength * 4);
    outChannelPtrs.push(ptr);
    rb.memWritePtr(outPtrArrayPtr + ch * 4, ptr);
  }

  const retrieved = rb.rubberband_retrieve(state, outPtrArrayPtr, outputLength);

  // Read output
  const result: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    result.push(new Float32Array(rb.memReadF32(outChannelPtrs[ch], retrieved)));
  }

  // Cleanup
  for (const ptr of channelPtrs) rb.free(ptr);
  for (const ptr of outChannelPtrs) rb.free(ptr);
  rb.free(ptrArrayPtr);
  rb.free(outPtrArrayPtr);
  rb.rubberband_delete(state);

  return result;
}

// ── Signalsmith Stretch (real-time) ────────────────────────────────

let signalsmithReady = false;
let signalsmithInitPromise: Promise<void> | null = null;

async function initSignalsmith(): Promise<void> {
  if (signalsmithReady) return;
  if (signalsmithInitPromise) return signalsmithInitPromise;

  signalsmithInitPromise = (async () => {
    try {
      // Signalsmith auto-registers its AudioWorklet
      logger.info('Signalsmith Stretch ready (AudioWorklet-based)');
      signalsmithReady = true;
    } catch (err) {
      logger.warn('Signalsmith init failed:', err);
    }
  })();

  return signalsmithInitPromise;
}

/**
 * Create a real-time stretch AudioNode using Signalsmith Stretch.
 *
 * @param audioContext - The AudioContext to create the node in
 * @param channels - Number of audio channels
 * @returns A stretch AudioNode with schedule/start/stop methods
 */
export async function createRealtimeStretchNode(
  audioContext: AudioContext,
  channels: number = 2,
): Promise<AudioNode & {
  schedule: (opts: {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
  }) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  addBuffers: (buffers: Float32Array[]) => Promise<number>;
  dropBuffers: (toSeconds?: number) => Promise<{ start: number; end: number }>;
}> {
  await initSignalsmith();

  const SignalsmithStretch = (await import('signalsmith-stretch')).default;
  const node = await SignalsmithStretch(audioContext, {
    outputChannelCount: [channels],
  });

  // Configure for real-time with split computation
  node.configure({
    splitComputation: true,
  });

  return node;
}

/**
 * Stretch an AudioBuffer using Signalsmith Stretch.
 *
 * Uses a real AudioContext with MediaStreamDestination to capture output,
 * since OfflineAudioContext doesn't support AudioWorklet reliably.
 * Records the stretched output in real-time, then returns the buffer.
 */
export async function stretchWithSignalsmith(
  buffer: AudioBuffer,
  timeRatio: number,
  pitchSemitones: number = 0,
): Promise<AudioBuffer> {
  const SignalsmithStretch = (await import('signalsmith-stretch')).default;

  // Use a real AudioContext (AudioWorklet requires it)
  const ctx = new AudioContext({ sampleRate: buffer.sampleRate });

  try {
    const stretchNode = await SignalsmithStretch(ctx, {
      outputChannelCount: [buffer.numberOfChannels],
    });
    stretchNode.configure({ splitComputation: true });

    // Load audio buffer
    const channelBuffers: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channelBuffers.push(new Float32Array(buffer.getChannelData(ch)));
    }
    await stretchNode.addBuffers(channelBuffers);

    // Set stretch parameters
    const playbackRate = 1 / timeRatio;
    stretchNode.schedule({
      input: 0,
      rate: playbackRate,
      semitones: pitchSemitones,
      active: true,
    });

    // Capture output via MediaRecorder
    const dest = ctx.createMediaStreamDestination();
    stretchNode.connect(dest);
    stretchNode.start();

    const outputDuration = buffer.duration * timeRatio;
    const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    });

    recorder.start();
    await new Promise((r) => setTimeout(r, outputDuration * 1000 + 200));
    recorder.stop();
    stretchNode.stop();

    const recordedBlob = await recordingDone;
    const arrayBuffer = await recordedBlob.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

    return decodedBuffer;
  } finally {
    await ctx.close();
  }
}

// ── Unified API ────────────────────────────────────────────────────

export interface StretchOptions {
  timeRatio: number;
  pitchSemitones?: number;
  quality?: 'realtime' | 'offline';
}

/**
 * Stretch an AudioBuffer offline using the best available engine.
 */
export async function stretchAudioBuffer(
  buffer: AudioBuffer,
  options: StretchOptions,
): Promise<AudioBuffer> {
  const { timeRatio, pitchSemitones = 0 } = options;
  const pitchScale = Math.pow(2, pitchSemitones / 12);

  // Extract channel data
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channelData.push(new Float32Array(buffer.getChannelData(ch).buffer.slice(0)));
  }

  // Use Rubber Band for offline
  const stretched = await stretchOffline(channelData, buffer.sampleRate, timeRatio, pitchScale);

  // Create output AudioBuffer
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    stretched[0].length,
    buffer.sampleRate,
  );
  const outputBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    stretched[0].length,
    buffer.sampleRate,
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    outputBuffer.copyToChannel(stretched[ch] as unknown as Float32Array<ArrayBuffer>, ch);
  }

  return outputBuffer;
}

/**
 * Initialize both engines (call during app startup).
 */
export async function initTimeStretchEngines(): Promise<void> {
  await Promise.allSettled([
    initRubberBand(),
    initSignalsmith(),
  ]);
}

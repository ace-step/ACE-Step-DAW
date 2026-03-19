import { audioBufferToWavBlob } from '../utils/wav';
import type { TrackEffect } from '../types/project';

export interface ExportClip {
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  pan?: number;
  effects?: TrackEffect[];
}

export type ExportFormat = 'wav' | 'mp3' | 'flac';
export type ExportBitDepth = 16 | 24;
export type ExportSampleRate = 44100 | 48000;
export type ExportMp3Bitrate = 128 | 192 | 256 | 320;

export interface ExportMixOptions {
  format?: ExportFormat;
  sampleRate?: ExportSampleRate;
  bitDepth?: ExportBitDepth;
  mp3Bitrate?: ExportMp3Bitrate;
  onProgress?: (progress: number, label: string) => void;
}

const DEFAULT_EXPORT_OPTIONS: Required<Omit<ExportMixOptions, 'onProgress'>> = {
  format: 'wav',
  sampleRate: 48000,
  bitDepth: 16,
  mp3Bitrate: 320,
};

type LameBundle = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array | Uint8Array;
    flush: () => Int8Array | Uint8Array;
  };
};

let lameBundlePromise: Promise<LameBundle> | null = null;

/**
 * Build a simple offline effect chain for export. Currently supports:
 * - eq3 → BiquadFilterNode (lowshelf + peaking + highshelf)
 * - compressor → DynamicsCompressorNode
 * - reverb → ConvolverNode (skipped in offline — too complex without IRs)
 * - delay → DelayNode with feedback
 * - distortion → WaveShaperNode
 * - filter → BiquadFilterNode
 */
function buildOfflineEffects(
  ctx: OfflineAudioContext,
  effects: TrackEffect[],
): { input: AudioNode; output: AudioNode } | null {
  const enabled = effects.filter((e) => e.enabled !== false);
  if (enabled.length === 0) return null;

  const nodes: AudioNode[] = [];

  for (const effect of enabled) {
    switch (effect.type) {
      case 'compressor': {
        const p = effect.params;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = p.threshold ?? -24;
        comp.ratio.value = p.ratio ?? 4;
        comp.attack.value = p.attack ?? 0.003;
        comp.release.value = p.release ?? 0.25;
        comp.knee.value = p.knee ?? 30;
        nodes.push(comp);
        break;
      }
      case 'distortion': {
        const p = effect.params;
        const shaper = ctx.createWaveShaper();
        const amount = (p.amount ?? 0.5) * 100;
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) /
            (Math.PI + amount * Math.abs(x));
        }
        shaper.curve = curve;
        shaper.oversample = '2x';
        nodes.push(shaper);
        break;
      }
      case 'filter': {
        const p = effect.params;
        const filter = ctx.createBiquadFilter();
        filter.type = (p.filterType as BiquadFilterType) ?? 'lowpass';
        filter.frequency.value = p.frequency ?? 1000;
        filter.Q.value = p.resonance ?? 1;
        nodes.push(filter);
        break;
      }
      case 'eq3': {
        const p = effect.params;
        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = p.lowFrequency ?? 250;
        low.gain.value = p.low ?? 0;
        nodes.push(low);
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 1;
        mid.gain.value = p.mid ?? 0;
        nodes.push(mid);
        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = p.highFrequency ?? 4000;
        high.gain.value = p.high ?? 0;
        nodes.push(high);
        break;
      }
      case 'delay': {
        const p = effect.params;
        const delay = ctx.createDelay(5);
        delay.delayTime.value = p.time ?? 0.25;
        const fbGain = ctx.createGain();
        fbGain.gain.value = p.feedback ?? 0.3;
        const wetGain = ctx.createGain();
        wetGain.gain.value = p.wet ?? 0.3;
        const dryGain = ctx.createGain();
        dryGain.gain.value = 1 - (p.wet ?? 0.3);
        // Dry path: input → dryGain → merge
        // Wet path: input → delay → wetGain → merge, delay → fbGain → delay
        const merge = ctx.createGain();
        const split = ctx.createGain();
        split.connect(dryGain);
        dryGain.connect(merge);
        split.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(merge);
        delay.connect(fbGain);
        fbGain.connect(delay);
        nodes.push(split);
        nodes.push(merge); // merge is the "output" of this pair
        break;
      }
      // reverb skipped — would need impulse responses for offline context
    }
  }

  if (nodes.length === 0) return null;

  // Chain nodes: each node connects to the next
  // Special case: delay uses 2 nodes (split + merge)
  // For simplicity, just chain linearly
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].connect(nodes[i + 1] as AudioNode);
  }

  return { input: nodes[0], output: nodes[nodes.length - 1] };
}

async function renderMixOffline(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;

    // Build effect chain if effects are provided
    const fxChain = clip.effects ? buildOfflineEffects(offlineCtx, clip.effects) : null;

    // Apply stereo pan using a StereoPannerNode when pan is non-zero
    const pan = clip.pan ?? 0;
    let chainEnd: AudioNode;

    if (fxChain) {
      source.connect(fxChain.input);
      fxChain.output.connect(gain);
    } else {
      source.connect(gain);
    }

    if (pan !== 0) {
      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      chainEnd = panner;
    } else {
      chainEnd = gain;
    }

    chainEnd.connect(offlineCtx.destination);
    source.start(clip.startTime);
  }

  return offlineCtx.startRendering();
}

function reportProgress(
  onProgress: ExportMixOptions['onProgress'],
  progress: number,
  label: string,
) {
  onProgress?.(Math.max(0, Math.min(1, progress)), label);
}

function getResolvedOptions(options: ExportMixOptions = {}): Required<Omit<ExportMixOptions, 'onProgress'>> {
  return {
    format: options.format ?? DEFAULT_EXPORT_OPTIONS.format,
    sampleRate: options.sampleRate ?? DEFAULT_EXPORT_OPTIONS.sampleRate,
    bitDepth: options.bitDepth ?? DEFAULT_EXPORT_OPTIONS.bitDepth,
    mp3Bitrate: options.mp3Bitrate ?? DEFAULT_EXPORT_OPTIONS.mp3Bitrate,
  };
}

function clampSample(sample: number): number {
  return Math.max(-1, Math.min(1, sample));
}

function createInterleavedInt16(buffer: AudioBuffer): Int16Array {
  const channels = buffer.numberOfChannels;
  const result = new Int16Array(buffer.length * channels);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let index = 0;

  for (let frame = 0; frame < buffer.length; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = clampSample(channelData[channel][frame]);
      result[index++] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
  }

  return result;
}

function createInterleavedInt32(buffer: AudioBuffer, bitDepth: ExportBitDepth): Int32Array {
  const channels = buffer.numberOfChannels;
  const result = new Int32Array(buffer.length * channels);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  const negativeScale = bitDepth === 24 ? 0x800000 : 0x8000;
  const positiveScale = bitDepth === 24 ? 0x7FFFFF : 0x7FFF;
  let index = 0;

  for (let frame = 0; frame < buffer.length; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = clampSample(channelData[channel][frame]);
      result[index++] = Math.round(sample < 0 ? sample * negativeScale : sample * positiveScale);
    }
  }

  return result;
}

async function loadLameBundle(): Promise<LameBundle> {
  if (!lameBundlePromise) {
    lameBundlePromise = import('lamejs/lame.all.js?raw').then((module) => {
      const factory = new Function(`${module.default}\nreturn lamejs;`)();
      return factory as LameBundle;
    });
  }

  return lameBundlePromise;
}

async function encodeMp3(
  buffer: AudioBuffer,
  bitrate: ExportMp3Bitrate,
  onProgress?: ExportMixOptions['onProgress'],
): Promise<Blob> {
  const lameModule = await loadLameBundle();
  const encoder = new lameModule.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, bitrate);
  const left = createInterleavedInt16({
    ...buffer,
    numberOfChannels: 1,
    getChannelData: () => buffer.getChannelData(0),
  } as AudioBuffer);
  const right = buffer.numberOfChannels > 1
    ? createInterleavedInt16({
      ...buffer,
      numberOfChannels: 1,
      getChannelData: () => buffer.getChannelData(1),
    } as AudioBuffer)
    : undefined;
  const chunkSize = 1152;
  const chunks: ArrayBuffer[] = [];

  for (let offset = 0; offset < left.length; offset += chunkSize) {
    const leftChunk = left.subarray(offset, offset + chunkSize);
    const rightChunk = right?.subarray(offset, offset + chunkSize);
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    if (encoded.length > 0) {
      chunks.push(Uint8Array.from(encoded).buffer);
    }
    reportProgress(onProgress, 0.55 + (Math.min(offset + chunkSize, left.length) / left.length) * 0.45, 'Encoding MP3');
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    chunks.push(Uint8Array.from(flushed).buffer);
  }

  reportProgress(onProgress, 1, 'Export ready');
  return new Blob(chunks, { type: 'audio/mpeg' });
}

async function encodeFlac(
  buffer: AudioBuffer,
  bitDepth: ExportBitDepth,
  onProgress?: ExportMixOptions['onProgress'],
): Promise<Blob> {
  const flacModule = await import('libflacjs/dist/libflac.js');
  const interleaved = createInterleavedInt32(buffer, bitDepth);
  const chunks: ArrayBuffer[] = [];
  const encoder = flacModule.create_libflac_encoder(
    buffer.sampleRate,
    buffer.numberOfChannels,
    bitDepth,
    5,
    buffer.length,
    false,
  );

  if (encoder === 0) {
    throw new Error('Failed to initialize FLAC encoder');
  }

  try {
    const initStatus = flacModule.init_encoder_stream(encoder, (data, numberOfBytes) => {
      chunks.push(data.slice(0, numberOfBytes).buffer as ArrayBuffer);
    });
    if (initStatus !== 0) {
      throw new Error(`FLAC encoder init failed with status ${initStatus}`);
    }

    const framesPerChunk = 4096;
    for (let frameOffset = 0; frameOffset < buffer.length; frameOffset += framesPerChunk) {
      const frameCount = Math.min(framesPerChunk, buffer.length - frameOffset);
      const sampleOffset = frameOffset * buffer.numberOfChannels;
      const sampleEnd = sampleOffset + frameCount * buffer.numberOfChannels;
      const chunk = interleaved.subarray(sampleOffset, sampleEnd);
      const ok = flacModule.FLAC__stream_encoder_process_interleaved(encoder, chunk, frameCount);
      if (!ok) {
        throw new Error('FLAC encoding failed');
      }

      reportProgress(
        onProgress,
        0.55 + (Math.min(frameOffset + frameCount, buffer.length) / buffer.length) * 0.45,
        'Encoding FLAC',
      );
    }

    if (!flacModule.FLAC__stream_encoder_finish(encoder)) {
      throw new Error('Failed to finalize FLAC export');
    }
  } finally {
    flacModule.FLAC__stream_encoder_delete(encoder);
  }

  reportProgress(onProgress, 1, 'Export ready');
  return new Blob(chunks, { type: 'audio/flac' });
}

export async function encodeAudioBuffer(
  buffer: AudioBuffer,
  options: ExportMixOptions = {},
): Promise<Blob> {
  const resolved = getResolvedOptions(options);

  switch (resolved.format) {
    case 'mp3':
      return encodeMp3(buffer, resolved.mp3Bitrate, options.onProgress);
    case 'flac':
      return encodeFlac(buffer, resolved.bitDepth, options.onProgress);
    case 'wav':
    default:
      reportProgress(options.onProgress, 0.75, 'Encoding WAV');
      reportProgress(options.onProgress, 1, 'Export ready');
      return audioBufferToWavBlob(buffer, resolved.bitDepth);
  }
}

export function getExportExtension(format: ExportFormat): 'wav' | 'mp3' | 'flac' {
  return format;
}

export function estimateExportFileSize(
  totalDuration: number,
  options: ExportMixOptions = {},
): number {
  const resolved = getResolvedOptions(options);
  const channels = 2;
  const pcmBytes = totalDuration * resolved.sampleRate * channels * (resolved.bitDepth / 8);

  switch (resolved.format) {
    case 'mp3':
      return Math.ceil((totalDuration * resolved.mp3Bitrate * 1000) / 8);
    case 'flac':
      return Math.ceil(pcmBytes * 0.6);
    case 'wav':
    default:
      return Math.ceil(pcmBytes + 44);
  }
}

export async function exportMix(
  clips: ExportClip[],
  totalDuration: number,
  options: ExportMixOptions = {},
): Promise<Blob> {
  const resolved = getResolvedOptions(options);
  reportProgress(options.onProgress, 0.05, 'Rendering mix');
  const rendered = await renderMixOffline(clips, totalDuration, resolved.sampleRate);
  reportProgress(options.onProgress, 0.55, 'Mix rendered');
  return encodeAudioBuffer(rendered, options);
}

export async function exportMixToWav(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number = 48000,
  bitDepth: ExportBitDepth = 16,
): Promise<Blob> {
  return exportMix(clips, totalDuration, { format: 'wav', sampleRate: sampleRate as ExportSampleRate, bitDepth });
}

/**
 * Render a single track's clips to a stereo WAV blob.
 * Same pipeline as exportMixToWav but semantically scoped to one track.
 */
export async function exportStemToWav(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<Blob> {
  return exportMixToWav(clips, totalDuration, sampleRate);
}

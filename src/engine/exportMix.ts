import { audioBufferToWavBlob } from '../utils/wav';
import { encodeToMp3, encodeToFlac, encodeToOgg } from '../utils/audioEncoders';
import type { ExportOptions } from '../utils/audioEncoders';
import type { MasteringState, TrackEffect } from '../types/project';
import { ensureMasteringState } from '../utils/mastering';

export interface ExportClip {
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  pan?: number;
  effects?: TrackEffect[];
}

function buildOfflineMasteringChain(
  ctx: OfflineAudioContext,
  mastering: MasteringState,
): { input: AudioNode; output: AudioNode } | null {
  const state = ensureMasteringState(mastering);
  if (!state.enabled || state.previewOriginal || state.status !== 'ready' || !state.analysis) {
    return null;
  }

  const input = ctx.createGain();
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 120;
  low.gain.value = state.chain.lowShelfGain;

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1400;
  mid.Q.value = 0.8;
  mid.gain.value = state.chain.midGain;

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 6500;
  high.gain.value = state.chain.highShelfGain;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = state.chain.compressorThreshold;
  compressor.ratio.value = state.chain.compressorRatio;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.18;
  compressor.knee.value = 8;

  const width = ctx.createStereoPanner();
  width.pan.value = Math.max(-0.2, Math.min(0.2, (state.chain.stereoWidth - 1) * 0.5));

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = state.chain.limiterThreshold;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.08;
  limiter.knee.value = 0;

  const makeup = ctx.createGain();
  makeup.gain.value = Math.pow(10, state.chain.makeupGain / 20);

  input.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(compressor);
  compressor.connect(width);
  width.connect(limiter);
  limiter.connect(makeup);

  return { input, output: makeup };
}

/**
 * Build a simple offline effect chain for export. Currently supports:
 * - eq3 → BiquadFilterNode (lowshelf + peaking + highshelf)
 * - compressor → DynamicsCompressorNode
 * - reverb → ConvolverNode (skipped in offline — too complex without IRs)
 * - delay → DelayNode with feedback
 * - distortion → WaveShaperNode
 * - filter → BiquadFilterNode
 */
export function buildOfflineEffects(
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
      case 'parametricEq': {
        const p = effect.params;
        for (const band of p.bands ?? []) {
          if (band.enabled === false) continue;
          const filter = ctx.createBiquadFilter();
          filter.type = band.type as BiquadFilterType;
          filter.frequency.value = band.frequency ?? 1000;
          filter.gain.value = band.gain ?? 0;
          filter.Q.value = band.q ?? 1;
          nodes.push(filter);
        }
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

export async function exportMixToWav(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number = 48000,
  mastering?: MasteringState | null,
): Promise<Blob> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masteringChain = mastering ? buildOfflineMasteringChain(offlineCtx, mastering) : null;

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

    if (masteringChain) {
      chainEnd.connect(masteringChain.input);
    } else {
      chainEnd.connect(offlineCtx.destination);
    }
    source.start(clip.startTime);
  }

  if (masteringChain) {
    masteringChain.output.connect(offlineCtx.destination);
  }

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}

/**
 * Render the mix offline and return the raw AudioBuffer.
 * Used internally by format-specific export functions.
 */
export async function renderMixOffline(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;

    const fxChain = clip.effects ? buildOfflineEffects(offlineCtx, clip.effects) : null;
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

/**
 * Export the mix in the specified format.
 * Renders offline then encodes to the requested format.
 */
export async function exportMix(
  clips: ExportClip[],
  totalDuration: number,
  options: ExportOptions,
): Promise<Blob> {
  const rendered = await renderMixOffline(clips, totalDuration, options.sampleRate);

  switch (options.format) {
    case 'mp3':
      return encodeToMp3(rendered, options.mp3Bitrate, options.metadata);
    case 'flac':
      return encodeToFlac(rendered, options.bitDepth, options.metadata);
    case 'ogg':
      return encodeToOgg(rendered, options.oggQuality);
    case 'wav':
    default:
      return audioBufferToWavBlob(rendered, options.bitDepth);
  }
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

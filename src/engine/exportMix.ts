import { audioBufferToWavBlob } from '../utils/wav';
import { encodeToMp3, encodeToFlac, encodeToOgg } from '../utils/audioEncoders';
import type { ExportFormat, ExportOptions } from '../utils/audioEncoders';
import type { MasteringState, Project, Track, TrackEffect } from '../types/project';
import { ensureMasteringState } from '../utils/mastering';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from './offlineRender';
import { createSamplerConfig } from './SamplerEngine';

export interface ExportClip {
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  pan?: number;
  effects?: TrackEffect[];
}

export interface ExportProgressUpdate {
  stage: 'rendering' | 'encoding' | 'complete';
  progress: number;
}

export type StemExportScope = 'all-audible' | 'selected';

export interface StemExportTrackOptions {
  scope: StemExportScope;
  selectedTrackIds?: Iterable<string>;
}

export interface StemExportResult {
  blob: Blob;
  fileName: string;
  track: Track;
}

export interface StemExportProgress {
  completed: number;
  total: number;
  track: Track;
  fileName: string;
}

interface AudioDecoder {
  decodeAudioData(audioData: Blob): Promise<AudioBuffer>;
}

function fileExtension(format: ExportFormat): string {
  switch (format) {
    case 'mp3': return '.mp3';
    case 'flac': return '.flac';
    case 'ogg': return '.ogg';
    default: return '.wav';
  }
}

function sanitizeFileNameSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();
  return sanitized || 'Untitled';
}

export function buildStemFileName(
  projectName: string,
  trackDisplayName: string,
  format: ExportFormat,
): string {
  return `${sanitizeFileNameSegment(projectName)}_${sanitizeFileNameSegment(trackDisplayName)}${fileExtension(format)}`;
}

export function isTrackAudible(track: Track, anySoloed: boolean): boolean {
  if (track.muted) return false;
  if (anySoloed && !track.soloed) return false;
  return true;
}

export function trackHasExportableContent(track: Track): boolean {
  const hasReadyAudio = track.clips.some((clip) => clip.generationStatus === 'ready' && clip.isolatedAudioKey);
  const hasMidiNotes = track.trackType === 'pianoRoll'
    && track.clips.some((clip) => (clip.midiData?.notes.length ?? 0) > 0);
  const hasSequencerSteps = track.trackType === 'sequencer'
    && track.sequencerPattern?.rows.some((row) => !row.muted && row.steps.some((step) => step.active));

  return hasReadyAudio || hasMidiNotes || Boolean(hasSequencerSteps);
}

export function getStemExportTracks(
  project: Project,
  options: StemExportTrackOptions,
): Track[] {
  const anySoloed = project.tracks.some((track) => track.soloed);
  const selectedTrackIds = new Set(options.selectedTrackIds ?? []);

  return project.tracks.filter((track) => {
    if (options.scope === 'selected' && !selectedTrackIds.has(track.id)) {
      return false;
    }

    return isTrackAudible(track, anySoloed);
  });
}

export async function buildTrackExportClips(
  project: Project,
  track: Track,
  audioDecoder: AudioDecoder,
): Promise<ExportClip[]> {
  const clips: ExportClip[] = [];

  if (track.trackType === 'pianoRoll') {
    for (const clip of track.clips) {
      const notes = clip.midiData?.notes ?? [];
      if (notes.length === 0) continue;

      let buffer: AudioBuffer | null = null;
      if (track.synthPreset === 'sampler' && track.sampler?.audioKey) {
        const samplerBlob = await loadAudioBlobByKey(track.sampler.audioKey);
        if (samplerBlob) {
          const sampleBuffer = await audioDecoder.decodeAudioData(samplerBlob);
          buffer = await renderSamplerTrackOffline(
            notes,
            clip.startTime,
            project.bpm,
            sampleBuffer,
            track.samplerConfig ?? createSamplerConfig(track.sampler.audioKey, {
              rootNote: track.sampler.rootNote,
              trimEnd: track.sampler.sampleDuration,
              loopEnd: track.sampler.sampleDuration,
            }),
            project.totalDuration,
          );
        }
      } else {
        buffer = await renderMidiTrackOffline(
          notes,
          clip.startTime,
          project.bpm,
          track.synthPreset ?? 'piano',
          project.totalDuration,
        );
      }

      if (!buffer) continue;
      clips.push({
        startTime: 0,
        buffer,
        volume: track.volume,
        pan: track.pan ?? 0,
        effects: track.effects,
      });
    }
  }

  if (track.trackType === 'sequencer' && track.sequencerPattern) {
    const buffer = await renderSequencerTrackOffline(
      track.sequencerPattern,
      project.bpm,
      project.totalDuration,
      track.drumKit ?? '808',
    );
    clips.push({
      startTime: 0,
      buffer,
      volume: track.volume,
      pan: track.pan ?? 0,
      effects: track.effects,
    });
  }

  for (const clip of track.clips) {
    if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) continue;
    const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
    if (!blob) continue;

    const buffer = await audioDecoder.decodeAudioData(blob);
    clips.push({
      startTime: clip.startTime,
      buffer,
      volume: track.volume,
      pan: track.pan ?? 0,
      effects: track.effects,
    });
  }

  return clips;
}

export async function exportTrackStems(
  project: Project,
  tracks: Track[],
  options: ExportOptions,
  audioDecoder: AudioDecoder,
  onProgress?: (progress: StemExportProgress) => void,
): Promise<StemExportResult[]> {
  const results: StemExportResult[] = [];

  for (const [index, track] of tracks.entries()) {
    const clips = await buildTrackExportClips(project, track, audioDecoder);
    if (clips.length === 0) continue;

    const blob = await exportMix(clips, project.totalDuration, options);
    const fileName = buildStemFileName(project.name, track.displayName, options.format);
    results.push({ blob, fileName, track });
    onProgress?.({
      completed: index + 1,
      total: tracks.length,
      track,
      fileName,
    });
  }

  return results;
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
  onProgress?: (update: ExportProgressUpdate) => void,
): Promise<Blob> {
  onProgress?.({ stage: 'rendering', progress: 0 });
  const rendered = await renderMixOffline(clips, totalDuration, options.sampleRate);
  onProgress?.({ stage: 'encoding', progress: 0 });

  let blob: Blob;
  switch (options.format) {
    case 'mp3':
      blob = encodeToMp3(rendered, options.mp3Bitrate, options.metadata);
      break;
    case 'flac':
      blob = encodeToFlac(rendered, options.bitDepth, options.metadata);
      break;
    case 'ogg':
      blob = await encodeToOgg(rendered, options.oggQuality);
      break;
    case 'wav':
    default:
      blob = audioBufferToWavBlob(rendered, options.bitDepth);
      break;
  }

  onProgress?.({ stage: 'complete', progress: 1 });
  return blob;
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

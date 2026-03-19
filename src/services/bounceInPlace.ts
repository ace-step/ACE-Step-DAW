import { renderMixOffline, type ExportClip } from '../engine/exportMix';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from '../engine/offlineRender';
import { createSamplerConfig } from '../engine/SamplerEngine';
import { getAudioEngine } from '../hooks/useAudioEngine';
import type {
  BounceInPlaceOptions,
  DrumKitName,
  Project,
  SynthPreset,
  Track,
} from '../types/project';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { loadAudioBlobByKey } from './audioFileManager';

export const DEFAULT_BOUNCE_IN_PLACE_OPTIONS: BounceInPlaceOptions = {
  includeEffects: true,
  normalize: false,
  replaceOriginal: true,
};

export interface BounceInPlaceRenderResult {
  startTime: number;
  duration: number;
  buffer: AudioBuffer;
  waveformPeaks: number[];
}

function getTrackBounceRange(track: Track, project: Project): { startTime: number; endTime: number } | null {
  const readyAudioClips = track.clips.filter(
    (clip) => clip.generationStatus === 'ready' && (clip.isolatedAudioKey ?? clip.cumulativeMixKey),
  );

  const midiClips = track.trackType === 'pianoRoll'
    ? track.clips.filter((clip) => (clip.midiData?.notes.length ?? 0) > 0)
    : [];

  if (readyAudioClips.length === 0 && midiClips.length === 0) {
    if (track.trackType === 'sequencer' && track.sequencerPattern) {
      return { startTime: 0, endTime: project.totalDuration };
    }
    return null;
  }

  const contentClips = [...readyAudioClips, ...midiClips];
  const startTime = Math.min(...contentClips.map((clip) => clip.startTime));
  const endTime = Math.max(...contentClips.map((clip) => clip.startTime + clip.duration));
  return { startTime, endTime };
}

async function renderAudioClipsForBounce(
  track: Track,
  rangeStartTime: number,
): Promise<ExportClip[]> {
  const engine = getAudioEngine();
  const clips: ExportClip[] = [];

  for (const clip of track.clips) {
    if (clip.generationStatus !== 'ready') continue;

    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) continue;

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) continue;

    const buffer = await engine.decodeAudioData(blob);
    clips.push({
      startTime: Math.max(0, clip.startTime - rangeStartTime),
      buffer,
      volume: 1,
    });
  }

  return clips;
}

async function renderPianoRollClipsForBounce(
  project: Project,
  track: Track,
  rangeStartTime: number,
): Promise<ExportClip[]> {
  const clips: ExportClip[] = [];
  const midiClips = track.clips.filter((clip) => (clip.midiData?.notes.length ?? 0) > 0);
  if (midiClips.length === 0) return clips;

  let sampleBuffer: AudioBuffer | null = null;
  if (track.synthPreset === 'sampler' && track.sampler?.audioKey) {
    const blob = await loadAudioBlobByKey(track.sampler.audioKey);
    if (blob) {
      sampleBuffer = await getAudioEngine().decodeAudioData(blob);
    }
  }

  for (const clip of midiClips) {
    const notes = clip.midiData?.notes ?? [];
    if (notes.length === 0) continue;

    let buffer: AudioBuffer | null = null;
    if (track.synthPreset === 'sampler' && sampleBuffer && track.sampler?.audioKey) {
      const samplerConfig = track.samplerConfig ?? createSamplerConfig(track.sampler.audioKey, {
        rootNote: track.sampler.rootNote,
        trimEnd: track.sampler.sampleDuration,
        loopEnd: track.sampler.sampleDuration,
      });
      buffer = await renderSamplerTrackOffline(
        notes,
        0,
        project.bpm,
        sampleBuffer,
        samplerConfig,
        clip.duration,
      );
    } else {
      buffer = await renderMidiTrackOffline(
        notes,
        0,
        project.bpm,
        (track.synthPreset ?? 'piano') as SynthPreset,
        clip.duration,
      );
    }

    clips.push({
      startTime: Math.max(0, clip.startTime - rangeStartTime),
      buffer,
      volume: 1,
    });
  }

  return clips;
}

function normalizeRenderedBuffer(buffer: AudioBuffer): void {
  let peak = 0;

  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channel[sampleIndex]));
    }
  }

  if (peak <= 0 || peak >= 0.999) return;

  const gain = 0.98 / peak;
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      channel[sampleIndex] *= gain;
    }
  }
}

export async function renderTrackForBounceInPlace(
  project: Project,
  track: Track,
  options: BounceInPlaceOptions,
): Promise<BounceInPlaceRenderResult | null> {
  const range = getTrackBounceRange(track, project);
  if (!range) return null;

  const duration = Math.max(0.01, range.endTime - range.startTime);
  const renderedClips: ExportClip[] = [
    ...(await renderAudioClipsForBounce(track, range.startTime)),
    ...(track.trackType === 'pianoRoll'
      ? await renderPianoRollClipsForBounce(project, track, range.startTime)
      : []),
  ];

  if (track.trackType === 'sequencer' && track.sequencerPattern && renderedClips.length === 0) {
    renderedClips.push({
      startTime: 0,
      buffer: await renderSequencerTrackOffline(
        track.sequencerPattern,
        project.bpm,
        duration,
        (track.drumKit ?? '808') as DrumKitName,
      ),
      volume: 1,
    });
  }

  if (renderedClips.length === 0) return null;

  const rendered = await renderMixOffline(
    renderedClips.map((clip) => ({
      ...clip,
      effects: options.includeEffects ? track.effects : undefined,
    })),
    duration,
  );

  if (options.normalize) {
    normalizeRenderedBuffer(rendered);
  }

  return {
    startTime: range.startTime,
    duration,
    buffer: rendered,
    waveformPeaks: computeWaveformPeaks(rendered, 200),
  };
}

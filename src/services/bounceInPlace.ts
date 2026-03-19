import { AutomationEngine } from '../engine/AutomationEngine';
import { renderMixOffline, buildOfflineEffects, type ExportClip } from '../engine/exportMix';
import {
  renderMidiTrackOffline,
  renderSamplerTrackOffline,
  renderSequencerTrackOffline,
} from '../engine/offlineRender';
import { createSamplerConfig } from '../engine/SamplerEngine';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';
import {
  normalizedToMixerValue,
  type AutomationLane,
  type BounceInPlaceOptions,
  type MidiNote,
  type Project,
  type Track,
} from '../types/project';

const DEFAULT_SAMPLE_RATE = 48_000;
const NORMALIZE_TARGET_PEAK = 0.99;

export const DEFAULT_BOUNCE_IN_PLACE_OPTIONS: BounceInPlaceOptions = {
  includeEffects: true,
  includeAutomation: true,
  normalize: false,
  replaceOriginal: true,
};

export interface BounceRange {
  startTime: number;
  duration: number;
}

export interface BounceRenderResult {
  audioKey: string;
  startTime: number;
  duration: number;
  waveformPeaks: number[];
}

function getTrackContentRange(track: Track): BounceRange | null {
  if (track.clips.length === 0) {
    return null;
  }

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = 0;

  for (const clip of track.clips) {
    minStart = Math.min(minStart, clip.startTime);
    maxEnd = Math.max(maxEnd, clip.startTime + clip.duration);
  }

  if (!Number.isFinite(minStart) || maxEnd <= minStart) {
    return null;
  }

  return {
    startTime: minStart,
    duration: maxEnd - minStart,
  };
}

export function resolveBounceRange(
  project: Project,
  track: Track,
  options: BounceInPlaceOptions,
): BounceRange {
  const explicitStart = options.startTime;
  const explicitDuration = options.duration;

  if (typeof explicitStart === 'number' || typeof explicitDuration === 'number') {
    const startTime = Math.max(0, explicitStart ?? 0);
    const duration = Math.max(0.01, explicitDuration ?? Math.max(project.totalDuration - startTime, 0.01));
    return { startTime, duration };
  }

  const clipRange = getTrackContentRange(track);
  if (clipRange) {
    return clipRange;
  }

  return {
    startTime: 0,
    duration: Math.max(project.totalDuration, 0.01),
  };
}

function createBufferFromChannels(
  channelData: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  const channelCount = Math.max(1, channelData.length);
  const length = channelData[0]?.length ?? 1;
  const buffer = new AudioBuffer({
    length: Math.max(1, length),
    numberOfChannels: channelCount,
    sampleRate,
  });

  for (let channel = 0; channel < channelCount; channel++) {
    const nextChannelData = channelData[channel]
      ? new Float32Array(channelData[channel])
      : new Float32Array(length);
    buffer.copyToChannel(nextChannelData, channel);
  }

  return buffer;
}

export function normalizeAudioBuffer(buffer: AudioBuffer, targetPeak: number = NORMALIZE_TARGET_PEAK): AudioBuffer {
  let peak = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      peak = Math.max(peak, Math.abs(data[index]));
    }
  }

  if (peak <= 0 || peak === targetPeak) {
    return buffer;
  }

  const gain = targetPeak / peak;
  const channels: Float32Array[] = [];

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const next = new Float32Array(source.length);
    for (let index = 0; index < source.length; index++) {
      next[index] = source[index] * gain;
    }
    channels.push(next);
  }

  return createBufferFromChannels(channels, buffer.sampleRate);
}

function trimAudioBuffer(
  buffer: AudioBuffer,
  startOffset: number,
  duration: number,
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startOffset * sampleRate));
  const endSample = Math.min(buffer.length, Math.ceil((startOffset + duration) * sampleRate));
  const length = Math.max(1, endSample - startSample);
  const channels: Float32Array[] = [];

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(buffer.getChannelData(channel).slice(startSample, startSample + length));
  }

  return createBufferFromChannels(channels, sampleRate);
}

function trimMidiNotesToRange(
  track: Track,
  bpm: number,
  range: BounceRange,
): MidiNote[] {
  const secondsPerBeat = 60 / bpm;
  const rangeStart = range.startTime;
  const rangeEnd = range.startTime + range.duration;

  return track.clips.flatMap((clip) => {
    const notes = clip.midiData?.notes ?? [];
    return notes.flatMap((note) => {
      const noteStart = clip.startTime + note.startBeat * secondsPerBeat;
      const noteEnd = noteStart + note.durationBeats * secondsPerBeat;
      const overlapStart = Math.max(noteStart, rangeStart);
      const overlapEnd = Math.min(noteEnd, rangeEnd);
      if (overlapEnd <= overlapStart) {
        return [];
      }

      return [{
        ...note,
        startBeat: (overlapStart - rangeStart) / secondsPerBeat,
        durationBeats: Math.max((overlapEnd - overlapStart) / secondsPerBeat, 1 / 64),
      }];
    });
  });
}

async function buildAudioSourceClips(
  project: Project,
  track: Track,
  range: BounceRange,
): Promise<ExportClip[]> {
  const engine = getAudioEngine();
  const rangeEnd = range.startTime + range.duration;
  const clips: ExportClip[] = [];

  for (const clip of track.clips) {
    if (clip.generationStatus !== 'ready') continue;
    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) continue;

    const clipEnd = clip.startTime + clip.duration;
    const overlapStart = Math.max(clip.startTime, range.startTime);
    const overlapEnd = Math.min(clipEnd, rangeEnd);
    if (overlapEnd <= overlapStart) continue;

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) continue;

    const decoded = await engine.decodeAudioData(blob);
    const startOffset = Math.max(0, overlapStart - clip.startTime + (clip.audioOffset ?? 0));
    const trimmed = trimAudioBuffer(decoded, startOffset, overlapEnd - overlapStart);

    clips.push({
      startTime: overlapStart - range.startTime,
      buffer: trimmed,
      volume: 1,
    });
  }

  return clips;
}

function getMixerAutomationLanes(project: Project, trackId: string, range: BounceRange) {
  const lanes = project.automationLanes ?? [];
  const rangeStart = range.startTime;
  const rangeEnd = range.startTime + range.duration;

  const volumeLane = lanes.find((lane) =>
    lane.trackId === trackId
    && lane.parameter.type === 'mixer'
    && lane.parameter.param === 'volume'
    && lane.points.some((point) => point.time >= rangeStart && point.time <= rangeEnd),
  ) ?? lanes.find((lane) =>
    lane.trackId === trackId
    && lane.parameter.type === 'mixer'
    && lane.parameter.param === 'volume'
    && lane.points.length > 0,
  );

  const panLane = lanes.find((lane) =>
    lane.trackId === trackId
    && lane.parameter.type === 'mixer'
    && lane.parameter.param === 'pan'
    && lane.points.some((point) => point.time >= rangeStart && point.time <= rangeEnd),
  ) ?? lanes.find((lane) =>
    lane.trackId === trackId
    && lane.parameter.type === 'mixer'
    && lane.parameter.param === 'pan'
    && lane.points.length > 0,
  );

  return { volumeLane, panLane };
}

function automateParam(
  param: AudioParam,
  range: BounceRange,
  fallbackValue: number,
  lane: AutomationLane | undefined,
  mapValue: (value: number) => number,
) {
  param.cancelScheduledValues(0);
  if (!lane || lane.points.length === 0) {
    param.setValueAtTime(fallbackValue, 0);
    return;
  }

  const rangeStart = range.startTime;
  const rangeEnd = range.startTime + range.duration;
  const initialValue = AutomationEngine.getValueAtTime(lane, rangeStart) ?? fallbackValue;
  param.setValueAtTime(mapValue(initialValue), 0);

  for (const point of lane.points) {
    if (point.time <= rangeStart || point.time > rangeEnd) continue;
    param.linearRampToValueAtTime(mapValue(point.value), point.time - rangeStart);
  }
}

async function applyTrackProcessing(
  sourceBuffer: AudioBuffer,
  project: Project,
  track: Track,
  range: BounceRange,
  options: BounceInPlaceOptions,
): Promise<AudioBuffer> {
  const sampleRate = sourceBuffer.sampleRate || DEFAULT_SAMPLE_RATE;
  const length = Math.max(1, Math.ceil(range.duration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  const gain = offlineCtx.createGain();
  const panner = offlineCtx.createStereoPanner();
  const fxChain = options.includeEffects && track.effects?.length
    ? buildOfflineEffects(offlineCtx, track.effects)
    : null;

  if (fxChain) {
    source.connect(fxChain.input);
    fxChain.output.connect(gain);
  } else {
    source.connect(gain);
  }

  gain.connect(panner);
  panner.connect(offlineCtx.destination);

  if (options.includeAutomation) {
    const { volumeLane, panLane } = getMixerAutomationLanes(project, track.id, range);
    automateParam(gain.gain, range, track.volume, volumeLane, (value) => value);
    automateParam(panner.pan, range, track.pan ?? 0, panLane, (value) => normalizedToMixerValue('pan', value));
  } else {
    gain.gain.value = track.volume;
    panner.pan.value = track.pan ?? 0;
  }

  source.start(0);
  return offlineCtx.startRendering();
}

async function renderTrackSourceBuffer(
  project: Project,
  track: Track,
  range: BounceRange,
): Promise<AudioBuffer> {
  const sourceClips: ExportClip[] = await buildAudioSourceClips(project, track, range);
  const bpm = project.bpm;

  if (track.trackType === 'pianoRoll') {
    const notes = trimMidiNotesToRange(track, bpm, range);
    if (notes.length > 0) {
      if (track.synthPreset === 'sampler' && track.sampler?.audioKey) {
        const blob = await loadAudioBlobByKey(track.sampler.audioKey);
        if (blob) {
          const sampleBuffer = await getAudioEngine().decodeAudioData(blob);
          const rendered = await renderSamplerTrackOffline(
            notes,
            0,
            bpm,
            sampleBuffer,
            track.samplerConfig ?? createSamplerConfig(track.sampler.audioKey, {
              rootNote: track.sampler.rootNote,
              trimEnd: track.sampler.sampleDuration,
              loopEnd: track.sampler.sampleDuration,
            }),
            range.duration,
            DEFAULT_SAMPLE_RATE,
          );
          sourceClips.push({ startTime: 0, buffer: rendered, volume: 1 });
        }
      } else {
        const rendered = await renderMidiTrackOffline(
          notes,
          0,
          bpm,
          track.synthPreset ?? 'piano',
          range.duration,
          DEFAULT_SAMPLE_RATE,
        );
        sourceClips.push({ startTime: 0, buffer: rendered, volume: 1 });
      }
    }
  }

  if (track.trackType === 'sequencer' && track.sequencerPattern) {
    const hasReadyClips = sourceClips.length > 0;
    if (!hasReadyClips) {
      const rendered = await renderSequencerTrackOffline(
        track.sequencerPattern,
        bpm,
        range.duration,
        track.drumKit ?? '808',
        DEFAULT_SAMPLE_RATE,
      );
      sourceClips.push({ startTime: 0, buffer: rendered, volume: 1 });
    }
  }

  if (sourceClips.length === 0) {
    throw new Error(`Track '${track.displayName}' has no content to bounce`);
  }

  if (sourceClips.length === 1 && sourceClips[0].startTime === 0 && Math.abs(sourceClips[0].buffer.duration - range.duration) < 0.001) {
    return sourceClips[0].buffer;
  }

  return renderMixOffline(sourceClips, range.duration, DEFAULT_SAMPLE_RATE);
}

export async function renderTrackBounce(
  project: Project,
  track: Track,
  options: BounceInPlaceOptions,
): Promise<{ buffer: AudioBuffer; range: BounceRange }> {
  const range = resolveBounceRange(project, track, options);
  const sourceBuffer = await renderTrackSourceBuffer(project, track, range);
  const processed = await applyTrackProcessing(sourceBuffer, project, track, range, options);
  return {
    buffer: options.normalize ? normalizeAudioBuffer(processed) : processed,
    range,
  };
}

export async function bounceTrackToAudioAsset(
  project: Project,
  track: Track,
  options: BounceInPlaceOptions,
): Promise<BounceRenderResult> {
  const { buffer, range } = await renderTrackBounce(project, track, options);
  const wavBlob = audioBufferToWavBlob(buffer);
  const audioKey = await saveAudioBlob(project.id, `bounce-${track.id}`, 'isolated', wavBlob);
  return {
    audioKey,
    startTime: range.startTime,
    duration: range.duration,
    waveformPeaks: computeWaveformPeaks(buffer, 200),
  };
}

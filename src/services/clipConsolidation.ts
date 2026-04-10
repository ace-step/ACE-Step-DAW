import { v4 as uuidv4 } from 'uuid';
import type { Clip, MidiNote, Project } from '../types/project';
import { interpolateGainEnvelope } from '../utils/gainEnvelope';
import { timeToBeat } from '../utils/tempoMap';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformWithMipmap } from '../utils/waveformPeaks';
import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';

type AudioBufferLike = Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'duration' | 'getChannelData'>;

export type ConsolidationMediaType = 'audio' | 'midi';

export interface ConsolidationValidation {
  clips: Clip[];
  mediaType: ConsolidationMediaType;
}

interface AudioClipRenderInput {
  clip: Clip;
  buffer: AudioBufferLike;
  sourceRegionStart: number;
}

interface MergedAudioData {
  channels: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function validateClipConsolidation(trackId: string, clips: Clip[]): ConsolidationValidation {
  if (clips.length === 0) {
    throw new Error('Select at least one clip to consolidate');
  }

  if (clips.some((clip) => clip.trackId !== trackId)) {
    throw new Error('Consolidate only works on clips from the same track');
  }

  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime || a.duration - b.duration || a.id.localeCompare(b.id));
  const midiCount = sorted.filter((clip) => clip.midiData).length;

  if (midiCount > 0 && midiCount < sorted.length) {
    throw new Error('Select only audio clips or only MIDI clips when consolidating');
  }

  return {
    clips: sorted,
    mediaType: midiCount === sorted.length ? 'midi' : 'audio',
  };
}

function buildConsolidatedPrompt(clips: Clip[], fallback: string) {
  const prompts = [...new Set(clips.map((clip) => clip.prompt.trim()).filter(Boolean))];
  return prompts.length === 1 ? prompts[0] : fallback;
}

export function buildConsolidatedMidiClipData(project: Project, clips: Clip[]) {
  const { clips: validatedClips } = validateClipConsolidation(clips[0]?.trackId ?? '', clips);
  const startTime = validatedClips[0].startTime;
  const endTime = Math.max(...validatedClips.map((clip) => clip.startTime + clip.duration));
  const mergedNotes: MidiNote[] = [];

  for (const clip of validatedClips) {
    const midiData = clip.midiData;
    if (!midiData) continue;

    const clipStartBeat = timeToBeat(clip.startTime, project.tempoMap, project.bpm);
    const consolidatedStartBeat = timeToBeat(startTime, project.tempoMap, project.bpm);

    for (const note of midiData.notes) {
      const noteAbsoluteStartBeat = clipStartBeat + note.startBeat;
      mergedNotes.push({
        ...note,
        id: uuidv4(),
        startBeat: noteAbsoluteStartBeat - consolidatedStartBeat,
      });
    }
  }

  mergedNotes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch || a.id.localeCompare(b.id));

  return {
    startTime,
    duration: endTime - startTime,
    midiData: {
      notes: mergedNotes,
      grid: validatedClips.find((clip) => clip.midiData?.grid)?.midiData?.grid ?? '1/16',
    },
  };
}

function sampleBufferAtTime(buffer: AudioBufferLike, channel: number, time: number) {
  const channelIndex = Math.min(channel, buffer.numberOfChannels - 1);
  const samples = buffer.getChannelData(channelIndex);
  const position = time * buffer.sampleRate;
  if (position < 0 || position >= samples.length) return 0;

  const leftIndex = Math.floor(position);
  const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
  const frac = position - leftIndex;
  const left = samples[leftIndex] ?? 0;
  const right = samples[rightIndex] ?? 0;
  return left + (right - left) * frac;
}

function getFadeGain(curve: Clip['fadeInCurve'] | Clip['fadeOutCurve'] | undefined, ratio: number) {
  const x = clamp(ratio, 0, 1);
  switch (curve) {
    case 'equal-power':
      return Math.sin((x * Math.PI) / 2);
    case 'exponential':
      return x <= 0 ? 0 : x * x;
    case 'linear':
    default:
      return x;
  }
}

function getClipGainAtTime(clip: Clip, localTime: number) {
  let gain = clip.gainEnvelope?.length ? interpolateGainEnvelope(clip.gainEnvelope, localTime) : 1;

  const fadeInDuration = clip.fadeInDuration ?? 0;
  if (fadeInDuration > 0 && localTime < fadeInDuration) {
    gain *= getFadeGain(clip.fadeInCurve, localTime / fadeInDuration);
  }

  const fadeOutDuration = clip.fadeOutDuration ?? 0;
  const fadeOutStart = clip.duration - fadeOutDuration;
  if (fadeOutDuration > 0 && localTime > fadeOutStart) {
    const fadeProgress = (clip.duration - localTime) / fadeOutDuration;
    gain *= getFadeGain(clip.fadeOutCurve, fadeProgress);
  }

  return gain;
}

export function mergeAudioClipBuffers(inputs: AudioClipRenderInput[]): MergedAudioData {
  if (inputs.length === 0) {
    throw new Error('No audio clips available to consolidate');
  }

  const sortedInputs = [...inputs].sort((a, b) => a.clip.startTime - b.clip.startTime || a.clip.id.localeCompare(b.clip.id));
  const startTime = sortedInputs[0].clip.startTime;
  const endTime = Math.max(...sortedInputs.map(({ clip }) => clip.startTime + clip.duration));
  const sampleRate = Math.max(...sortedInputs.map(({ buffer }) => buffer.sampleRate));
  const numberOfChannels = Math.max(...sortedInputs.map(({ buffer }) => buffer.numberOfChannels));
  const totalLength = Math.max(1, Math.ceil((endTime - startTime) * sampleRate));
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(totalLength));

  for (const { clip, buffer, sourceRegionStart } of sortedInputs) {
    const clipStartSample = Math.round((clip.startTime - startTime) * sampleRate);
    const clipLengthSamples = Math.max(1, Math.ceil(clip.duration * sampleRate));
    const rate = clip.timeStretchRate ?? 1;
    const audioOffset = clip.audioOffset ?? 0;

    for (let sampleIndex = 0; sampleIndex < clipLengthSamples; sampleIndex++) {
      const localTime = sampleIndex / sampleRate;
      const sourceTime = sourceRegionStart + audioOffset + localTime * rate;
      const gain = getClipGainAtTime(clip, localTime);
      if (gain === 0) continue;

      const outputIndex = clipStartSample + sampleIndex;
      if (outputIndex >= totalLength) break;

      for (let channel = 0; channel < numberOfChannels; channel++) {
        channels[channel][outputIndex] += sampleBufferAtTime(buffer, channel, sourceTime) * gain;
      }
    }
  }

  return {
    channels,
    sampleRate,
    numberOfChannels,
    duration: endTime - startTime,
  };
}

async function loadAudioInputs(project: Project, clips: Clip[]): Promise<AudioClipRenderInput[]> {
  const { getAudioEngine } = await import('../hooks/useAudioEngine');
  const engine = getAudioEngine();
  const inputs: AudioClipRenderInput[] = [];

  for (const clip of clips) {
    const sourceKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!sourceKey) {
      throw new Error('One or more selected clips do not have audio to consolidate');
    }

    const blob = await loadAudioBlobByKey(sourceKey);
    if (!blob) {
      throw new Error('One or more selected clips are missing audio data');
    }

    const buffer = await engine.decodeAudioData(blob);
    inputs.push({
      clip,
      buffer,
      sourceRegionStart: clip.isolatedAudioKey ? 0 : clip.startTime,
    });
  }

  return inputs;
}

export async function renderConsolidatedAudioClip(project: Project, clips: Clip[]) {
  const audioInputs = await loadAudioInputs(project, clips);
  const merged = mergeAudioClipBuffers(audioInputs);
  const { getAudioEngine } = await import('../hooks/useAudioEngine');
  const engine = getAudioEngine();
  const outputBuffer = engine.ctx.createBuffer(merged.numberOfChannels, merged.channels[0].length, merged.sampleRate);

  for (let channel = 0; channel < merged.numberOfChannels; channel++) {
    outputBuffer.getChannelData(channel).set(merged.channels[channel]);
  }

  const wavBlob = audioBufferToWavBlob(outputBuffer);
  const clipId = uuidv4();
  const isolatedAudioKey = await saveAudioBlob(project.id, clipId, 'isolated', wavBlob);

  return {
    id: clipId,
    isolatedAudioKey,
    waveformPeaks: await computeWaveformWithMipmap(isolatedAudioKey, outputBuffer),
    duration: merged.duration,
    audioDuration: merged.duration,
  };
}

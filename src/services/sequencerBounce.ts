import type { SequencerPattern } from '../types/project';
import { getSample } from './sampleManager';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { saveAudioBlob } from './audioFileManager';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from '../hooks/useAudioEngine';

/**
 * Renders a SequencerPattern to an AudioBuffer using OfflineAudioContext,
 * then stores it as a Clip on the given track.
 */
export async function bounceSequencerToAudio(
  trackId: string,
  pattern: SequencerPattern,
  bpm: number,
  startTime: number = 0,
): Promise<void> {
  const engine = getAudioEngine();
  await engine.resume();

  const sampleRate = engine.ctx.sampleRate;
  const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
  const totalSteps = pattern.stepsPerBar * pattern.bars;
  const patternDuration = stepDuration * totalSteps;

  if (patternDuration <= 0) return;

  // Load all samples
  const sampleBuffers = new Map<string, AudioBuffer>();
  for (const row of pattern.rows) {
    if (row.muted) continue;
    const buf = await getSample(engine.ctx, row.sampleKey);
    if (buf) sampleBuffers.set(row.sampleKey, buf);
  }

  // Find the longest sample tail so we don't clip the last hit
  let maxSampleDuration = 0;
  for (const buf of sampleBuffers.values()) {
    if (buf.duration > maxSampleDuration) maxSampleDuration = buf.duration;
  }
  const renderDuration = patternDuration + maxSampleDuration;
  const renderLength = Math.ceil(renderDuration * sampleRate);

  const numChannels = pattern.rows.some((r) => (r.pan ?? 0) !== 0) ? 2 : 1;
  const offCtx = new OfflineAudioContext(numChannels, renderLength, sampleRate);

  for (const row of pattern.rows) {
    if (row.muted) continue;
    const buffer = sampleBuffers.get(row.sampleKey);
    if (!buffer) continue;

    for (let stepIdx = 0; stepIdx < row.steps.length; stepIdx++) {
      const step = row.steps[stepIdx];
      if (!step.active) continue;

      let swingOffset = 0;
      if (pattern.swing > 0 && stepIdx % 2 === 1) {
        swingOffset = stepDuration * pattern.swing * 0.5;
      }

      const time = stepIdx * stepDuration + swingOffset;

      const source = offCtx.createBufferSource();
      source.buffer = buffer;
      const gain = offCtx.createGain();
      gain.gain.value = step.velocity * row.volume;
      source.connect(gain);
      if (numChannels === 2 && (row.pan ?? 0) !== 0) {
        const panner = offCtx.createStereoPanner();
        panner.pan.value = row.pan ?? 0;
        gain.connect(panner);
        panner.connect(offCtx.destination);
      } else {
        gain.connect(offCtx.destination);
      }
      source.start(time);
    }
  }

  const rendered = await offCtx.startRendering();

  // Trim to pattern duration (cut off the tail padding)
  const trimLength = Math.ceil(patternDuration * sampleRate);
  const trimmed = new AudioBuffer({
    length: trimLength,
    numberOfChannels: numChannels,
    sampleRate,
  });
  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = rendered.getChannelData(ch);
    const dstData = trimmed.getChannelData(ch);
    for (let i = 0; i < trimLength && i < srcData.length; i++) {
      dstData[i] = srcData[i];
    }
  }

  const wavBlob = audioBufferToWavBlob(trimmed);
  const peaks = computeWaveformPeaks(trimmed, 200);

  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) return;

  const clip = store.addClip(trackId, {
    startTime,
    duration: patternDuration,
    prompt: `Sequencer: ${pattern.name} — ${totalSteps} steps, ${pattern.bars} bar(s)`,
    lyrics: '',
  });

  const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);

  store.updateClipStatus(clip.id, 'ready', {
    isolatedAudioKey: isolatedKey,
    waveformPeaks: peaks,
    audioDuration: patternDuration,
    audioOffset: 0,
    source: 'generated',
  });
}

import { useProjectStore } from '../store/projectStore';
import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from '../engine/offlineRender';
import { createSamplerConfig } from '../engine/SamplerEngine';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformWithMipmap } from '../utils/waveformPeaks';
import { getAudioEngine } from '../hooks/useAudioEngine';
import type { SynthPreset, DrumKitName } from '../types/project';

/**
 * Freeze a track by rendering its content to a single audio bounce.
 * Sets the track's frozen flag and stores the audio key.
 */
export async function freezeTrackToAudio(trackId: string): Promise<void> {
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) throw new Error('No project');

  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track '${trackId}' not found`);

  let finalBuffer: AudioBuffer | undefined;

  if (track.trackType === 'pianoRoll') {
    // Collect all MIDI notes across clips
    const allNotes = track.clips.flatMap((c) =>
      (c.midiData?.notes ?? []).map((n) => ({
        ...n,
        startBeat: n.startBeat + (c.startTime * project.bpm) / 60,
      })),
    );
    if (allNotes.length > 0) {
      if (track.synthPreset === 'sampler' && track.sampler?.audioKey) {
        const samplerBlob = await loadAudioBlobByKey(track.sampler.audioKey);
        if (samplerBlob) {
          const engine = getAudioEngine();
          const sampleBuffer = await engine.decodeAudioData(samplerBlob);
          finalBuffer = await renderSamplerTrackOffline(
            allNotes,
            0,
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
        finalBuffer = await renderMidiTrackOffline(
          allNotes,
          0,
          project.bpm,
          (track.synthPreset ?? 'piano') as SynthPreset,
          project.totalDuration,
        );
      }
    }
  } else if (track.trackType === 'sequencer' && track.sequencerPattern) {
    const hasReadyClips = track.clips.some((c) => c.generationStatus === 'ready');
    if (!hasReadyClips) {
      finalBuffer = await renderSequencerTrackOffline(
        track.sequencerPattern,
        project.bpm,
        project.totalDuration,
        (track.drumKit ?? '808') as DrumKitName,
      );
    }
  }

  // If we didn't render MIDI/sequencer, try loading existing audio clips
  if (!finalBuffer) {
    const readyClips = track.clips.filter((c) => c.generationStatus === 'ready');
    if (readyClips.length > 0) {
      const engine = getAudioEngine();
      const ctx = engine.ctx;

      // Determine total duration from clips
      const maxEnd = readyClips.reduce(
        (max, c) => Math.max(max, c.startTime + c.duration),
        0,
      );
      const totalDur = Math.max(maxEnd, project.totalDuration);
      const sr = ctx.sampleRate;
      const totalSamples = Math.ceil(totalDur * sr);
      const mixBuffer = ctx.createBuffer(2, totalSamples, sr);

      for (const clip of readyClips) {
        const key = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
        if (!key) continue;
        const blob = await loadAudioBlobByKey(key);
        if (!blob) continue;
        const buf = await engine.decodeAudioData(blob);
        const offsetSamples = Math.round(clip.startTime * sr);
        for (let ch = 0; ch < Math.min(buf.numberOfChannels, 2); ch++) {
          const src = buf.getChannelData(ch);
          const dst = mixBuffer.getChannelData(ch);
          for (let i = 0; i < src.length && offsetSamples + i < totalSamples; i++) {
            dst[offsetSamples + i] += src[i];
          }
        }
      }
      finalBuffer = mixBuffer;
    }
  }

  if (!finalBuffer) {
    // Nothing to freeze — just set flag
    store.freezeTrack(trackId);
    return;
  }

  const wavBlob = audioBufferToWavBlob(finalBuffer);
  const frozenKey = await saveAudioBlob(project.id, `frozen-${trackId}`, 'isolated', wavBlob);
  store.freezeTrack(trackId, frozenKey);
}

/**
 * Flatten a track: freeze it (if not already), then convert to a sample track
 * with the frozen audio as its single clip.
 */
export async function flattenTrackToAudio(trackId: string): Promise<void> {
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) throw new Error('No project');

  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track '${trackId}' not found`);

  // Freeze first if not already frozen
  if (!track.frozen || !track.frozenAudioKey) {
    await freezeTrackToAudio(trackId);
  }

  // Re-read state after freeze
  const updatedProject = useProjectStore.getState().project;
  if (!updatedProject) return;
  const updatedTrack = updatedProject.tracks.find((t) => t.id === trackId);
  if (!updatedTrack?.frozenAudioKey) return;

  const audioKey = updatedTrack.frozenAudioKey;

  // Load frozen audio to compute peaks and duration
  const blob = await loadAudioBlobByKey(audioKey);
  if (!blob) return;

  const engine = getAudioEngine();
  const buf = await engine.decodeAudioData(blob);
  const peaks = await computeWaveformWithMipmap(audioKey, buf);
  const duration = buf.duration;

  useProjectStore.getState().flattenTrack(trackId, audioKey, peaks, duration);
}

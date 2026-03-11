/**
 * Extracts the mixed audio from all existing track clips that overlap a given
 * context window time range, renders them into a single WAV blob.
 *
 * This blob is then passed as `src_audio` (the context audio) when generating
 * a new clip with "from context" mode.
 */
import { useProjectStore } from '../store/projectStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { isolateTrackAudio } from '../engine/waveSubtraction';
import { audioBufferToWavBlob } from '../utils/wav';

export interface ContextWindow {
  startTime: number;
  endTime: number;
}

/**
 * Render all ready clips that overlap `contextWindow` into a single mixed WAV blob
 * cropped to exactly the context window duration.
 *
 * Returns null if no clips have audio in the context window range.
 */
export async function extractContextAudio(ctx: ContextWindow): Promise<Blob | null> {
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) return null;

  const ctxStart = ctx.startTime;
  const ctxEnd = ctx.endTime;
  const ctxDuration = ctxEnd - ctxStart;
  if (ctxDuration <= 0) return null;

  // Use an OfflineAudioContext so we don't need a live AudioContext
  const sampleRate = 48000;
  const frameLength = Math.ceil(ctxDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, frameLength, sampleRate);

  // Sort tracks DESC by order (mirrors playback isolation order)
  const tracksDesc = [...project.tracks].sort((a, b) => b.order - a.order);

  // Determine which tracks are effectively audible (respect mute/solo just like playback)
  const soloActive = project.tracks.some((t) => t.soloed);

  let anyScheduled = false;
  let previousCumBuffer: AudioBuffer | null = null;

  for (const track of tracksDesc) {
    // Whether this track's audio should be included in the final mix
    const isAudible = !track.muted && (!soloActive || track.soloed);

    for (const clip of track.clips) {
      if (clip.generationStatus !== 'ready' || !clip.cumulativeMixKey) continue;

      // Only include clips that overlap the context window
      const clipEnd = clip.startTime + clip.duration;
      if (clip.startTime >= ctxEnd || clipEnd <= ctxStart) continue;

      const cumBlob = await loadAudioBlobByKey(clip.cumulativeMixKey);
      if (!cumBlob) continue;

      const arrayBuffer = await cumBlob.arrayBuffer();
      const cumBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

      // Isolate this track's contribution using the same DESC-chain logic as playback.
      // We always compute the isolation to keep `previousCumBuffer` advancing correctly,
      // even for muted/non-soloed tracks. We just don't schedule their audio output.
      const fullIsolated = (clip.generatedFromContext && previousCumBuffer !== null)
        ? isolateTrackAudio(offlineCtx, cumBuffer, previousCumBuffer)
        : cumBuffer;

      previousCumBuffer = cumBuffer;

      // Skip scheduling if the track is muted or silenced by solo
      if (!isAudible) continue;

      // The isolated buffer covers the full project duration from time 0.
      // We need to crop it to the context window range [ctxStart, ctxEnd].
      const sr = fullIsolated.sampleRate;
      const bufferStartSample = Math.floor(ctxStart * sr);
      const bufferEndSample = Math.min(
        Math.floor(ctxEnd * sr),
        fullIsolated.length,
      );
      if (bufferEndSample <= bufferStartSample) continue;

      const cropLength = bufferEndSample - bufferStartSample;
      const cropped = offlineCtx.createBuffer(
        fullIsolated.numberOfChannels,
        cropLength,
        sr,
      );
      for (let ch = 0; ch < fullIsolated.numberOfChannels; ch++) {
        const src = fullIsolated.getChannelData(ch);
        const dst = cropped.getChannelData(ch);
        for (let i = 0; i < cropLength; i++) {
          dst[i] = src[bufferStartSample + i] ?? 0;
        }
      }

      // Schedule this clip's contribution at time 0 in the offline render
      // (the crop already aligns it to start at 0)
      const source = offlineCtx.createBufferSource();
      source.buffer = cropped;
      source.connect(offlineCtx.destination);
      source.start(0);
      anyScheduled = true;
    }
  }

  if (!anyScheduled) return null;

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}

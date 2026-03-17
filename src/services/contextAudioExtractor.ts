/**
 * Extracts the mixed audio from all existing track clips that overlap a given
 * context window time range, renders them into a single WAV blob.
 *
 * This blob is then passed as `src_audio` (the context audio) when generating
 * a new clip with "from context" mode.
 */
import { useProjectStore } from '../store/projectStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { audioBufferToWavBlob } from '../utils/wav';

export interface ContextWindow {
  startTime: number;
  endTime: number;
}

/**
 * Render all ready clips that overlap `contextWindow` into a single mixed WAV blob
 * whose time axis starts at project time 0 (not ctxStart).
 *
 * The backend assumes src_audio sample 0 = project time 0, so we must produce
 * a blob that spans [0, ctxEnd] to keep repainting_start / repainting_end
 * (which use absolute project times) aligned with the audio content.
 *
 * Returns null if no clips have audio in the context window range.
 */
export async function extractContextAudio(ctx: ContextWindow): Promise<Blob | null> {
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) return null;

  const ctxStart = ctx.startTime;
  const ctxEnd = ctx.endTime;
  if (ctxEnd <= ctxStart) return null;

  const sampleRate = 48000;
  const frameLength = Math.ceil(ctxEnd * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, frameLength, sampleRate);

  const soloActive = project.tracks.some((t) => t.soloed);

  let anyScheduled = false;

  for (const track of project.tracks) {
    const isAudible = !track.muted && (!soloActive || track.soloed);
    if (!isAudible) continue;

    for (const clip of track.clips) {
      if (clip.generationStatus !== 'ready') continue;

      const clipEnd = clip.startTime + clip.duration;
      if (clip.startTime >= ctxEnd || clipEnd <= ctxStart) continue;

      // Prefer isolatedAudioKey (pre-trimmed to clip region at generation),
      // fall back to cumulativeMixKey (full project-length).
      let blob: Blob | undefined;
      let alreadyTrimmed = false;

      if (clip.isolatedAudioKey) {
        blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
        if (blob) alreadyTrimmed = true;
      }
      if (!blob && clip.cumulativeMixKey) {
        blob = await loadAudioBlobByKey(clip.cumulativeMixKey);
      }
      if (!blob) continue;

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = await offlineCtx.decodeAudioData(arrayBuffer);

      // Compute the overlap between this clip and the context window.
      // isolatedAudioKey buffers start at sample 0 = clip.startTime;
      // cumulativeMixKey buffers start at sample 0 = project time 0.
      const overlapStart = Math.max(clip.startTime, ctxStart);
      const overlapEnd = Math.min(clipEnd, ctxEnd);
      if (overlapEnd <= overlapStart) continue;

      let srcStartSample: number;
      let srcEndSample: number;
      if (alreadyTrimmed) {
        srcStartSample = Math.floor((overlapStart - clip.startTime) * sampleRate);
        srcEndSample = Math.min(
          Math.floor((overlapEnd - clip.startTime) * sampleRate),
          buffer.length,
        );
      } else {
        srcStartSample = Math.floor(overlapStart * sampleRate);
        srcEndSample = Math.min(
          Math.floor(overlapEnd * sampleRate),
          buffer.length,
        );
      }
      if (srcEndSample <= srcStartSample) continue;

      const cropLength = srcEndSample - srcStartSample;
      const cropped = offlineCtx.createBuffer(buffer.numberOfChannels, cropLength, sampleRate);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const src = buffer.getChannelData(ch);
        const dst = cropped.getChannelData(ch);
        for (let i = 0; i < cropLength; i++) {
          dst[i] = src[srcStartSample + i] ?? 0;
        }
      }

      // Schedule at absolute project time so the blob's time axis matches
      // the repainting_start / repainting_end coordinates sent to the backend
      const scheduleTime = overlapStart;
      const source = offlineCtx.createBufferSource();
      source.buffer = cropped;
      source.connect(offlineCtx.destination);
      source.start(scheduleTime);
      anyScheduled = true;
    }
  }

  if (!anyScheduled) return null;

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}

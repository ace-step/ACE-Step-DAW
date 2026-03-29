/**
 * Extracts the mixed audio from all existing track clips that overlap a given
 * context window time range, renders them into a single WAV blob.
 *
 * This blob is then passed as `src_audio` (the context audio) when generating
 * a new clip with "from context" mode.
 *
 * IMPORTANT: This must match AudioEngine's playback behaviour — applying
 * timeStretchRate, audioOffset, and warpMarkers so the context preview
 * sounds identical to timeline playback.
 */
import { useProjectStore } from '../store/projectStore';
import { loadAudioBlobByKey } from './audioFileManager';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWarpedSegments } from '../utils/audioWarp';

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

      const audioOffset = clip.audioOffset ?? 0;
      const rate = clip.timeStretchRate ?? 1;
      const hasWarpMarkers = clip.warpMarkers && clip.warpMarkers.length > 0;

      if (hasWarpMarkers) {
        // Schedule warped segments — mirrors AudioEngine._scheduleWarpedClip
        const segments = computeWarpedSegments(clip.warpMarkers!, clip.duration);

        for (const seg of segments) {
          const segTimelineStart = clip.startTime + seg.targetStart;
          const segTimelineEnd = clip.startTime + seg.targetEnd;

          // Skip segments entirely outside context window
          if (segTimelineEnd <= ctxStart || segTimelineStart >= ctxEnd) continue;

          // Clamp to context window
          const overlapStart = Math.max(segTimelineStart, ctxStart);
          const overlapEnd = Math.min(segTimelineEnd, ctxEnd);
          if (overlapEnd <= overlapStart) continue;

          const source = offlineCtx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = seg.playbackRate;
          source.connect(offlineCtx.destination);

          const sourceDur = seg.sourceEnd - seg.sourceStart;
          const targetDur = seg.targetEnd - seg.targetStart;

          if (overlapStart <= segTimelineStart) {
            // Context includes segment start — schedule normally
            source.start(
              segTimelineStart,
              audioOffset + seg.sourceStart,
              sourceDur,
            );
          } else {
            // Context starts mid-segment — seek into it
            const elapsed = overlapStart - segTimelineStart;
            const fraction = elapsed / targetDur;
            const sourceSeek = fraction * sourceDur;
            source.start(
              overlapStart,
              audioOffset + seg.sourceStart + sourceSeek,
              sourceDur - sourceSeek,
            );
          }
          anyScheduled = true;
        }
      } else {
        // Standard clip — mirrors AudioEngine._scheduleStandardClip
        // For isolatedAudioKey: buffer starts at clip.startTime
        // For cumulativeMixKey: buffer starts at project time 0
        const overlapStart = Math.max(clip.startTime, ctxStart);
        const overlapEnd = Math.min(clipEnd, ctxEnd);
        if (overlapEnd <= overlapStart) continue;

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        source.connect(offlineCtx.destination);

        // Calculate buffer duration adjusted for stretch rate:
        // timeline duration = buffer duration / rate, so buffer duration = timeline duration * rate
        const timelineDuration = clip.duration;
        const bufferDuration = timelineDuration * rate;

        if (overlapStart <= clip.startTime) {
          // Context includes clip start — schedule from beginning
          let srcOffset: number;
          if (alreadyTrimmed) {
            srcOffset = audioOffset;
          } else {
            srcOffset = audioOffset + clip.startTime * rate;
          }
          source.start(clip.startTime, srcOffset, bufferDuration);
        } else {
          // Context starts mid-clip — seek into it
          const seekOffset = overlapStart - clip.startTime;
          const bufferSeek = seekOffset * rate;
          const bufferRemaining = (clipEnd - overlapStart) * rate;
          let srcOffset: number;
          if (alreadyTrimmed) {
            srcOffset = audioOffset + bufferSeek;
          } else {
            srcOffset = audioOffset + clip.startTime * rate + bufferSeek;
          }
          source.start(overlapStart, srcOffset, bufferRemaining);
        }
        anyScheduled = true;
      }
    }
  }

  if (!anyScheduled) return null;

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}

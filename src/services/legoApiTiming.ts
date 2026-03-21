/**
 * Maps a timeline clip to ACE-Step `task_type: lego` timing fields on `/release_task`.
 *
 * From-silence generation uses a tiny placeholder WAV; the server must rely on
 * `audio_duration` for target length / Metas. We therefore send:
 * - `repainting_start`: 0
 * - `repainting_end`: -1
 * - `audio_duration`: clip duration (select window length), not the full timeline.
 *
 * Context / cumulative generation keeps repainting in timeline seconds and uses
 * `audio_duration` = project timeline extent (same as previous DAW behavior).
 */

export interface LegoTimingClip {
  startTime: number;
  duration: number;
}

export interface LegoTimingRepaintRange {
  start: number;
  end: number;
}

export interface LegoTimingResult {
  repainting_start: number;
  repainting_end: number;
  /** Seconds: for forceSilence = clip length; else = project timeline duration */
  audio_duration: number;
  /** Whether to use chunk-style DiT instruction ("segment" vs full track) */
  isChunkMode: boolean;
}

const MIN_LEGAL_AUDIO_DURATION_SEC = 1e-3;

export function computeLegoTimingParams(
  forceSilence: boolean,
  clip: LegoTimingClip,
  projectTimelineDuration: number,
  repaintRange?: LegoTimingRepaintRange,
): LegoTimingResult {
  const clipEnd = clip.startTime + clip.duration;

  if (forceSilence) {
    return {
      repainting_start: 0,
      repainting_end: -1,
      audio_duration: Math.max(clip.duration, MIN_LEGAL_AUDIO_DURATION_SEC),
      isChunkMode: clip.startTime > 0.5 || clipEnd < projectTimelineDuration - 0.5,
    };
  }

  const repainting_start = repaintRange?.start ?? clip.startTime;
  const repainting_end = repaintRange?.end ?? clipEnd;

  return {
    repainting_start,
    repainting_end,
    audio_duration: projectTimelineDuration,
    isChunkMode: repainting_start > 0.5 || repainting_end < projectTimelineDuration - 0.5,
  };
}

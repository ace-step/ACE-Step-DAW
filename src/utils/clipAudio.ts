import type { Clip } from '../types/project';

/**
 * Number of interleaved peak values stored per clip (Lmax, Lmin, Rmax, Rmin per logical peak).
 * 8192 values = 2048 logical peaks — enough for professional-quality detail at high zoom.
 */
export const CLIP_WAVEFORM_PEAK_COUNT = 8192;

const RATE_EPSILON = 0.0001;
const MIN_PLAYBACK_RATE = 0.0001;

type ClipAudioState = Pick<
  Clip,
  'startTime' | 'duration' | 'audioDuration' | 'audioOffset' | 'contentOffset' | 'timeStretchRate' | 'stretchMode'
>;

export function getClipPlaybackRate(clip: ClipAudioState): number {
  return Math.max(MIN_PLAYBACK_RATE, clip.timeStretchRate ?? 1);
}

export function isClipRepitchStretched(clip: ClipAudioState): boolean {
  return clip.stretchMode === 'repitch' || Math.abs(getClipPlaybackRate(clip) - 1) > RATE_EPSILON;
}

export function getClipContentOffset(clip: ClipAudioState): number {
  return Math.max(0, Math.min(clip.contentOffset ?? 0, Math.max(0, clip.duration)));
}

export function getClipSourceRemaining(clip: ClipAudioState): number {
  const audioDuration = Math.max(0, clip.audioDuration ?? clip.duration);
  const audioOffset = Math.max(0, clip.audioOffset ?? 0);
  return Math.max(0, audioDuration - audioOffset);
}

export function getClipAudibleTimelineDuration(clip: ClipAudioState): number {
  const sourceRemaining = getClipSourceRemaining(clip);
  if (sourceRemaining <= 0) return 0;

  if (isClipRepitchStretched(clip)) {
    return Math.min(Math.max(0, clip.duration), sourceRemaining / getClipPlaybackRate(clip));
  }

  return Math.min(Math.max(0, clip.duration - getClipContentOffset(clip)), sourceRemaining);
}

export function getClipSourceSpan(clip: ClipAudioState): number {
  const sourceRemaining = getClipSourceRemaining(clip);
  if (sourceRemaining <= 0) return 0;

  if (isClipRepitchStretched(clip)) {
    return Math.min(sourceRemaining, Math.max(0, clip.duration) * getClipPlaybackRate(clip));
  }

  return Math.min(sourceRemaining, Math.max(0, clip.duration - getClipContentOffset(clip)));
}

export function getClipAudibleStartTime(clip: ClipAudioState): number {
  return clip.startTime + (isClipRepitchStretched(clip) ? 0 : getClipContentOffset(clip));
}

export function getClipAudibleEndTime(clip: ClipAudioState): number {
  return getClipAudibleStartTime(clip) + getClipAudibleTimelineDuration(clip);
}

export function getClipAudibleSourceEnd(clip: ClipAudioState): number {
  return Math.max(0, clip.audioOffset ?? 0) + getClipSourceSpan(clip);
}

export function getClipWaveformLayout(clip: ClipAudioState, width: number) {
  const safeWidth = Math.max(0, width);
  if (safeWidth <= 0) {
    return { leftPx: 0, widthPx: 0 };
  }

  if (isClipRepitchStretched(clip)) {
    return { leftPx: 0, widthPx: safeWidth };
  }

  const clipDuration = Math.max(clip.duration, RATE_EPSILON);
  const leftPx = (getClipContentOffset(clip) / clipDuration) * safeWidth;
  const widthPx = (getClipAudibleTimelineDuration(clip) / clipDuration) * safeWidth;
  return {
    leftPx,
    widthPx: Math.max(0, Math.min(safeWidth - leftPx, widthPx)),
  };
}

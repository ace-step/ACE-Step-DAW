import type { Track } from '../types/project';

/** Returns true if the track is a video track. */
export function isVideoTrack(track: Track): boolean {
  return track.trackType === 'video';
}

/** Returns true if the track is an audio track (any non-video track type). */
export function isAudioTrack(track: Track): boolean {
  return track.trackType !== 'video';
}

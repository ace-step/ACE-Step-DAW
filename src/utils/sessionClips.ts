import type { Clip, Track } from '../types/project';

/** A clip is playable if it has audio (ready) or MIDI notes. */
export function isPlayableClip(clip: Clip): boolean {
  return clip.generationStatus === 'ready' || (clip.midiData?.notes.length ?? 0) > 0;
}

/** Return playable clips for a track, sorted by startTime (scene order). */
export function getSessionClips(track: Track): Clip[] {
  return [...track.clips]
    .filter(isPlayableClip)
    .sort((a, b) => a.startTime - b.startTime);
}

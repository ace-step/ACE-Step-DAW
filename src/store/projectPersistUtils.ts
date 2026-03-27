import type { Project } from '../types/project';

/**
 * Strip heavy data (e.g. waveformPeaks) from a project before persisting to
 * localStorage.  Returns a shallow-cloned project with tracks/clips copied
 * just deep enough to null-out waveformPeaks without mutating the original.
 *
 * waveformPeaks are regenerated from audio on load, so they don't need to
 * survive in the (size-constrained) localStorage copy.
 */
export function stripHeavyDataForPersist(project: Project): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        waveformPeaks: null,
        versions: clip.versions?.map((v) => ({ ...v, waveformPeaks: null })),
        takes: clip.takes?.map((t) => ({ ...t, waveformPeaks: null })),
      })),
    })),
    assets: project.assets?.map((a) => ({
      ...a,
      waveformPeaks: null,
      originClipSnapshot: a.originClipSnapshot
        ? { ...a.originClipSnapshot, waveformPeaks: null }
        : undefined,
    })),
  };
}

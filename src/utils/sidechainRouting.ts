import type { Track, CompressorParams } from '../types/project';

/** A sidechain routing connection between a source track and a target track's compressor effect. */
export interface SidechainRoute {
  sourceTrackId: string;
  targetTrackId: string;
  effectId: string;
}

/**
 * Scans all tracks for compressor effects that have a sidechain source assigned.
 * Returns an array of route descriptors for visual rendering.
 * Only includes routes where the source track actually exists in the project.
 */
export function getSidechainRoutes(tracks: Track[]): SidechainRoute[] {
  const trackIds = new Set(tracks.map((t) => t.id));
  const routes: SidechainRoute[] = [];

  for (const track of tracks) {
    for (const effect of track.effects ?? []) {
      if (effect.type !== 'compressor') continue;
      const params = effect.params as CompressorParams;
      if (!params.sidechainSourceTrackId) continue;
      if (!trackIds.has(params.sidechainSourceTrackId)) continue;

      routes.push({
        sourceTrackId: params.sidechainSourceTrackId,
        targetTrackId: track.id,
        effectId: effect.id,
      });
    }
  }

  return routes;
}

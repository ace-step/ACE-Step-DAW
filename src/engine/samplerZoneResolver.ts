import type { SamplerConfig, SampleZone } from '../types/project';
import { matchZones, computeZoneCrossfadeGains } from '../utils/sampleZones';

/** Info needed to play a single zone's sample for a note event. */
export interface ZonePlaybackInfo {
  /** IndexedDB audio key for the sample to play. */
  audioKey: string;
  /** Root note for pitch calculation. */
  rootNote: number;
  /** Combined gain (zone volume × crossfade). */
  gain: number;
  /** Stereo pan (-1 to 1). */
  pan: number;
  /** Tuning offset in cents. */
  tuneOffsetCents: number;
}

/**
 * Resolve which samples to play for a given note event.
 *
 * - If zones are defined, matches by key and velocity, applies crossfade.
 * - Falls back to the primary sample if no zones match or zones are empty.
 */
export function resolveZonePlayback(
  config: SamplerConfig,
  pitch: number,
  velocity: number,
): ZonePlaybackInfo[] {
  const zones = config.zones;

  // No zones → play primary sample
  if (!zones || zones.length === 0) {
    return [
      {
        audioKey: config.audioKey,
        rootNote: config.rootNote,
        gain: 1,
        pan: 0,
        tuneOffsetCents: 0,
      },
    ];
  }

  const matched = matchZones(zones, pitch, velocity);

  // No zone matched → fall back to primary
  if (matched.length === 0) {
    return [
      {
        audioKey: config.audioKey,
        rootNote: config.rootNote,
        gain: 1,
        pan: 0,
        tuneOffsetCents: 0,
      },
    ];
  }

  // Compute crossfade gains for matched zones
  const withGains = computeZoneCrossfadeGains(matched, pitch);

  return withGains.map(({ zone, gain }) => ({
    audioKey: zone.audioKey,
    rootNote: zone.rootNote,
    gain: gain * zone.volume,
    pan: zone.pan,
    tuneOffsetCents: zone.tuneOffset,
  }));
}

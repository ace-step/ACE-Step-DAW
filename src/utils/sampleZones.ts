import type { SampleZone } from '../types/project';

/** Create a SampleZone with sensible defaults. */
export function createDefaultZone(
  audioKey: string,
  overrides: Partial<SampleZone> = {},
): SampleZone {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    audioKey,
    rootNote: 60,
    lowKey: 0,
    highKey: 127,
    lowVelocity: 0,
    highVelocity: 127,
    volume: 1,
    pan: 0,
    tuneOffset: 0,
    crossfadeWidth: 0,
    ...overrides,
  };
}

/**
 * Find all zones matching a given pitch and velocity.
 * Includes zones within crossfade margin of their boundaries
 * so that adjacent (non-overlapping) zones can crossfade.
 */
export function matchZones(
  zones: SampleZone[],
  pitch: number,
  velocity: number,
): SampleZone[] {
  return zones.filter((z) => {
    const margin = z.crossfadeWidth ?? 0;
    return (
      pitch >= z.lowKey - margin &&
      pitch <= z.highKey + margin &&
      velocity >= z.lowVelocity &&
      velocity <= z.highVelocity
    );
  });
}

/**
 * Compute per-zone gains accounting for crossfade regions at zone boundaries.
 * Uses linear crossfade within the crossfadeWidth at each zone boundary.
 */
export function computeZoneCrossfadeGains(
  zones: SampleZone[],
  pitch: number,
): { zone: SampleZone; gain: number }[] {
  return zones.map((z) => {
    const width = z.crossfadeWidth;
    if (width <= 0) {
      return { zone: z, gain: 1 };
    }

    let gain = 1;

    // Fade in at low boundary
    const lowFadeEnd = z.lowKey + width;
    if (pitch < lowFadeEnd && pitch >= z.lowKey) {
      gain = Math.min(gain, (pitch - z.lowKey + 1) / (width + 1));
    }

    // Fade out at high boundary
    const highFadeStart = z.highKey - width;
    if (pitch > highFadeStart && pitch <= z.highKey) {
      gain = Math.min(gain, (z.highKey - pitch + 1) / (width + 1));
    }

    return { zone: z, gain: Math.max(0, Math.min(1, gain)) };
  });
}

/** Validate zones and return an array of error messages (empty if valid). */
export function validateZones(zones: SampleZone[]): string[] {
  const errors: string[] = [];
  for (const z of zones) {
    if (z.lowKey > z.highKey) {
      errors.push(`Zone ${z.id}: lowKey (${z.lowKey}) > highKey (${z.highKey})`);
    }
    if (z.lowVelocity > z.highVelocity) {
      errors.push(`Zone ${z.id}: lowVelocity (${z.lowVelocity}) > highVelocity (${z.highVelocity})`);
    }
    if (z.lowKey < 0 || z.lowKey > 127 || z.highKey < 0 || z.highKey > 127) {
      errors.push(`Zone ${z.id}: key range out of MIDI bounds (0–127)`);
    }
    if (z.lowVelocity < 0 || z.lowVelocity > 127 || z.highVelocity < 0 || z.highVelocity > 127) {
      errors.push(`Zone ${z.id}: velocity range out of MIDI bounds (0–127)`);
    }
  }
  return errors;
}

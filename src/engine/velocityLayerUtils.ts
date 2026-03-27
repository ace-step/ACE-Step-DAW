import type { VelocityLayer } from '../types/project';

export interface SelectedLayer {
  layer: VelocityLayer;
  /** Crossfade gain (0–1). Multiply with layer.gain for final amplitude. */
  crossfadeGain: number;
}

/**
 * Select which velocity layers to trigger for a given MIDI velocity (0–127).
 *
 * - If only one layer matches, it plays at full crossfadeGain (1).
 * - If two or more layers overlap at the velocity, a linear crossfade is
 *   applied based on the velocity's position within each layer's range.
 *   The crossfade gains are normalized so they sum to 1.
 */
export function selectVelocityLayers(
  layers: VelocityLayer[] | undefined,
  velocity: number,
): SelectedLayer[] {
  if (!layers || layers.length === 0) return [];

  const matching = layers.filter(
    (l) => velocity >= l.minVelocity && velocity <= l.maxVelocity,
  );

  if (matching.length === 0) return [];
  if (matching.length === 1) {
    return [{ layer: matching[0], crossfadeGain: 1 }];
  }

  // Multiple overlapping layers — compute linear crossfade weights.
  // Weight is based on how "centered" the velocity is within each layer's range.
  // A layer whose range is wider relative to the velocity gets proportionally more weight.
  const weights = matching.map((l) => {
    const range = l.maxVelocity - l.minVelocity;
    if (range === 0) return 1;
    // Position within layer: 0 at minVelocity, 1 at maxVelocity
    const position = (velocity - l.minVelocity) / range;
    // Weight peaks at center (0.5) using triangle-ish shape; clamp to avoid 0.
    return Math.max(0.001, 1 - Math.abs(position - 0.5) * 2);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return matching.map((layer, i) => ({
    layer,
    crossfadeGain: weights[i] / totalWeight,
  }));
}

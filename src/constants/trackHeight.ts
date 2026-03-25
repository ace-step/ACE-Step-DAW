import type { TrackType } from '../types/project';

export type TrackHeightPreset = 'small' | 'medium' | 'large' | 'auto';

/** Fixed pixel heights for non-auto presets. */
export const TRACK_HEIGHT_PRESETS: Record<string, number> = {
  small: 48,
  medium: 80,
  large: 140,
};

/** Default lane heights per track type (used for 'auto' preset). */
const AUTO_DEFAULTS: Record<TrackType, number> = {
  stems: 80,
  mix: 80,
  sample: 80,
  sequencer: 80,
  pianoRoll: 88,
  drumMachine: 80,
  strudel: 80,
};

/** Resolve a preset to a pixel height, considering track type for 'auto'. */
export function getTrackHeightForPreset(
  preset: TrackHeightPreset,
  trackType: TrackType,
): number {
  if (preset === 'auto') return AUTO_DEFAULTS[trackType] ?? 80;
  return TRACK_HEIGHT_PRESETS[preset];
}

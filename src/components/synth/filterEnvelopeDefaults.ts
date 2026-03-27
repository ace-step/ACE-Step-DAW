import type { FilterEnvelope } from '../../types/project';

/** Default filter envelope values — single source of truth used by store, UI, and engine. */
export const DEFAULT_FILTER_ENVELOPE: FilterEnvelope = {
  attack: 0.01,
  decay: 0.3,
  sustain: 0.5,
  release: 0.8,
  baseFrequency: 200,
  octaves: 4,
};

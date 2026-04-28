import type { AutomationLane, TrackEffect, FilterParams, FlangerParams } from '../types/project';

interface LfoConflict {
  effectId: string;
  effectType: string;
  param: string;
}

/**
 * LFO-modulated parameters by effect type.
 * These are the parameters that an LFO directly modulates at audio rate.
 */
const LFO_MODULATED_PARAMS: Record<string, { enabledKey: string | null; params: string[] }> = {
  filter: { enabledKey: 'lfoEnabled', params: ['frequency'] },
  // Flanger always creates an LFO — no user toggle exists
  flanger: { enabledKey: null, params: ['delayTime', 'frequency'] },
};

/**
 * Detect if an automation lane conflicts with an LFO on the same effect parameter.
 * A conflict exists when:
 * 1. The automation lane targets the same effect instance
 * 2. The effect has an LFO enabled
 * 3. The automation targets a parameter that the LFO modulates
 */
export function detectLfoAutomationConflict(
  effect: TrackEffect,
  lane: AutomationLane,
): boolean {
  if (lane.parameter.type !== 'effect') return false;
  if (lane.parameter.effectId !== effect.id) return false;

  const lfoConfig = LFO_MODULATED_PARAMS[effect.type];
  if (!lfoConfig) return false;

  // enabledKey: null means the LFO is always active (e.g., flanger)
  if (lfoConfig.enabledKey !== null) {
    const params = effect.params as unknown as Record<string, unknown>;
    if (!params[lfoConfig.enabledKey]) return false;
  }

  return lfoConfig.params.includes(lane.parameter.param);
}

/**
 * Find all LFO/automation conflicts for a given track.
 */
export function getConflictingLfoParams(
  trackId: string,
  effects: TrackEffect[],
  automationLanes: AutomationLane[],
): LfoConflict[] {
  const conflicts: LfoConflict[] = [];
  const trackLanes = automationLanes.filter((l) => l.trackId === trackId);

  for (const effect of effects) {
    for (const lane of trackLanes) {
      if (detectLfoAutomationConflict(effect, lane)) {
        conflicts.push({
          effectId: effect.id,
          effectType: effect.type,
          param: lane.parameter.type === 'effect' ? lane.parameter.param : '',
        });
      }
    }
  }

  return conflicts;
}

import type { AutomationLane, Track, FilterParams, FlangerParams } from '../types/project';

export interface AutomationLfoConflict {
  trackId: string;
  effectId: string;
  effectType: string;
  param: string;
  lfoSource: 'effect-lfo' | 'internal-lfo';
}

/**
 * Parameters modulated by an explicit LFO per effect type.
 * Only listed when the effect has a user-configurable LFO that targets
 * the same parameter automation can write to.
 */
const EFFECT_LFO_TARGETS: Record<string, {
  /** The param name(s) that the LFO modulates */
  params: string[];
  /** Whether the LFO is always active (flanger) or conditional (filter) */
  alwaysActive: boolean;
  /** For conditional LFOs, the params field name that enables it */
  enabledField?: string;
}> = {
  filter: {
    params: ['frequency'],
    alwaysActive: false,
    enabledField: 'lfoEnabled',
  },
  flanger: {
    params: ['delayTime'],
    alwaysActive: true,
  },
};

/**
 * Detect automation lanes that conflict with active LFOs on the same effect parameter.
 *
 * Returns a list of conflicts where both an automation lane and an LFO
 * target the same parameter on the same effect.
 */
export function detectAutomationLfoConflicts(
  track: Track,
  automationLanes: AutomationLane[],
): AutomationLfoConflict[] {
  const conflicts: AutomationLfoConflict[] = [];
  const effects = track.effects;
  if (!effects || effects.length === 0) return conflicts;

  for (const lane of automationLanes) {
    if (lane.trackId !== track.id) continue;
    if (lane.parameter.type !== 'effect') continue;
    if (lane.points.length === 0) continue;

    const param = lane.parameter;
    const effect = effects.find((e) => e.id === param.effectId);
    if (!effect || !effect.enabled) continue;

    const lfoInfo = EFFECT_LFO_TARGETS[effect.type];
    if (!lfoInfo) continue;

    // Check if this param is one that the LFO modulates
    if (!lfoInfo.params.includes(param.param)) continue;

    // Check if the LFO is actually active
    if (lfoInfo.alwaysActive) {
      conflicts.push({
        trackId: track.id,
        effectId: effect.id,
        effectType: effect.type,
        param: param.param,
        lfoSource: 'effect-lfo',
      });
    } else if (lfoInfo.enabledField) {
      const effectParams = effect.params as unknown as Record<string, unknown>;
      if (effectParams[lfoInfo.enabledField] === true) {
        conflicts.push({
          trackId: track.id,
          effectId: effect.id,
          effectType: effect.type,
          param: param.param,
          lfoSource: 'effect-lfo',
        });
      }
    }
  }

  return conflicts;
}

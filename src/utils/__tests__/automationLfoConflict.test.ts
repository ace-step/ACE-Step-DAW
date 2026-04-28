import { describe, it, expect } from 'vitest';
import { detectLfoAutomationConflict, getConflictingLfoParams } from '../automationLfoConflict';
import type { AutomationLane, TrackEffect } from '../../types/project';

describe('automationLfoConflict', () => {
  const makeFilterEffect = (lfoEnabled: boolean): TrackEffect => ({
    id: 'fx-1',
    type: 'filter',
    enabled: true,
    params: {
      frequency: 1000,
      resonance: 1,
      filterType: 'lowpass' as const,
      lfoEnabled,
      lfoRate: 2,
      lfoDepth: 0.5,
    },
  });

  const makeFlangerEffect = (): TrackEffect => ({
    id: 'fx-2',
    type: 'flanger',
    enabled: true,
    params: {
      frequency: 0.5,
      depth: 0.7,
      delayTime: 3,
      feedback: 0.5,
      wet: 0.5,
    },
  });

  const makeAutomationLane = (effectId: string, effectType: string, param: string): AutomationLane => ({
    id: 'lane-1',
    trackId: 'track-1',
    parameter: {
      type: 'effect',
      effectId,
      effectType: effectType as any,
      param,
    },
    points: [{ time: 0, value: 0.5 }, { time: 10, value: 0.5 }],
  });

  describe('detectLfoAutomationConflict', () => {
    it('returns true when automation targets frequency of LFO-enabled filter', () => {
      const effect = makeFilterEffect(true);
      const lane = makeAutomationLane('fx-1', 'filter', 'frequency');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(true);
    });

    it('returns false when LFO is disabled on filter', () => {
      const effect = makeFilterEffect(false);
      const lane = makeAutomationLane('fx-1', 'filter', 'frequency');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(false);
    });

    it('returns false when automation targets non-LFO param (e.g. resonance)', () => {
      const effect = makeFilterEffect(true);
      const lane = makeAutomationLane('fx-1', 'filter', 'resonance');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(false);
    });

    it('returns false when effect IDs do not match', () => {
      const effect = makeFilterEffect(true);
      const lane = makeAutomationLane('fx-other', 'filter', 'frequency');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(false);
    });

    it('returns true when automation targets delayTime of flanger (always-on LFO)', () => {
      const effect = makeFlangerEffect();
      const lane = makeAutomationLane('fx-2', 'flanger', 'delayTime');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(true);
    });

    it('returns true when automation targets frequency of flanger', () => {
      const effect = makeFlangerEffect();
      const lane = makeAutomationLane('fx-2', 'flanger', 'frequency');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(true);
    });

    it('returns false when automation targets non-LFO flanger param (e.g. wet)', () => {
      const effect = makeFlangerEffect();
      const lane = makeAutomationLane('fx-2', 'flanger', 'wet');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(false);
    });

    it('returns false for non-LFO effect types', () => {
      const effect: TrackEffect = {
        id: 'fx-3',
        type: 'reverb',
        enabled: true,
        params: { decay: 2.4, preDelay: 0.02, wet: 0.5 },
      };
      const lane = makeAutomationLane('fx-3', 'reverb', 'decay');
      expect(detectLfoAutomationConflict(effect, lane)).toBe(false);
    });
  });

  describe('getConflictingLfoParams', () => {
    it('returns conflicting params for filter with LFO + frequency automation', () => {
      const effects: TrackEffect[] = [makeFilterEffect(true)];
      const lanes: AutomationLane[] = [makeAutomationLane('fx-1', 'filter', 'frequency')];
      const conflicts = getConflictingLfoParams('track-1', effects, lanes);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].effectId).toBe('fx-1');
      expect(conflicts[0].param).toBe('frequency');
    });

    it('returns empty array when no conflicts exist', () => {
      const effects: TrackEffect[] = [makeFilterEffect(false)];
      const lanes: AutomationLane[] = [makeAutomationLane('fx-1', 'filter', 'frequency')];
      const conflicts = getConflictingLfoParams('track-1', effects, lanes);
      expect(conflicts).toHaveLength(0);
    });

    it('returns empty array for different track', () => {
      const effects: TrackEffect[] = [makeFilterEffect(true)];
      const lanes: AutomationLane[] = [makeAutomationLane('fx-1', 'filter', 'frequency')];
      const conflicts = getConflictingLfoParams('other-track', effects, lanes);
      expect(conflicts).toHaveLength(0);
    });
  });
});

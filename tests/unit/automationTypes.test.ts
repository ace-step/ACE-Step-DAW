import { describe, expect, it } from 'vitest';
import {
  automationParamEquals,
  normalizedToMixerValue,
  type AutomationParameter,
} from '../../src/types/project';

describe('automation types', () => {
  describe('normalizedToMixerValue', () => {
    it('maps normalized volume values directly', () => {
      expect(normalizedToMixerValue('volume', 0)).toBe(0);
      expect(normalizedToMixerValue('volume', 1)).toBe(1);
    });

    it('maps normalized pan values into the -1 to 1 range', () => {
      expect(normalizedToMixerValue('pan', 0)).toBe(-1);
      expect(normalizedToMixerValue('pan', 0.5)).toBe(0);
      expect(normalizedToMixerValue('pan', 1)).toBe(1);
    });
  });

  describe('automationParamEquals', () => {
    it('returns true for identical automation params', () => {
      const param: AutomationParameter = { type: 'mixer', param: 'volume' };

      expect(automationParamEquals(param, { type: 'mixer', param: 'volume' })).toBe(true);
    });

    it('returns false for different automation params', () => {
      const left: AutomationParameter = { type: 'mixer', param: 'volume' };
      const right: AutomationParameter = { type: 'mixer', param: 'pan' };

      expect(automationParamEquals(left, right)).toBe(false);
    });

    it('matches identical effect automation params including effect identity', () => {
      const param: AutomationParameter = {
        type: 'effect',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
      };

      expect(automationParamEquals(param, {
        type: 'effect',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
      })).toBe(true);
    });

    it('treats different effects as different automation lanes even when the parameter name matches', () => {
      const left: AutomationParameter = {
        type: 'effect',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
      };
      const right: AutomationParameter = {
        type: 'effect',
        effectId: 'fx-2',
        effectType: 'filter',
        param: 'frequency',
      };

      expect(automationParamEquals(left, right)).toBe(false);
    });
  });
});

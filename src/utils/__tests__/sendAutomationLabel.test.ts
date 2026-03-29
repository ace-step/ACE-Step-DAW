import { describe, it, expect } from 'vitest';
import { getEffectAutomationColor } from '../effectAutomation';
import type { AutomationParameter } from '../../types/project';

describe('send automation label and color', () => {
  it('getEffectAutomationColor returns orange for send params', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const color = getEffectAutomationColor(param);
    expect(color).toBe('#f97316');
  });

  it('getEffectAutomationColor returns different color from mixer volume', () => {
    const sendParam: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const volParam: AutomationParameter = { type: 'mixer', param: 'volume' };
    const sendColor = getEffectAutomationColor(sendParam);
    const volColor = getEffectAutomationColor(volParam);
    expect(sendColor).not.toBe(volColor);
  });

  it('getEffectAutomationColor works for different send indices', () => {
    const param0: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const param1: AutomationParameter = { type: 'send', sendIndex: 1, param: 'amount' };
    expect(getEffectAutomationColor(param0)).toBe('#f97316');
    expect(getEffectAutomationColor(param1)).toBe('#f97316');
  });
});

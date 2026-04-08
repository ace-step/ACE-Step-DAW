import { describe, expect, it } from 'vitest';
import { SHORTCUT_ACTIONS, SHORTCUT_ACTION_MAP } from '../shortcutDefaults';

describe('variation switching shortcut definitions', () => {
  it('defines variation1 through variation4 shortcuts', () => {
    expect(SHORTCUT_ACTION_MAP['generation.variation1']).toBeDefined();
    expect(SHORTCUT_ACTION_MAP['generation.variation2']).toBeDefined();
    expect(SHORTCUT_ACTION_MAP['generation.variation3']).toBeDefined();
    expect(SHORTCUT_ACTION_MAP['generation.variation4']).toBeDefined();
  });

  it('uses Alt+Digit1–4 as default combos', () => {
    expect(SHORTCUT_ACTION_MAP['generation.variation1'].defaultCombo).toEqual({ code: 'Digit1', alt: true });
    expect(SHORTCUT_ACTION_MAP['generation.variation2'].defaultCombo).toEqual({ code: 'Digit2', alt: true });
    expect(SHORTCUT_ACTION_MAP['generation.variation3'].defaultCombo).toEqual({ code: 'Digit3', alt: true });
    expect(SHORTCUT_ACTION_MAP['generation.variation4'].defaultCombo).toEqual({ code: 'Digit4', alt: true });
  });

  it('scopes variation shortcuts to global context', () => {
    for (let i = 1; i <= 4; i++) {
      const action = SHORTCUT_ACTION_MAP[`generation.variation${i}`];
      expect(action.contexts).toEqual(['global']);
    }
  });

  it('variation shortcuts do not conflict with other global shortcuts', () => {
    const variationIds = new Set([
      'generation.variation1', 'generation.variation2',
      'generation.variation3', 'generation.variation4',
    ]);
    const variationCombos = SHORTCUT_ACTIONS
      .filter((a) => variationIds.has(a.id))
      .map((a) => `${a.defaultCombo.code}|${!!a.defaultCombo.mod}|${!!a.defaultCombo.shift}|${!!a.defaultCombo.alt}`);

    const otherGlobalCombos = SHORTCUT_ACTIONS
      .filter((a) => !variationIds.has(a.id) && a.contexts?.includes('global'))
      .map((a) => `${a.defaultCombo.code}|${!!a.defaultCombo.mod}|${!!a.defaultCombo.shift}|${!!a.defaultCombo.alt}`);

    for (const combo of variationCombos) {
      expect(otherGlobalCombos).not.toContain(combo);
    }
  });
});

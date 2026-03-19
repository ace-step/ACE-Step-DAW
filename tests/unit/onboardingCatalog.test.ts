import { describe, expect, it } from 'vitest';
import { ONBOARDING_TUTORIAL_STEPS } from '../../src/data/onboardingCatalog';

describe('onboarding tutorial catalog', () => {
  it('covers the command palette with the Cmd+K shortcut in the 5-step flow', () => {
    expect(ONBOARDING_TUTORIAL_STEPS).toHaveLength(5);

    const stepIds = ONBOARDING_TUTORIAL_STEPS.map((step) => step.id);
    expect(stepIds).toEqual(['timeline', 'transport', 'genr', 'mixer', 'command-palette']);

    const commandPaletteStep = ONBOARDING_TUTORIAL_STEPS[4];
    expect(commandPaletteStep.selector).toBe('[data-onboarding-target="command-palette-button"]');
    expect(commandPaletteStep.title).toBe('Command Palette');
    expect(commandPaletteStep.body).toContain('Cmd+K');
  });
});

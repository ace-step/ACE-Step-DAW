import { describe, expect, it } from 'vitest';
import { ONBOARDING_STARTERS, getStarterTemplate, instantiateDemoProject } from '../../src/data/onboardingCatalog';

describe('starter template catalog', () => {
  it('provides at least one template and one demo starter', () => {
    const templates = ONBOARDING_STARTERS.filter((s) => s.kind === 'template');
    const demos = ONBOARDING_STARTERS.filter((s) => s.kind === 'demo');
    expect(templates.length).toBeGreaterThanOrEqual(1);
    expect(demos.length).toBeGreaterThanOrEqual(1);
  });

  it('returns a ProjectTemplate for template starters', () => {
    const templateStarter = ONBOARDING_STARTERS.find((s) => s.kind === 'template');
    expect(templateStarter).toBeDefined();
    const template = getStarterTemplate(templateStarter!.id);
    expect(template).toBeDefined();
    expect(template!.name).toBe(templateStarter!.title);
    expect(template!.bpm).toBe(templateStarter!.bpm);
  });

  it('instantiates a demo project with tracks and clips', () => {
    const demoStarter = ONBOARDING_STARTERS.find((s) => s.kind === 'demo');
    expect(demoStarter).toBeDefined();
    const project = instantiateDemoProject(demoStarter!.id);
    expect(project.name).toBe(demoStarter!.title);
    expect(project.tracks.length).toBeGreaterThan(0);
  });
});

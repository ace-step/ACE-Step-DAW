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
    expect(templateStarter).not.toBeUndefined();
    const template = getStarterTemplate(templateStarter!.id);
    expect(template).not.toBeUndefined();
    expect(template!.name).toBe(templateStarter!.title);
    expect(template!.bpm).toBe(templateStarter!.bpm);
  });

  it('has at least 8 starters (5+ templates + 2+ demos) for genre coverage', () => {
    expect(ONBOARDING_STARTERS.length).toBeGreaterThanOrEqual(8);
    const templates = ONBOARDING_STARTERS.filter((s) => s.kind === 'template');
    expect(templates.length).toBeGreaterThanOrEqual(5);
  });

  it('every template starter has a matching ProjectTemplate', () => {
    const templates = ONBOARDING_STARTERS.filter((s) => s.kind === 'template');
    for (const starter of templates) {
      const tmpl = getStarterTemplate(starter.id);
      expect(tmpl, `Missing template for ${starter.id}`).not.toBeUndefined();
      expect(tmpl!.bpm).toBe(starter.bpm);
      expect(tmpl!.tracks.length).toBeGreaterThan(0);
    }
  });

  it('instantiates a demo project with tracks and clips', () => {
    const demoStarter = ONBOARDING_STARTERS.find((s) => s.kind === 'demo');
    expect(demoStarter).not.toBeUndefined();
    const project = instantiateDemoProject(demoStarter!.id);
    expect(project.name).toBe(demoStarter!.title);
    expect(project.tracks.length).toBeGreaterThan(0);
  });
});

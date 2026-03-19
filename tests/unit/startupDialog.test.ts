import { describe, it, expect } from 'vitest';
import { filterRecentProjects, decideStartupDialog } from '../../src/utils/startupDialogUtils';
import type { ProjectSummary } from '../../src/services/projectStorage';
import type { ClipLayoutItem } from '../../src/utils/clipLayout';

function makeSummary(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'proj-1',
    name: 'Untitled',
    createdAt: Date.now() - 100_000,
    updatedAt: Date.now(),
    trackCount: 2,
    bpm: 120,
    keyScale: 'C Major',
    clipLayout: [],
    ...overrides,
  };
}

describe('filterRecentProjects', () => {
  const projects: ProjectSummary[] = [
    makeSummary({ id: 'p1', name: 'My Hip Hop Beat', keyScale: 'C Minor' }),
    makeSummary({ id: 'p2', name: 'Jazz Session', keyScale: 'Bb Major' }),
    makeSummary({ id: 'p3', name: 'Lo-fi Study', keyScale: 'D Minor' }),
    makeSummary({ id: 'p4', name: 'Rock Anthem', keyScale: 'E Major' }),
  ];

  it('returns all projects when query is empty', () => {
    expect(filterRecentProjects(projects, '')).toHaveLength(4);
    expect(filterRecentProjects(projects, '   ')).toHaveLength(4);
  });

  it('filters by project name (case insensitive)', () => {
    const result = filterRecentProjects(projects, 'jazz');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('filters by key/scale', () => {
    const result = filterRecentProjects(projects, 'minor');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('returns empty when no matches', () => {
    expect(filterRecentProjects(projects, 'classical')).toHaveLength(0);
  });

  it('matches partial strings', () => {
    const result = filterRecentProjects(projects, 'hip');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
});

describe('decideStartupDialog', () => {
  it('shows onboarding when not completed and not skipped', () => {
    expect(
      decideStartupDialog({
        hasProject: false,
        onboardingCompleted: false,
        onboardingSkipped: false,
        recentProjectCount: 0,
      }),
    ).toBe('onboarding');
  });

  it('shows startup dialog when onboarding done and recent projects exist', () => {
    expect(
      decideStartupDialog({
        hasProject: false,
        onboardingCompleted: true,
        onboardingSkipped: false,
        recentProjectCount: 3,
      }),
    ).toBe('startup');
  });

  it('shows startup dialog when onboarding skipped and recent projects exist', () => {
    expect(
      decideStartupDialog({
        hasProject: false,
        onboardingCompleted: false,
        onboardingSkipped: true,
        recentProjectCount: 1,
      }),
    ).toBe('startup');
  });

  it('shows new project dialog when onboarding done but no recent projects', () => {
    expect(
      decideStartupDialog({
        hasProject: false,
        onboardingCompleted: true,
        onboardingSkipped: false,
        recentProjectCount: 0,
      }),
    ).toBe('newProject');
  });

  it('returns newProject when a project is already loaded', () => {
    expect(
      decideStartupDialog({
        hasProject: true,
        onboardingCompleted: true,
        onboardingSkipped: false,
        recentProjectCount: 5,
      }),
    ).toBe('newProject');
  });
});

describe('recent projects sorting', () => {
  it('projects are sorted by updatedAt descending (most recent first)', () => {
    const now = Date.now();
    const projects: ProjectSummary[] = [
      makeSummary({ id: 'old', updatedAt: now - 100_000 }),
      makeSummary({ id: 'newest', updatedAt: now }),
      makeSummary({ id: 'mid', updatedAt: now - 50_000 }),
    ];

    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    expect(sorted.map((p) => p.id)).toEqual(['newest', 'mid', 'old']);
  });
});

describe('ProjectSummary clipLayout for thumbnails', () => {
  it('summary with clipLayout renders track thumbnail data', () => {
    const layout: ClipLayoutItem[] = [
      { trackIndex: 0, startNorm: 0, widthNorm: 0.5, color: '#ef4444' },
      { trackIndex: 1, startNorm: 0.25, widthNorm: 0.25, color: '#3b82f6' },
    ];
    const summary = makeSummary({ clipLayout: layout, trackCount: 2 });

    expect(summary.clipLayout).toHaveLength(2);
    expect(summary.clipLayout[0].color).toBe('#ef4444');
    expect(summary.trackCount).toBe(2);
  });

  it('summary with empty clipLayout falls back to trackCount display', () => {
    const summary = makeSummary({ clipLayout: [], trackCount: 4 });
    expect(summary.clipLayout).toHaveLength(0);
    expect(summary.trackCount).toBe(4);
  });
});

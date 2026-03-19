import type { ProjectSummary } from '../services/projectStorage';

/**
 * Filter recent projects by a search query.
 * Matches project name and keyScale (case-insensitive).
 */
export function filterRecentProjects(
  projects: ProjectSummary[],
  query: string,
): ProjectSummary[] {
  if (!query.trim()) return projects;
  const lower = query.toLowerCase();
  return projects.filter(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      p.keyScale.toLowerCase().includes(lower),
  );
}

export type StartupDialogDecision = 'onboarding' | 'startup' | 'newProject';

/**
 * Decide which dialog to show on startup based on app state.
 */
export function decideStartupDialog(opts: {
  hasProject: boolean;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  recentProjectCount: number;
}): StartupDialogDecision {
  if (opts.hasProject) return 'newProject';
  if (!opts.onboardingCompleted && !opts.onboardingSkipped) return 'onboarding';
  if (opts.recentProjectCount > 0) return 'startup';
  return 'newProject';
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  markMilestone,
  dismissProgress,
  isDismissed,
  ONBOARDING_MILESTONES,
} from '../useOnboardingProgress';

const STORAGE_KEY = 'ace-step-onboarding-progress';
const DISMISSED_KEY = 'ace-step-onboarding-dismissed';

describe('useOnboardingProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has 10 milestones defined', () => {
    expect(ONBOARDING_MILESTONES).toHaveLength(10);
  });

  it('marks a milestone and persists to localStorage', () => {
    markMilestone('created_project');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toContain('created_project');
  });

  it('does not duplicate milestones', () => {
    markMilestone('created_project');
    markMilestone('created_project');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored.filter((m: string) => m === 'created_project')).toHaveLength(1);
  });

  it('tracks multiple milestones', () => {
    markMilestone('created_project');
    markMilestone('added_track');
    markMilestone('used_mixer');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(3);
  });

  it('dismisses progress tracker', () => {
    expect(isDismissed()).toBe(false);
    dismissProgress();
    expect(isDismissed()).toBe(true);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
  });
});

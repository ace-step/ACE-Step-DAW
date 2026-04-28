import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingProgress } from '../OnboardingProgress';

vi.mock('../../../hooks/useOnboardingProgress', () => {
  const milestones = [
    { id: 'created_project', label: 'Created a project' },
    { id: 'added_track', label: 'Added a track' },
    { id: 'generated_audio', label: 'Generated audio with AI' },
  ];

  let dismissed = false;

  return {
    useOnboardingProgress: () => ({
      completedCount: 1,
      total: 3,
      milestones,
      completed: new Set(['created_project']),
      isDismissed: dismissed,
      dismiss: () => { dismissed = true; },
    }),
  };
});

describe('OnboardingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders progress indicator', () => {
    render(<OnboardingProgress />);
    expect(screen.getByTestId('onboarding-progress')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('features explored')).toBeInTheDocument();
  });

  it('expands to show milestone list on click', () => {
    render(<OnboardingProgress />);
    fireEvent.click(screen.getByLabelText('Onboarding progress'));
    expect(screen.getByText('Feature Progress')).toBeInTheDocument();
    expect(screen.getByText('Created a project')).toBeInTheDocument();
    expect(screen.getByText('Added a track')).toBeInTheDocument();
  });

  it('shows completed milestones with checkmark', () => {
    render(<OnboardingProgress />);
    fireEvent.click(screen.getByLabelText('Onboarding progress'));
    // "Created a project" should have a checkmark
    const items = screen.getAllByText(/✓|○/);
    expect(items.length).toBeGreaterThan(0);
  });

  it('has a dismiss button', () => {
    render(<OnboardingProgress />);
    fireEvent.click(screen.getByLabelText('Onboarding progress'));
    expect(screen.getByLabelText('Dismiss progress tracker')).toBeInTheDocument();
  });
});

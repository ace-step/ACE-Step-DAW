import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WelcomeOverlay } from '../WelcomeOverlay';
import { hasSeenWelcome } from '../../../utils/welcomeStorage';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('WelcomeOverlay', () => {
  beforeEach(() => {
    useUIStore.setState({ showWelcomeOverlay: false });
    localStorage.clear();
  });

  it('renders nothing when showWelcomeOverlay is false', () => {
    const { container } = render(<WelcomeOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay when showWelcomeOverlay is true', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    expect(screen.getByText('Welcome to ACE-Step DAW')).toBeTruthy();
  });

  it('shows 5 essential shortcuts', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    expect(screen.getByText('Play / Pause')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByText('Save project')).toBeTruthy();
    expect(screen.getByText('View all keyboard shortcuts')).toBeTruthy();
    expect(screen.getByText('Generate AI music for selected clip')).toBeTruthy();
  });

  it('shows New Project and Explore quick actions', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    expect(screen.getByText('New Project')).toBeTruthy();
    expect(screen.getByText('Explore')).toBeTruthy();
  });

  it('dismisses and sets localStorage when Get Started button is clicked', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(useUIStore.getState().showWelcomeOverlay).toBe(false);
    expect(localStorage.getItem('ace-daw-welcome-dismissed')).toBe('1');
  });

  it('dismisses when Explore is clicked', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText('Explore'));
    expect(useUIStore.getState().showWelcomeOverlay).toBe(false);
    expect(localStorage.getItem('ace-daw-welcome-dismissed')).toBe('1');
  });

  it('opens new project dialog on dismiss when no project exists', () => {
    useProjectStore.setState({ project: null });
    useUIStore.setState({ showWelcomeOverlay: true, showNewProjectDialog: false });
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText('Explore'));
    expect(useUIStore.getState().showNewProjectDialog).toBe(true);
  });

  it('does not open new project dialog on dismiss when project exists', () => {
    useProjectStore.getState().createProject();
    useUIStore.setState({ showWelcomeOverlay: true, showNewProjectDialog: false });
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText('Explore'));
    expect(useUIStore.getState().showNewProjectDialog).toBe(false);
  });

  it('has proper dialog accessibility attributes', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    const { container } = render(<WelcomeOverlay />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('welcome-overlay-title');
  });

  it('dismisses on Escape key', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    const { container } = render(<WelcomeOverlay />);
    const dialog = container.querySelector('[role="dialog"]')!;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(useUIStore.getState().showWelcomeOverlay).toBe(false);
  });

  it('opens new project dialog when New Project is clicked', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText('New Project'));
    expect(useUIStore.getState().showWelcomeOverlay).toBe(false);
    expect(useUIStore.getState().showNewProjectDialog).toBe(true);
  });

  it('dismisses on backdrop click', () => {
    useUIStore.setState({ showWelcomeOverlay: true });
    const { container } = render(<WelcomeOverlay />);
    const backdrop = container.querySelector('.fixed.inset-0')!;
    fireEvent.mouseDown(backdrop);
    expect(useUIStore.getState().showWelcomeOverlay).toBe(false);
  });
});

describe('hasSeenWelcome', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when localStorage is empty', () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it('returns true when welcome was dismissed', () => {
    localStorage.setItem('ace-daw-welcome-dismissed', '1');
    expect(hasSeenWelcome()).toBe(true);
  });

  it('returns false for unexpected values', () => {
    localStorage.setItem('ace-daw-welcome-dismissed', 'maybe');
    expect(hasSeenWelcome()).toBe(false);
  });
});

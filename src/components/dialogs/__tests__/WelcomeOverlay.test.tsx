import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeOverlay } from '../WelcomeOverlay';

const STORAGE_KEY = 'ace-step-welcome-seen';

// Mock stores
vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) => {
    const state = {
      createProject: vi.fn(),
      setProject: vi.fn(),
      createProjectFromTemplate: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../../store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      setShowGenerationPanel: vi.fn(),
      setShowNewProjectDialog: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../../store/generationStore', () => ({
  useGenerationStore: vi.fn((selector) => {
    const state = {
      hydrateGenerationForm: vi.fn(),
      resetGenerationForm: vi.fn(),
    };
    return selector(state);
  }),
}));

describe('WelcomeOverlay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders when localStorage key is not set', () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText(/Welcome to ACE-Step/i)).toBeInTheDocument();
  });

  it('does not render when localStorage key is set', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    render(<WelcomeOverlay />);
    expect(screen.queryByText(/Welcome to ACE-Step/i)).not.toBeInTheDocument();
  });

  it('hides on backdrop click', () => {
    render(<WelcomeOverlay />);
    const backdrop = screen.getByTestId('welcome-backdrop');
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByText(/Welcome to ACE-Step/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('hides on Escape key', () => {
    render(<WelcomeOverlay />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Welcome to ACE-Step/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('displays the z-index from the onboarding layer', () => {
    render(<WelcomeOverlay />);
    const backdrop = screen.getByTestId('welcome-backdrop');
    expect(backdrop.style.zIndex).toBe('240');
  });

  it('has correct ARIA dialog attributes', () => {
    render(<WelcomeOverlay />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'welcome-title');
  });

  // === New tests for 3-path onboarding ===

  it('shows three onboarding path options', () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText(/Generate a Song/i)).toBeInTheDocument();
    expect(screen.getByText(/Start from Template/i)).toBeInTheDocument();
    expect(screen.getByText(/Blank Project/i)).toBeInTheDocument();
  });

  it('shows AI-first messaging about text-to-music', () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText(/describe.*music.*generate/i)).toBeInTheDocument();
  });

  it('shows starter templates when "Start from Template" is clicked', () => {
    render(<WelcomeOverlay />);
    const templateBtn = screen.getByText(/Start from Template/i);
    fireEvent.click(templateBtn);
    // Should show template cards
    expect(screen.getByText(/Electronic Pulse/i)).toBeInTheDocument();
    expect(screen.getByText(/Late Night Hip Hop/i)).toBeInTheDocument();
    expect(screen.getByText(/Songwriter Session/i)).toBeInTheDocument();
  });

  it('shows demo projects in template view', () => {
    render(<WelcomeOverlay />);
    const templateBtn = screen.getByText(/Start from Template/i);
    fireEvent.click(templateBtn);
    expect(screen.getByText(/Neon Run Demo/i)).toBeInTheDocument();
    expect(screen.getByText(/Lofi Sketch Demo/i)).toBeInTheDocument();
  });

  it('dismisses and creates blank project on "Blank Project" click', () => {
    render(<WelcomeOverlay />);
    const blankBtn = screen.getByText(/Blank Project/i);
    fireEvent.click(blankBtn);
    expect(screen.queryByText(/Welcome to ACE-Step/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('shows essential keyboard shortcuts section', () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText(/Play \/ Pause/i)).toBeInTheDocument();
  });

  it('shows back button in template view to return to main menu', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Start from Template/i));
    const backBtn = screen.getByLabelText(/back/i);
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    // Should be back at main menu
    expect(screen.getByText(/Generate a Song/i)).toBeInTheDocument();
    expect(screen.getByText(/Start from Template/i)).toBeInTheDocument();
  });

  // === Genre selection flow ===

  it('shows genre picker when "Generate a Song" is clicked', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Generate a Song/i));
    expect(screen.getByText(/Pick a Genre/i)).toBeInTheDocument();
    expect(screen.getByText('Pop')).toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
    expect(screen.getByText('Jazz')).toBeInTheDocument();
    expect(screen.getByText('Electronic')).toBeInTheDocument();
    expect(screen.getByText('Hip-Hop')).toBeInTheDocument();
    expect(screen.getByText('Lo-Fi')).toBeInTheDocument();
    expect(screen.getByText('Ambient')).toBeInTheDocument();
  });

  it('shows BPM and key for each genre', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Generate a Song/i));
    // Pop preset is 120 BPM, C major
    expect(screen.getByText(/120 BPM/)).toBeInTheDocument();
  });

  it('dismisses on genre selection', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Generate a Song/i));
    fireEvent.click(screen.getByText('Pop'));
    expect(screen.queryByText(/Pick a Genre/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('has skip option in genre view to write custom prompt', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Generate a Song/i));
    const skipBtn = screen.getByText(/skip.*write my own/i);
    expect(skipBtn).toBeInTheDocument();
    fireEvent.click(skipBtn);
    expect(screen.queryByText(/Pick a Genre/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('navigates back from genre view to main menu', () => {
    render(<WelcomeOverlay />);
    fireEvent.click(screen.getByText(/Generate a Song/i));
    expect(screen.getByText(/Pick a Genre/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/back/i));
    expect(screen.getByText(/Generate a Song/i)).toBeInTheDocument();
  });
});

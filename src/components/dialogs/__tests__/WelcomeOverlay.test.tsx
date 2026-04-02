import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeOverlay } from '../WelcomeOverlay';

const STORAGE_KEY = 'ace-step-welcome-seen';

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

  it('shows essential keyboard shortcuts', () => {
    render(<WelcomeOverlay />);
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText(/Play \/ Pause/i)).toBeInTheDocument();
  });

  it('hides and sets localStorage on "Get Started" click', () => {
    render(<WelcomeOverlay />);
    const button = screen.getByRole('button', { name: /get started/i });
    fireEvent.click(button);
    expect(screen.queryByText(/Welcome to ACE-Step/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('hides on backdrop click', () => {
    render(<WelcomeOverlay />);
    // The backdrop is the outer fixed div
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
});

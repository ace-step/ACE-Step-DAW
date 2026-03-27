import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AudioContextOverlay } from '../AudioContextOverlay';

// Mock Tone.js
vi.mock('tone', () => ({
  start: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn().mockReturnValue({
    rawContext: {
      state: 'suspended',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

import * as Tone from 'tone';

describe('AudioContextOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to suspended state
    const ctx = (Tone.getContext as ReturnType<typeof vi.fn>).mockReturnValue({
      rawContext: {
        state: 'suspended',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        resume: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders overlay when audio context is suspended', () => {
    render(<AudioContextOverlay />);
    expect(screen.getByRole('button', { name: /enable audio/i })).toBeDefined();
    expect(screen.getByText(/click anywhere to enable audio/i)).toBeDefined();
  });

  it('does not render overlay when audio context is running', () => {
    (Tone.getContext as ReturnType<typeof vi.fn>).mockReturnValue({
      rawContext: {
        state: 'running',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        resume: vi.fn().mockResolvedValue(undefined),
      },
    });
    render(<AudioContextOverlay />);
    expect(screen.queryByRole('button', { name: /enable audio/i })).toBeNull();
  });

  it('calls Tone.start() when overlay is clicked', async () => {
    render(<AudioContextOverlay />);
    const overlay = screen.getByRole('button', { name: /enable audio/i });
    await act(async () => {
      fireEvent.click(overlay);
    });
    expect(Tone.start).toHaveBeenCalledTimes(1);
  });

  it('hides overlay after successful resume', async () => {
    render(<AudioContextOverlay />);
    const overlay = screen.getByRole('button', { name: /enable audio/i });
    await act(async () => {
      fireEvent.click(overlay);
    });
    expect(screen.queryByRole('button', { name: /enable audio/i })).toBeNull();
  });

  it('renders with correct accessibility attributes', () => {
    render(<AudioContextOverlay />);
    const overlay = screen.getByRole('button', { name: /enable audio/i });
    expect(overlay.getAttribute('aria-label')).toBe('Enable audio');
  });

  it('handles keyboard activation (Enter key)', async () => {
    render(<AudioContextOverlay />);
    const overlay = screen.getByRole('button', { name: /enable audio/i });
    await act(async () => {
      fireEvent.keyDown(overlay, { key: 'Enter' });
    });
    expect(Tone.start).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard activation (Space key)', async () => {
    render(<AudioContextOverlay />);
    const overlay = screen.getByRole('button', { name: /enable audio/i });
    await act(async () => {
      fireEvent.keyDown(overlay, { key: ' ' });
    });
    expect(Tone.start).toHaveBeenCalledTimes(1);
  });
});

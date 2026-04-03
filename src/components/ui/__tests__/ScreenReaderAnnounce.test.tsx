import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScreenReaderAnnounce } from '../ScreenReaderAnnounce';

describe('ScreenReaderAnnounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with sr-only class for visual hiding', () => {
    render(<ScreenReaderAnnounce message="test" />);
    const el = screen.getByTestId('sr-announce');
    expect(el.className).toContain('sr-only');
  });

  it('has aria-live="polite" by default', () => {
    render(<ScreenReaderAnnounce message="test" />);
    const el = screen.getByTestId('sr-announce');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('supports assertive politeness with role="alert"', () => {
    render(<ScreenReaderAnnounce message="urgent" politeness="assertive" />);
    const el = screen.getByTestId('sr-announce');
    expect(el.getAttribute('aria-live')).toBe('assertive');
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('has role="status" for polite announcements', () => {
    render(<ScreenReaderAnnounce message="test" />);
    const el = screen.getByTestId('sr-announce');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('has aria-atomic="true"', () => {
    render(<ScreenReaderAnnounce message="test" />);
    const el = screen.getByTestId('sr-announce');
    expect(el.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces message after delay', () => {
    render(<ScreenReaderAnnounce message="Playback started" />);
    const el = screen.getByTestId('sr-announce');

    // Initially cleared
    expect(el.textContent).toBe('');

    // After delay, message appears
    act(() => vi.advanceTimersByTime(100));
    expect(el.textContent).toBe('Playback started');

    // After 1 second, message is cleared
    act(() => vi.advanceTimersByTime(1000));
    expect(el.textContent).toBe('');
  });
});

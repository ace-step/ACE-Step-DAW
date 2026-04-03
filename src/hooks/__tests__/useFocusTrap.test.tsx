import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from '../useFocusTrap';

function TestDialog({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);

  return (
    <div ref={ref} data-testid="dialog">
      <button data-testid="first-btn">First</button>
      <input data-testid="input" />
      <button data-testid="last-btn">Last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('wraps focus from last to first on Tab', async () => {
    render(<TestDialog active />);

    // Wait for requestAnimationFrame
    vi.advanceTimersByTime(16);

    const lastBtn = screen.getByTestId('last-btn');
    lastBtn.focus();

    fireEvent.keyDown(lastBtn, { key: 'Tab' });

    // Focus should wrap to first button
    expect(document.activeElement).toBe(screen.getByTestId('first-btn'));
  });

  it('wraps focus from first to last on Shift+Tab', async () => {
    render(<TestDialog active />);

    vi.advanceTimersByTime(16);

    const firstBtn = screen.getByTestId('first-btn');
    firstBtn.focus();

    fireEvent.keyDown(firstBtn, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(screen.getByTestId('last-btn'));
  });

  it('does not trap focus when inactive', () => {
    render(<TestDialog active={false} />);

    vi.advanceTimersByTime(16);

    const lastBtn = screen.getByTestId('last-btn');
    lastBtn.focus();

    // Without trap, keydown should not be intercepted
    fireEvent.keyDown(lastBtn, { key: 'Tab' });

    // Focus should not change to first button (no trap active)
    // Since there's no trap, the default behavior would apply
    // In a test environment, focus stays on the element
    expect(document.activeElement).toBe(lastBtn);
  });

  it('focuses the first element when activated', () => {
    render(<TestDialog active />);

    vi.advanceTimersByTime(16);

    expect(document.activeElement).toBe(screen.getByTestId('first-btn'));
  });
});

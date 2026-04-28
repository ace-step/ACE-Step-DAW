import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from '../Toast';
import { useToastStore } from '../../../hooks/useToast';

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    useToastStore.getState().clearToasts();
  });

  it('renders nothing when no toasts exist', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a toast when showToast is called', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'success', message: 'Saved!' });
    });
    screen.getByText('Saved!'); // getBy* throws if not found
  });

  it('renders type label', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'error', message: 'Failed' });
    });
    screen.getByText('error'); // getBy* throws if not found
  });

  it('renders SVG icon per type', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'info', message: 'Note' });
    });
    const item = screen.getByTestId('toast-item');
    expect(item.querySelector('svg')).not.toBeNull();
  });

  it('renders a progress bar', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'success', message: 'Done', durationMs: 5000 });
    });
    const item = screen.getByTestId('toast-item');
    // Progress bar is the last child div
    const progressTrack = item.lastElementChild;
    expect(progressTrack?.querySelector('div')).not.toBeNull();
  });

  it('has aria-live="polite" on the container', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'info', message: 'Hey' });
    });
    const container = screen.getByTestId('toast-item').parentElement!;
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('dismiss button removes the toast', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'success', message: 'Done' });
    });
    const dismissBtn = screen.getByLabelText('Dismiss success notification');
    fireEvent.click(dismissBtn);

    // After exit animation (200ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Done')).toBeNull();
  });

  it('stacks multiple toasts', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast({ type: 'info', message: 'First' });
      useToastStore.getState().showToast({ type: 'success', message: 'Second' });
    });
    screen.getByText('First'); // getBy* throws if not found
    screen.getByText('Second');
    expect(screen.getAllByTestId('toast-item')).toHaveLength(2);
  });
});

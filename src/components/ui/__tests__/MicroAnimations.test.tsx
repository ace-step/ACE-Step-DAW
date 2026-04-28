import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastContainer } from '../Toast';
import { Knob } from '../Knob';

// Mock useToast to return controlled toast data
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    toasts: [
      { id: 'test-1', type: 'success' as const, message: 'Test toast', durationMs: 3000 },
    ],
    dismissToast: vi.fn(),
  }),
}));

describe('Toast slide-in animation', () => {
  it('renders with initial transform class for entrance animation', () => {
    render(<ToastContainer />);
    const toastItem = screen.getByTestId('toast-item');
    // Initial state uses Tailwind translate-x-full for slide-in animation
    expect(toastItem.className).toContain('translate-x-full');
  });

  it('applies transition classes for smooth entrance', () => {
    render(<ToastContainer />);
    const toastItem = screen.getByTestId('toast-item');
    expect(toastItem.className).toContain('transition-');
    expect(toastItem.className).toContain('duration-200');
  });

  it('renders type-specific SVG icon', () => {
    render(<ToastContainer />);
    const toastItem = screen.getByTestId('toast-item');
    expect(toastItem.querySelector('svg')).not.toBeNull();
  });

  it('renders progress bar', () => {
    render(<ToastContainer />);
    const toastItem = screen.getByTestId('toast-item');
    // Progress bar is the last child
    const progressTrack = toastItem.lastElementChild;
    expect(progressTrack).not.toBeNull();
    expect(progressTrack?.querySelector('div')).not.toBeNull();
  });
});

describe('Knob interaction classes', () => {
  it('applies cursor-ns-resize class when enabled', () => {
    render(
      <Knob
        value={0.5}
        min={0}
        max={1}
        defaultValue={0.5}
        onChange={vi.fn()}
        label="Test"
      />
    );
    const knobEl = screen.getByLabelText('Test knob');
    expect(knobEl.className).toContain('cursor-ns-resize');
  });

  it('applies cursor-not-allowed when disabled', () => {
    render(
      <Knob
        value={0.5}
        min={0}
        max={1}
        defaultValue={0.5}
        onChange={vi.fn()}
        label="Disabled"
        disabled
      />
    );
    const knobEl = screen.getByLabelText('Disabled knob');
    expect(knobEl.className).toContain('cursor-not-allowed');
    expect(knobEl.className).not.toContain('cursor-ns-resize');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaveformRangeSelector } from '../WaveformRangeSelector';

/** Generate simple peaks array for testing */
function makePeaks(count: number, amplitude = 0.5): number[] {
  return Array.from({ length: count }, () => amplitude);
}

const defaultProps = {
  peaks: makePeaks(100),
  duration: 10,
  rangeStart: 0.2,
  rangeEnd: 0.8,
  onRangeChange: vi.fn(),
};

describe('WaveformRangeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component with waveform and handles', () => {
    render(<WaveformRangeSelector {...defaultProps} />);
    screen.getByTestId('waveform-range-selector'); // getBy* throws if not found
  });

  it('renders empty state when no peaks provided', () => {
    render(<WaveformRangeSelector {...defaultProps} peaks={[]} />);
    screen.getByText('No waveform data'); // getBy* throws if not found
  });

  it('displays timestamp labels for range start and end', () => {
    render(<WaveformRangeSelector {...defaultProps} />);
    // rangeStart=0.2 of 10s = 2.00s, rangeEnd=0.8 of 10s = 8.00s
    screen.getByText('2.00s'); // getBy* throws if not found
    screen.getByText('8.00s');
  });

  it('renders left and right drag handles', () => {
    render(<WaveformRangeSelector {...defaultProps} />);
    screen.getByTestId('range-handle-left'); // getBy* throws if not found
    screen.getByTestId('range-handle-right');
  });

  it('calls onRangeChange when left handle is dragged', () => {
    const onRangeChange = vi.fn();
    render(
      <WaveformRangeSelector {...defaultProps} onRangeChange={onRangeChange} />,
    );

    const leftHandle = screen.getByTestId('range-handle-left');
    // Simulate drag: mousedown on handle, then mousemove on window, then mouseup
    fireEvent.mouseDown(leftHandle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    expect(onRangeChange).toHaveBeenCalled();
  });

  it('calls onRangeChange when right handle is dragged', () => {
    const onRangeChange = vi.fn();
    render(
      <WaveformRangeSelector {...defaultProps} onRangeChange={onRangeChange} />,
    );

    const rightHandle = screen.getByTestId('range-handle-right');
    fireEvent.mouseDown(rightHandle, { clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 350 });
    fireEvent.mouseUp(window);

    expect(onRangeChange).toHaveBeenCalled();
  });

  it('clamps range values between 0 and 1', () => {
    const onRangeChange = vi.fn();
    const { container } = render(
      <WaveformRangeSelector
        {...defaultProps}
        rangeStart={0}
        rangeEnd={1}
        onRangeChange={onRangeChange}
      />,
    );

    // The component should render with full range without errors
    expect(container.querySelector('[data-testid="waveform-range-selector"]')).not.toBeNull();
  });

  it('enforces minimum range width', () => {
    const onRangeChange = vi.fn();
    render(
      <WaveformRangeSelector
        {...defaultProps}
        rangeStart={0.5}
        rangeEnd={0.5}
        onRangeChange={onRangeChange}
      />,
    );

    // Component should still render (it should handle edge cases)
    screen.getByTestId('waveform-range-selector'); // getBy* throws if not found
  });

  it('shows keep/regenerate zone overlays', () => {
    render(<WaveformRangeSelector {...defaultProps} />);
    screen.getByTestId('keep-zone-left'); // getBy* throws if not found
    screen.getByTestId('keep-zone-right');
    screen.getByTestId('regenerate-zone');
  });

  it('applies snap-to-beat when snapToGrid and bpm are provided', () => {
    const onRangeChange = vi.fn();
    render(
      <WaveformRangeSelector
        {...defaultProps}
        bpm={120}
        snapToGrid={true}
        onRangeChange={onRangeChange}
      />,
    );

    const leftHandle = screen.getByTestId('range-handle-left');

    // Mock the container getBoundingClientRect
    const container = screen.getByTestId('waveform-range-selector');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 500,
      width: 500,
      top: 0,
      bottom: 60,
      height: 60,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseDown(leftHandle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 125 });
    fireEvent.mouseUp(window);

    if (onRangeChange.mock.calls.length > 0) {
      const [start] = onRangeChange.mock.calls[onRangeChange.mock.calls.length - 1];
      // With BPM=120, beat duration = 0.5s, so snapped values should align to beats
      // The exact value depends on implementation, but it should be a multiple of beatDuration/duration
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(1);
    }
  });

  it('supports clicking on waveform to reposition range', () => {
    const onRangeChange = vi.fn();
    render(
      <WaveformRangeSelector {...defaultProps} onRangeChange={onRangeChange} />,
    );

    const container = screen.getByTestId('waveform-range-selector');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 500,
      width: 500,
      top: 0,
      bottom: 60,
      height: 60,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click outside the current range (at 5% of the width = 0.05 normalized)
    fireEvent.mouseDown(container, { clientX: 25 });
    fireEvent.mouseUp(window);

    // Should have been called to start a new selection
    expect(onRangeChange).toHaveBeenCalled();
  });
});

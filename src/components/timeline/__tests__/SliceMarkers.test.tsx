import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SliceMarkers } from '../SliceMarkers';

describe('SliceMarkers', () => {
  const defaultProps = {
    clipId: 'clip-1',
    width: 400,
    clipDuration: 4,
    slicePoints: [1.0, 2.0, 3.0],
    onAddSlice: vi.fn(),
    onRemoveSlice: vi.fn(),
  };

  it('renders a marker for each slice point', () => {
    render(<SliceMarkers {...defaultProps} />);
    expect(screen.getByTestId('slice-marker-0')).toBeInTheDocument();
    expect(screen.getByTestId('slice-marker-1')).toBeInTheDocument();
    expect(screen.getByTestId('slice-marker-2')).toBeInTheDocument();
  });

  it('positions markers proportionally within the clip width', () => {
    render(<SliceMarkers {...defaultProps} />);
    const marker0 = screen.getByTestId('slice-marker-0');
    // 1.0s / 4.0s = 0.25 of 400px = 100px, minus 1 for centering = 99px
    expect(marker0.style.left).toBe('99px');
  });

  it('calls onRemoveSlice when a marker is clicked', () => {
    const onRemoveSlice = vi.fn();
    render(<SliceMarkers {...defaultProps} onRemoveSlice={onRemoveSlice} />);
    fireEvent.click(screen.getByTestId('slice-marker-1'));
    expect(onRemoveSlice).toHaveBeenCalledWith(1);
  });

  it('calls onAddSlice when background is clicked', () => {
    const onAddSlice = vi.fn();
    render(<SliceMarkers {...defaultProps} slicePoints={[]} onAddSlice={onAddSlice} />);
    const container = screen.getByTestId('slice-markers-clip-1');
    // Simulate clicking at x=200 of 400px wide = 2.0s of 4.0s
    const rect = { left: 0, top: 0, width: 400, height: 60 };
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => rect,
    });
    fireEvent.click(container, { clientX: 200, clientY: 30 });
    expect(onAddSlice).toHaveBeenCalledWith(2.0);
  });

  it('does not call onAddSlice when a marker is clicked', () => {
    const onAddSlice = vi.fn();
    render(<SliceMarkers {...defaultProps} onAddSlice={onAddSlice} />);
    fireEvent.click(screen.getByTestId('slice-marker-0'));
    expect(onAddSlice).not.toHaveBeenCalled();
  });

  it('renders nothing when width is 0', () => {
    const { container } = render(<SliceMarkers {...defaultProps} width={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when clipDuration is 0', () => {
    const { container } = render(<SliceMarkers {...defaultProps} clipDuration={0} />);
    expect(container.innerHTML).toBe('');
  });
});

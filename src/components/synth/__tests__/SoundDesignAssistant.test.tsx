import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundDesignAssistant } from '../SoundDesignAssistant';

describe('SoundDesignAssistant', () => {
  const defaultProps = {
    trackId: 'track-1',
    onApplyAdjustments: vi.fn(),
    disabled: false,
  };

  it('renders toggle button when collapsed', () => {
    render(<SoundDesignAssistant {...defaultProps} />);
    expect(screen.getByTestId('sound-design-toggle')).toBeInTheDocument();
    expect(screen.getByText('Sound Design Assistant')).toBeInTheDocument();
  });

  it('opens panel when toggle is clicked', () => {
    render(<SoundDesignAssistant {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    expect(screen.getByTestId('sound-design-panel')).toBeInTheDocument();
    expect(screen.getByTestId('sound-design-input')).toBeInTheDocument();
  });

  it('shows quick descriptor buttons', () => {
    render(<SoundDesignAssistant {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    expect(screen.getByTestId('quick-warmer')).toBeInTheDocument();
    expect(screen.getByTestId('quick-brighter')).toBeInTheDocument();
    expect(screen.getByTestId('quick-fatter')).toBeInTheDocument();
  });

  it('shows preview changes when typing a descriptor', () => {
    render(<SoundDesignAssistant {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    const input = screen.getByTestId('sound-design-input');
    fireEvent.change(input, { target: { value: 'warmer' } });
    expect(screen.getByText('Preview Changes')).toBeInTheDocument();
  });

  it('applies adjustments when Apply button is clicked', () => {
    const onApply = vi.fn();
    render(<SoundDesignAssistant {...defaultProps} onApplyAdjustments={onApply} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    const input = screen.getByTestId('sound-design-input');
    fireEvent.change(input, { target: { value: 'brighter' } });
    fireEvent.click(screen.getByTestId('sound-design-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('applies adjustments on Enter key', () => {
    const onApply = vi.fn();
    render(<SoundDesignAssistant {...defaultProps} onApplyAdjustments={onApply} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    const input = screen.getByTestId('sound-design-input');
    fireEvent.change(input, { target: { value: 'warmer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('quick descriptor auto-applies and adds to history', () => {
    const onApply = vi.fn();
    render(<SoundDesignAssistant {...defaultProps} onApplyAdjustments={onApply} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    fireEvent.click(screen.getByTestId('quick-warmer'));
    expect(onApply).toHaveBeenCalledTimes(1);
    // History should appear
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<SoundDesignAssistant {...defaultProps} disabled={true} />);
    expect(screen.getByTestId('sound-design-toggle')).toBeDisabled();
  });

  it('Apply button is disabled when no valid descriptor is entered', () => {
    render(<SoundDesignAssistant {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sound-design-toggle'));
    const applyBtn = screen.getByTestId('sound-design-apply');
    expect(applyBtn).toBeDisabled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimbreReferenceSelector } from '../TimbreReferenceSelector';
import { createTimbreReference } from '../../../services/timbreTransfer';

describe('TimbreReferenceSelector', () => {
  const defaultProps = {
    timbreRef: null,
    onTimbreRefChange: vi.fn(),
    disabled: false,
  };

  it('renders drop zone when no reference is set', () => {
    render(<TimbreReferenceSelector {...defaultProps} />);
    expect(screen.getByTestId('timbre-drop-zone')).toBeInTheDocument();
    expect(screen.getByText(/Drop audio or clip here/)).toBeInTheDocument();
  });

  it('renders active reference display when reference is set', () => {
    const ref = createTimbreReference({
      sourceType: 'clip',
      audioKey: 'audio-123',
      name: 'My Bass',
      strength: 0.7,
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} />);
    expect(screen.getByTestId('timbre-ref-active')).toBeInTheDocument();
    expect(screen.getByText('My Bass')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('shows strength slider with correct value', () => {
    const ref = createTimbreReference({
      sourceType: 'upload',
      audioKey: 'upload-1',
      name: 'Reference',
      strength: 0.6,
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} />);
    const slider = screen.getByTestId('timbre-strength-slider') as HTMLInputElement;
    expect(parseFloat(slider.value)).toBeCloseTo(0.6);
  });

  it('calls onTimbreRefChange when strength is adjusted', () => {
    const onTimbreRefChange = vi.fn();
    const ref = createTimbreReference({
      sourceType: 'clip',
      audioKey: 'audio-1',
      name: 'Test',
      strength: 0.5,
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} onTimbreRefChange={onTimbreRefChange} />);
    const slider = screen.getByTestId('timbre-strength-slider');
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(onTimbreRefChange).toHaveBeenCalledTimes(1);
    expect(onTimbreRefChange.mock.calls[0][0].strength).toBeCloseTo(0.8);
  });

  it('shows Clear button when reference is active', () => {
    const ref = createTimbreReference({
      sourceType: 'clip',
      audioKey: 'audio-1',
      name: 'Test',
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('clears reference when Clear is clicked', () => {
    const onTimbreRefChange = vi.fn();
    const ref = createTimbreReference({
      sourceType: 'clip',
      audioKey: 'audio-1',
      name: 'Test',
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} onTimbreRefChange={onTimbreRefChange} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(onTimbreRefChange).toHaveBeenCalledWith(null);
  });

  it('shows source type indicator', () => {
    const ref = createTimbreReference({
      sourceType: 'clip',
      audioKey: 'audio-1',
      name: 'From Timeline',
    });
    render(<TimbreReferenceSelector {...defaultProps} timbreRef={ref} />);
    expect(screen.getByText('from clip')).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<TimbreReferenceSelector {...defaultProps} />);
    expect(screen.getByText('Timbre Reference')).toBeInTheDocument();
  });
});

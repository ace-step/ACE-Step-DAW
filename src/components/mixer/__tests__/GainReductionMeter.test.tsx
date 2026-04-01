import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GainReductionMeter } from '../GainReductionMeter';

describe('GainReductionMeter', () => {
  it('renders canvas element', () => {
    render(<GainReductionMeter reductionDb={6} />);
    expect(screen.getByTestId('gr-meter')).toBeInTheDocument();
  });

  it('displays GR label', () => {
    render(<GainReductionMeter reductionDb={6} />);
    expect(screen.getByText(/GR/)).toBeInTheDocument();
  });

  it('shows 0.0dB when no reduction', () => {
    render(<GainReductionMeter reductionDb={0} />);
    expect(screen.getByText(/0\.0dB/)).toBeInTheDocument();
  });

  it('renders with custom dimensions', () => {
    render(<GainReductionMeter reductionDb={3} width={200} height={12} />);
    const canvas = screen.getByTestId('gr-meter');
    expect(canvas).toHaveStyle({ width: '200px', height: '12px' });
  });

  it('renders vertical orientation', () => {
    render(<GainReductionMeter reductionDb={3} direction="vertical" width={80} height={6} />);
    const canvas = screen.getByTestId('gr-meter');
    // In vertical mode, canvas dimensions are swapped
    expect(canvas).toHaveStyle({ width: '6px', height: '80px' });
  });
});

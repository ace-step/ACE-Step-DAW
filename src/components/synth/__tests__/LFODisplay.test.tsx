import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LFODisplay } from '../LFODisplay';

describe('LFODisplay', () => {
  const defaultLfo = { rate: 1, depth: 0.5, shape: 'sine' as const };

  it('renders LFO label', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    expect(screen.getByText('LFO')).toBeDefined();
  });

  it('renders a canvas element for the waveform', () => {
    const { container } = render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders rate and depth knobs', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Rate knob')).toBeDefined();
    expect(screen.getByLabelText('Depth knob')).toBeDefined();
  });

  it('renders shape selector buttons', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /SIN/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /SQR/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /TRI/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /SAW/i })).toBeDefined();
  });
});

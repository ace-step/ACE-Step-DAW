import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LFODisplay } from '../LFODisplay';

describe('LFODisplay', () => {
  const defaultLfo = { rate: 1, depth: 0.5, shape: 'sine' as const };

  it('renders LFO label', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    screen.getByText('LFO'); // getBy* throws if not found
  });

  it('renders a canvas element for the waveform', () => {
    const { container } = render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders rate and depth knobs', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    screen.getByLabelText('Rate knob'); // getBy* throws if not found
    screen.getByLabelText('Depth knob');
  });

  it('renders shape selector buttons', () => {
    render(<LFODisplay lfo={defaultLfo} onChange={vi.fn()} />);
    screen.getByRole('button', { name: /SIN/i }); // getBy* throws if not found
    screen.getByRole('button', { name: /SQR/i });
    screen.getByRole('button', { name: /TRI/i });
    screen.getByRole('button', { name: /SAW/i });
  });
});

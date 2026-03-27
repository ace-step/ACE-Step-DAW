import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynthFilterControls } from '../SynthFilterControls';

describe('SynthFilterControls', () => {
  const defaultFilter = { type: 'lowpass' as const, frequency: 1000, Q: 1 };

  it('renders Filter label', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    expect(screen.getByText('Filter')).toBeInTheDocument();
  });

  it('renders a canvas element for frequency response', () => {
    const { container } = render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders filter type selector buttons', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /LP/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HP/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /BP/i })).toBeInTheDocument();
  });

  it('renders frequency and resonance knobs', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Freq knob')).toBeInTheDocument();
    expect(screen.getByLabelText('Res knob')).toBeInTheDocument();
  });

  it('highlights the active filter type', () => {
    render(<SynthFilterControls filter={{ ...defaultFilter, type: 'highpass' }} onChange={vi.fn()} />);
    const hpButton = screen.getByRole('button', { name: /HP/i });
    expect(hpButton.className).toContain('bg-');
  });
});

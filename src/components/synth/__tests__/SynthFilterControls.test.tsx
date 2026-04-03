import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynthFilterControls } from '../SynthFilterControls';

describe('SynthFilterControls', () => {
  const defaultFilter = { type: 'lowpass' as const, frequency: 1000, Q: 1 };

  it('renders Filter label', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    screen.getByText('Filter'); // getBy* throws if not found
  });

  it('renders a canvas element for frequency response', () => {
    const { container } = render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders filter type selector buttons', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    screen.getByRole('button', { name: /LP/i }); // getBy* throws if not found
    screen.getByRole('button', { name: /HP/i });
    screen.getByRole('button', { name: /BP/i });
  });

  it('renders frequency and resonance knobs', () => {
    render(<SynthFilterControls filter={defaultFilter} onChange={vi.fn()} />);
    screen.getByLabelText('Freq knob'); // getBy* throws if not found
    screen.getByLabelText('Res knob');
  });

  it('highlights the active filter type', () => {
    render(<SynthFilterControls filter={{ ...defaultFilter, type: 'highpass' }} onChange={vi.fn()} />);
    const hpButton = screen.getByRole('button', { name: /HP/i });
    expect(hpButton.className).toContain('bg-');
  });
});

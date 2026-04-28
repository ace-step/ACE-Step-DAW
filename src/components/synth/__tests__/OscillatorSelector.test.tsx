import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OscillatorSelector } from '../OscillatorSelector';

describe('OscillatorSelector', () => {
  const waveforms = ['sine', 'triangle', 'sawtooth', 'square'] as const;

  it('renders all four waveform buttons', () => {
    render(<OscillatorSelector waveform="sine" onChange={vi.fn()} />);
    for (const wf of waveforms) {
      expect(screen.getByRole('button', { name: new RegExp(wf, 'i') })).toBeDefined();
    }
  });

  it('highlights the active waveform', () => {
    render(<OscillatorSelector waveform="sawtooth" onChange={vi.fn()} />);
    const activeBtn = screen.getByRole('button', { name: /sawtooth/i });
    expect(activeBtn.getAttribute('aria-pressed')).toBe('true');

    const inactiveBtn = screen.getByRole('button', { name: /sine/i });
    expect(inactiveBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange with selected waveform on click', () => {
    const onChange = vi.fn();
    render(<OscillatorSelector waveform="sine" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /square/i }));
    expect(onChange).toHaveBeenCalledWith('square');
  });

  it('does not call onChange when clicking the already-active waveform', () => {
    const onChange = vi.fn();
    render(<OscillatorSelector waveform="sine" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /sine/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders SVG waveform icons for each button', () => {
    const { container } = render(<OscillatorSelector waveform="sine" onChange={vi.fn()} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4);
  });

  it('renders section label', () => {
    render(<OscillatorSelector waveform="sine" onChange={vi.fn()} />);
    screen.getByText('Oscillator');
  });
});

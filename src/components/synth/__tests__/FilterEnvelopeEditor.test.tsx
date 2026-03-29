import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterEnvelopeEditor } from '../FilterEnvelopeEditor';
import type { FilterEnvelope } from '../../../types/project';

const DEFAULT_ENVELOPE: FilterEnvelope = {
  attack: 0.01,
  decay: 0.3,
  sustain: 0.5,
  release: 0.8,
  baseFrequency: 200,
  octaves: 4,
};

describe('FilterEnvelopeEditor', () => {
  it('renders all six knobs (ATK, DEC, SUS, REL, FREQ, OCT)', () => {
    const onChange = vi.fn();
    render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    expect(screen.getByText('ATK')).toBeDefined();
    expect(screen.getByText('DEC')).toBeDefined();
    expect(screen.getByText('SUS')).toBeDefined();
    expect(screen.getByText('REL')).toBeDefined();
    expect(screen.getByText('FREQ')).toBeDefined();
    expect(screen.getByText('OCT')).toBeDefined();
  });

  it('renders the label "Filter Envelope"', () => {
    const onChange = vi.fn();
    render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    expect(screen.getByText('Filter Envelope')).toBeDefined();
  });

  it('renders a canvas element for the envelope visualization', () => {
    const onChange = vi.fn();
    const { container } = render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });
});

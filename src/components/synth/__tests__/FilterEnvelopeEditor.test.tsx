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
    expect(screen.getByText('ATK')).toBeInTheDocument();
    expect(screen.getByText('DEC')).toBeInTheDocument();
    expect(screen.getByText('SUS')).toBeInTheDocument();
    expect(screen.getByText('REL')).toBeInTheDocument();
    expect(screen.getByText('FREQ')).toBeInTheDocument();
    expect(screen.getByText('OCT')).toBeInTheDocument();
  });

  it('renders the label "Filter Envelope"', () => {
    const onChange = vi.fn();
    render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    expect(screen.getByText('Filter Envelope')).toBeInTheDocument();
  });

  it('renders a canvas element for the envelope visualization', () => {
    const onChange = vi.fn();
    const { container } = render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });
});

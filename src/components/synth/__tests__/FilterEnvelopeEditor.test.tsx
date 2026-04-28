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
    screen.getByText('ATK'); // getBy* throws if not found
    screen.getByText('DEC');
    screen.getByText('SUS');
    screen.getByText('REL');
    screen.getByText('FREQ');
    screen.getByText('OCT');
  });

  it('renders the label "Filter Envelope"', () => {
    const onChange = vi.fn();
    render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    screen.getByText('Filter Envelope'); // getBy* throws if not found
  });

  it('renders a canvas element for the envelope visualization', () => {
    const onChange = vi.fn();
    const { container } = render(<FilterEnvelopeEditor envelope={DEFAULT_ENVELOPE} onChange={onChange} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });
});

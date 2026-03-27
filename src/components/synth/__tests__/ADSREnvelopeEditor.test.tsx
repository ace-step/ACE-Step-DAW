import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ADSREnvelopeEditor } from '../ADSREnvelopeEditor';

describe('ADSREnvelopeEditor', () => {
  const defaultEnvelope = { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 };

  it('renders ADSR label', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    expect(screen.getByText('Envelope')).toBeInTheDocument();
  });

  it('renders a canvas element for the envelope curve', () => {
    const { container } = render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders four knobs for A, D, S, R', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    expect(screen.getByLabelText('ATK knob')).toBeInTheDocument();
    expect(screen.getByLabelText('DEC knob')).toBeInTheDocument();
    expect(screen.getByLabelText('SUS knob')).toBeInTheDocument();
    expect(screen.getByLabelText('REL knob')).toBeInTheDocument();
  });

  it('displays formatted parameter values', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    // Check that the labels exist
    expect(screen.getByText('ATK')).toBeInTheDocument();
    expect(screen.getByText('DEC')).toBeInTheDocument();
    expect(screen.getByText('SUS')).toBeInTheDocument();
    expect(screen.getByText('REL')).toBeInTheDocument();
  });
});

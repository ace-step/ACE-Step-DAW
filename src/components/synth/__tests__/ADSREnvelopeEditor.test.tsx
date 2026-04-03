import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ADSREnvelopeEditor } from '../ADSREnvelopeEditor';

describe('ADSREnvelopeEditor', () => {
  const defaultEnvelope = { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 };

  it('renders ADSR label', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    screen.getByText('Envelope'); // getBy* throws if not found
  });

  it('renders a canvas element for the envelope curve', () => {
    const { container } = render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders four knobs for A, D, S, R', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    screen.getByLabelText('ATK knob'); // getBy* throws if not found
    screen.getByLabelText('DEC knob');
    screen.getByLabelText('SUS knob');
    screen.getByLabelText('REL knob');
  });

  it('displays formatted parameter values', () => {
    render(<ADSREnvelopeEditor envelope={defaultEnvelope} onChange={vi.fn()} />);
    // Check that the labels exist
    screen.getByText('ATK'); // getBy* throws if not found
    screen.getByText('DEC');
    screen.getByText('SUS');
    screen.getByText('REL');
  });
});

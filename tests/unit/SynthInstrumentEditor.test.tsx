import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SynthInstrumentEditor } from '../../src/components/pianoroll/SynthInstrumentEditor';
import { createDefaultFmInstrument, createDefaultSubtractiveInstrument } from '../../src/utils/trackInstrument';

describe('SynthInstrumentEditor', () => {
  it('updates subtractive oscillator waveform, filter cutoff, and filter envelope through canonical instrument state', () => {
    const onInstrumentChange = vi.fn();

    render(
      <SynthInstrumentEditor
        instrument={createDefaultSubtractiveInstrument('pad')}
        onInstrumentChange={onInstrumentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Instrument waveform'), { target: { value: 'square' } });
    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'subtractive',
      settings: expect.objectContaining({
        oscillator: expect.objectContaining({ waveform: 'square' }),
      }),
    }));

    fireEvent.contextMenu(screen.getByLabelText('Filter Cutoff knob'));
    fireEvent.change(screen.getByLabelText('Filter Cutoff exact value'), { target: { value: '3200' } });
    fireEvent.keyDown(screen.getByLabelText('Filter Cutoff exact value'), { key: 'Enter' });

    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'subtractive',
      settings: expect.objectContaining({
        filter: expect.objectContaining({ cutoffHz: 3200 }),
      }),
    }));

    fireEvent.contextMenu(screen.getByLabelText('Filter Env Amt knob'));
    fireEvent.change(screen.getByLabelText('Filter Env Amt exact value'), { target: { value: '0.42' } });
    fireEvent.keyDown(screen.getByLabelText('Filter Env Amt exact value'), { key: 'Enter' });

    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'subtractive',
      settings: expect.objectContaining({
        filterEnvelope: expect.objectContaining({ amount: 0.42 }),
      }),
    }));

    fireEvent.contextMenu(screen.getByLabelText('Filt Env Release knob'));
    fireEvent.change(screen.getByLabelText('Filt Env Release exact value'), { target: { value: '1.8' } });
    fireEvent.keyDown(screen.getByLabelText('Filt Env Release exact value'), { key: 'Enter' });

    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'subtractive',
      settings: expect.objectContaining({
        filterEnvelope: expect.objectContaining({ release: 1.8 }),
      }),
    }));
  });

  it('updates FM fallback preset and modulation index through canonical instrument state', () => {
    const onInstrumentChange = vi.fn();

    render(
      <SynthInstrumentEditor
        instrument={createDefaultFmInstrument()}
        onInstrumentChange={onInstrumentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Instrument FM fallback preset'), { target: { value: 'bass' } });
    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'fm',
      fallbackPreset: 'bass',
    }));

    fireEvent.contextMenu(screen.getByLabelText('Modulation Index knob'));
    fireEvent.change(screen.getByLabelText('Modulation Index exact value'), { target: { value: '7.5' } });
    fireEvent.keyDown(screen.getByLabelText('Modulation Index exact value'), { key: 'Enter' });

    expect(onInstrumentChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'fm',
      settings: expect.objectContaining({
        modulationIndex: 7.5,
      }),
    }));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundDesignPanel } from '../SoundDesignPanel';
import type { SubtractiveInstrumentSettings } from '../../../types/project';

const DEFAULT_SETTINGS: SubtractiveInstrumentSettings = {
  oscillator: { waveform: 'sawtooth', octave: 0, detuneCents: 0, level: 1 },
  ampEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 },
  filter: { enabled: false, type: 'lowpass', cutoffHz: 2000, resonance: 1, drive: 0, keyTracking: 0 },
  filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, amount: 0 },
  lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 1, depth: 0, retrigger: false },
  unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 0.5 },
  glideTime: 0,
  outputGain: 0.55,
};

describe('SoundDesignPanel', () => {
  const onApply = vi.fn();

  beforeEach(() => {
    onApply.mockClear();
  });

  it('renders the description input', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    expect(screen.getByPlaceholderText(/describe the sound/i)).toBeTruthy();
  });

  it('generates suggestions on submit', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    const input = screen.getByPlaceholderText(/describe the sound/i);
    fireEvent.change(input, { target: { value: 'warm pad with slow attack' } });
    fireEvent.click(screen.getByTestId('sound-design-suggest-btn'));
    // Should show suggestion results
    expect(screen.getByTestId('sound-design-suggestion')).toBeTruthy();
  });

  it('applies suggestion when apply button is clicked', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    const input = screen.getByPlaceholderText(/describe the sound/i);
    fireEvent.change(input, { target: { value: 'bright lead' } });
    fireEvent.click(screen.getByTestId('sound-design-suggest-btn'));
    fireEvent.click(screen.getByTestId('sound-design-apply-btn'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(typeof onApply.mock.calls[0][0]).toBe('object');
  });

  it('shows variations when variations button is clicked', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('sound-design-variations-btn'));
    const items = screen.getAllByTestId('sound-design-variation');
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('applies a variation when clicked', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('sound-design-variations-btn'));
    const first = screen.getAllByTestId('sound-design-variation')[0];
    fireEvent.click(first);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows parameter diff in suggestion', () => {
    render(
      <SoundDesignPanel
        currentSettings={DEFAULT_SETTINGS}
        instrumentKind="subtractive"
        onApply={onApply}
      />,
    );
    const input = screen.getByPlaceholderText(/describe the sound/i);
    fireEvent.change(input, { target: { value: 'warm' } });
    fireEvent.click(screen.getByTestId('sound-design-suggest-btn'));
    expect(screen.getByTestId('sound-design-diff')).toBeTruthy();
  });
});

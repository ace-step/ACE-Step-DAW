import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SynthPresetBrowser } from '../SynthPresetBrowser';
import { FACTORY_SYNTH_PRESETS } from '../../../data/synthPresets';
import type { InstrumentPreset } from '../../../data/instrumentPresets';

describe('SynthPresetBrowser', () => {
  const mockOnSelect = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
    mockOnSave.mockClear();
  });

  it('renders with a toggle button', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /preset/i })).toBeInTheDocument();
  });

  it('shows preset list when toggled open', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    // Should show category buttons
    expect(screen.getByText('Bass')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getByText('Pad')).toBeInTheDocument();
  });

  it('shows factory presets for a category', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Bass'));
    const bassPresets = FACTORY_SYNTH_PRESETS.filter((p) => p.category === 'Bass');
    for (const preset of bassPresets) {
      expect(screen.getByText(preset.name)).toBeInTheDocument();
    }
  });

  it('calls onSelectPreset when a preset is clicked', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Bass'));
    fireEvent.click(screen.getByText('Sub Bass'));
    expect(mockOnSelect).toHaveBeenCalledWith('factory-sub-bass');
  });

  it('filters presets by search query', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'warm' } });
    expect(screen.getByText('Warm Pad')).toBeInTheDocument();
    // Other presets that don't match should not be visible
    expect(screen.queryByText('Sub Bass')).not.toBeInTheDocument();
  });

  it('displays current preset name on the button', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId="factory-sub-bass"
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /preset/i })).toHaveTextContent('Sub Bass');
  });

  it('shows user presets in the list', () => {
    const userPreset: InstrumentPreset = {
      id: 'user-test-1',
      name: 'My Custom Bass',
      category: 'Bass',
      instrumentKind: 'subtractive',
      isFactory: false,
      instrument: {
        kind: 'subtractive',
        preset: 'bass',
        name: 'My Custom Bass',
        settings: {
          oscillator: { waveform: 'sine', octave: 0, detuneCents: 0, level: 1 },
          ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
          filter: { enabled: false, type: 'lowpass', cutoffHz: 5000, resonance: 0, drive: 0, keyTracking: 0 },
          filterEnvelope: { enabled: false, attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, amount: 0 },
          lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 1, depth: 0.5, retrigger: false },
          unison: { voices: 1, detuneCents: 0, spread: 0 },
          glideTime: 0,
          outputGain: 0.55,
        },
      },
    };
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
        userInstrumentPresets={[userPreset]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Bass'));
    expect(screen.getByText('My Custom Bass')).toBeInTheDocument();
  });

  it('shows instrument kind tabs', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Synth')).toBeInTheDocument();
    expect(screen.getByText('FM')).toBeInTheDocument();
    // "Wavetable" appears as both a kind tab and a category — check at least one exists
    expect(screen.getAllByText('Wavetable').length).toBeGreaterThanOrEqual(1);
  });

  it('filters presets by instrument kind', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    // Click FM tab
    fireEvent.click(screen.getByText('FM'));
    // Should show FM categories (Keys, Bell, Bass, Lead, etc.)
    expect(screen.getByText('Keys')).toBeInTheDocument();
    // Click Keys category
    fireEvent.click(screen.getByText('Keys'));
    expect(screen.getByText('FM Electric Piano')).toBeInTheDocument();
  });

  it('shows kind badges when filter is All', () => {
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Electric Piano' } });
    // Should show both subtractive "Electric Piano" and FM "FM Electric Piano"
    expect(screen.getByText('Electric Piano')).toBeInTheDocument();
    expect(screen.getByText('FM Electric Piano')).toBeInTheDocument();
  });
});

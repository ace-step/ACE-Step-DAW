import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SynthPresetBrowser } from '../SynthPresetBrowser';
import { FACTORY_SYNTH_PRESETS } from '../../../data/synthPresets';

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
    const userPreset = {
      id: 'user-test-1',
      name: 'My Custom Bass',
      category: 'Bass' as const,
      isFactory: false,
      waveform: 'sine' as const,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
      legacyPreset: 'bass' as const,
    };
    render(
      <SynthPresetBrowser
        trackId="track-1"
        currentPresetId={null}
        onSelectPreset={mockOnSelect}
        onSavePreset={mockOnSave}
        userPresets={[userPreset]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Bass'));
    expect(screen.getByText('My Custom Bass')).toBeInTheDocument();
  });
});

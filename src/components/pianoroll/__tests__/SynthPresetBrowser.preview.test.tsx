import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SynthPresetBrowser } from '../SynthPresetBrowser';
import { FACTORY_SYNTH_PRESETS } from '../../../data/synthPresets';

// Mock Tone.js
vi.mock('tone', () => ({
  getContext: () => ({ state: 'running' }),
  start: vi.fn(),
  Frequency: vi.fn().mockReturnValue({ toFrequency: () => 440 }),
  Gain: vi.fn().mockReturnValue({ toDestination: vi.fn(), connect: vi.fn(), dispose: vi.fn() }),
}));

describe('SynthPresetBrowser — preview buttons', () => {
  const defaultProps = {
    trackId: 'track-1',
    currentPresetId: null,
    onSelectPreset: vi.fn(),
    onSavePreset: vi.fn(),
    userPresets: [] as typeof FACTORY_SYNTH_PRESETS,
    userInstrumentPresets: [],
    onDeleteUserPreset: vi.fn(),
    onPreviewPreset: vi.fn(),
  };

  it('renders preview buttons when onPreviewPreset is provided', () => {
    render(<SynthPresetBrowser {...defaultProps} />);
    // Open the browser
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    // Navigate to a category
    const bassCategory = screen.getByText('Bass');
    fireEvent.click(bassCategory);
    // Preview buttons should be present
    const previewButtons = screen.getAllByLabelText(/Preview/);
    expect(previewButtons.length).toBeGreaterThan(0);
  });

  it('calls onPreviewPreset when preview button is clicked', () => {
    const onPreviewPreset = vi.fn();
    render(<SynthPresetBrowser {...defaultProps} onPreviewPreset={onPreviewPreset} />);
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    const bassCategory = screen.getByText('Bass');
    fireEvent.click(bassCategory);
    const previewButtons = screen.getAllByLabelText(/Preview/);
    fireEvent.click(previewButtons[0]);
    expect(onPreviewPreset).toHaveBeenCalledTimes(1);
    expect(typeof onPreviewPreset.mock.calls[0][0]).toBe('string'); // preset ID
  });

  it('does not render preview buttons when onPreviewPreset is not provided', () => {
    const { onPreviewPreset: _, ...propsWithoutPreview } = defaultProps;
    render(<SynthPresetBrowser {...propsWithoutPreview} />);
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    const bassCategory = screen.getByText('Bass');
    fireEvent.click(bassCategory);
    const previewButtons = screen.queryAllByLabelText(/Preview/);
    expect(previewButtons.length).toBe(0);
  });
});

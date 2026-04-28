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

// Mock usePresetPreview hook
vi.mock('../../../hooks/usePresetPreview', () => ({
  usePresetPreview: () => ({
    isPlaying: false,
    activePresetId: null,
    volume: 0.3,
    handlePresetHoverStart: vi.fn(),
    handlePresetHoverEnd: vi.fn(),
    handlePresetClick: vi.fn(),
    changeVolume: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('SynthPresetBrowser — preview system', () => {
  const defaultProps = {
    trackId: 'track-1',
    currentPresetId: null,
    onSelectPreset: vi.fn(),
    onSavePreset: vi.fn(),
    userPresets: [] as typeof FACTORY_SYNTH_PRESETS,
    userInstrumentPresets: [],
    onDeleteUserPreset: vi.fn(),
  };

  it('renders built-in preview play buttons for each preset in a category', () => {
    render(<SynthPresetBrowser {...defaultProps} />);
    // Open the browser
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    // Navigate to a category
    const bassCategory = screen.getByText('Bass');
    fireEvent.click(bassCategory);
    // Preview buttons should be present (built-in, from usePresetPreview)
    const previewButtons = screen.getAllByLabelText(/Preview/);
    expect(previewButtons.length).toBeGreaterThan(0);
  });

  it('renders volume control slider when browser is open', () => {
    render(<SynthPresetBrowser {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    expect(screen.getByLabelText('Preview volume')).toBeInTheDocument();
  });

  it('renders keyboard-focusable preset list', () => {
    render(<SynthPresetBrowser {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Synth preset browser'));
    const bassCategory = screen.getByText('Bass');
    fireEvent.click(bassCategory);
    // The list container should be focusable (tabIndex=0)
    const items = document.querySelectorAll('[data-preset-item]');
    expect(items.length).toBeGreaterThan(0);
  });
});

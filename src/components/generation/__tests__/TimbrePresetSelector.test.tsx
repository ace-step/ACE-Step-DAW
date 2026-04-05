import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimbrePresetSelector } from '../TimbrePresetSelector';
import { TIMBRE_PRESETS, TIMBRE_CATEGORIES } from '../../../data/timbrePresets';

describe('TimbrePresetSelector', () => {
  const defaultProps = {
    currentPrompt: 'my cool song',
    onApplyTimbre: vi.fn(),
    disabled: false,
  };

  it('renders with placeholder text', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    expect(screen.getByText('Select a timbre preset...')).toBeInTheDocument();
  });

  it('opens preset browser when toggle is clicked', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    expect(screen.getByTestId('timbre-preset-browser')).toBeInTheDocument();
  });

  it('shows all category tabs including All', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    for (const cat of TIMBRE_CATEGORIES) {
      expect(screen.getByRole('button', { name: cat })).toBeInTheDocument();
    }
  });

  it('shows all presets when All is selected', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    for (const preset of TIMBRE_PRESETS) {
      expect(document.querySelector(`[data-timbre-preset-id="${preset.id}"]`)).toBeInTheDocument();
    }
  });

  it('filters presets by category', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Guitar Tones' }));
    const guitarPresets = TIMBRE_PRESETS.filter((p) => p.category === 'Guitar Tones');
    for (const preset of guitarPresets) {
      expect(document.querySelector(`[data-timbre-preset-id="${preset.id}"]`)).toBeInTheDocument();
    }
    const nonGuitar = TIMBRE_PRESETS.filter((p) => p.category !== 'Guitar Tones');
    for (const preset of nonGuitar) {
      expect(document.querySelector(`[data-timbre-preset-id="${preset.id}"]`)).not.toBeInTheDocument();
    }
  });

  it('applies timbre preset to prompt and closes browser', () => {
    const onApplyTimbre = vi.fn();
    render(<TimbrePresetSelector {...defaultProps} onApplyTimbre={onApplyTimbre} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const firstPreset = TIMBRE_PRESETS[0];
    fireEvent.click(document.querySelector(`[data-timbre-preset-id="${firstPreset.id}"]`)!);
    expect(onApplyTimbre).toHaveBeenCalledWith(
      `${firstPreset.promptFragment}, my cool song`,
    );
    // Browser should close
    expect(screen.queryByTestId('timbre-preset-browser')).not.toBeInTheDocument();
    // Active preset name should be displayed
    expect(screen.getByText(firstPreset.name)).toBeInTheDocument();
  });

  it('shows clear button when a preset is active', () => {
    render(<TimbrePresetSelector {...defaultProps} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const firstPreset = TIMBRE_PRESETS[0];
    fireEvent.click(document.querySelector(`[data-timbre-preset-id="${firstPreset.id}"]`)!);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<TimbrePresetSelector {...defaultProps} disabled={true} />);
    const toggle = screen.getByTestId('timbre-preset-toggle');
    expect(toggle).toBeDisabled();
  });
});

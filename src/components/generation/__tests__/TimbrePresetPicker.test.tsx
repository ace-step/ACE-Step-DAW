import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimbrePresetPicker } from '../TimbrePresetPicker';
import { FACTORY_TIMBRE_PRESETS } from '../../../data/timbrePresets';

describe('TimbrePresetPicker', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
  });

  it('renders with collapsed state initially', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    expect(screen.getByTestId('timbre-preset-toggle')).toBeTruthy();
    expect(screen.queryAllByTestId('timbre-preset-item').length).toBe(0);
  });

  it('expands to show presets when toggle is clicked', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    expect(screen.getAllByTestId('timbre-preset-item').length).toBeGreaterThan(0);
  });

  it('shows category tabs when expanded', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const tabs = screen.getAllByTestId('timbre-category-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  it('filters presets by category', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const tabs = screen.getAllByTestId('timbre-category-tab');
    const firstCat = tabs.find((t) => t.textContent !== 'All');
    expect(firstCat).toBeDefined();
    fireEvent.click(firstCat!);
    const items = screen.getAllByTestId('timbre-preset-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThan(FACTORY_TIMBRE_PRESETS.length);
  });

  it('calls onSelect with full TimbrePreset when a preset is clicked', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const first = screen.getAllByTestId('timbre-preset-item')[0];
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const calledWith = onSelect.mock.calls[0][0];
    expect(calledWith).toHaveProperty('id');
    expect(calledWith).toHaveProperty('promptTemplate');
    expect(calledWith.promptTemplate.length).toBeGreaterThan(10);
  });

  it('collapses after selecting a preset', () => {
    render(<TimbrePresetPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('timbre-preset-toggle'));
    const first = screen.getAllByTestId('timbre-preset-item')[0];
    fireEvent.click(first);
    expect(screen.queryAllByTestId('timbre-preset-item').length).toBe(0);
  });
});

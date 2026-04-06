import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NegativePromptSection } from '../NegativePromptSection';

describe('NegativePromptSection', () => {
  it('renders collapsed by default when value is empty', () => {
    render(<NegativePromptSection value="" onChange={() => {}} />);
    expect(screen.getByTestId('negative-prompt-toggle')).toBeDefined();
    expect(screen.queryByTestId('negative-prompt-input')).toBeNull();
  });

  it('renders expanded when value is non-empty', () => {
    render(<NegativePromptSection value="no autotune" onChange={() => {}} />);
    expect(screen.getByTestId('negative-prompt-input')).toBeDefined();
  });

  it('expands when toggle is clicked', () => {
    render(<NegativePromptSection value="" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeDefined();
  });

  it('collapses when toggle is clicked again', () => {
    render(<NegativePromptSection value="test" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.queryByTestId('negative-prompt-input')).toBeNull();
  });

  it('calls onChange when textarea is edited', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.change(screen.getByTestId('negative-prompt-input'), {
      target: { value: 'no distortion' },
    });
    expect(onChange).toHaveBeenCalledWith('no distortion');
  });

  it('renders suggestion chips when expanded', () => {
    render(<NegativePromptSection value="" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('suggestion-chip-no-autotune')).toBeDefined();
    expect(screen.getByTestId('suggestion-chip-no-heavy-reverb')).toBeDefined();
  });

  it('adds a chip to the value when clicked', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.click(screen.getByTestId('suggestion-chip-no-autotune'));
    expect(onChange).toHaveBeenCalledWith('no autotune');
  });

  it('removes a chip from the value when clicked again', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="no autotune, no reverb" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('suggestion-chip-no-autotune'));
    expect(onChange).toHaveBeenCalledWith('no reverb');
  });

  it('shows item count badge when collapsed with values', () => {
    const { container } = render(
      <NegativePromptSection value="no autotune, no reverb" onChange={() => {}} />,
    );
    // First collapse it
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    // Now it should show the count
    expect(screen.getByTestId('negative-prompt-toggle').textContent).toContain('2 items');
  });

  it('disables textarea when disabled prop is true', () => {
    render(<NegativePromptSection value="test" onChange={() => {}} disabled />);
    const input = screen.getByTestId('negative-prompt-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
  });

  it('highlights active chips', () => {
    render(<NegativePromptSection value="no autotune" onChange={() => {}} />);
    const chip = screen.getByTestId('suggestion-chip-no-autotune');
    expect(chip.className).toContain('indigo');
  });
});

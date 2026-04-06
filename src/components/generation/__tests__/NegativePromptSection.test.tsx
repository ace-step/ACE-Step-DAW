import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NegativePromptSection } from '../NegativePromptSection';

describe('NegativePromptSection', () => {
  const makeProps = () => ({
    value: '',
    onChange: vi.fn(),
    disabled: false,
  });

  it('renders collapsed by default with toggle button', () => {
    render(<NegativePromptSection {...makeProps()} />);
    expect(screen.getByTestId('negative-prompt-toggle')).toBeInTheDocument();
    expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
    // Textarea should not be visible when collapsed
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
  });

  it('expands to show textarea and chips when toggle is clicked', () => {
    render(<NegativePromptSection {...makeProps()} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    expect(screen.getByTestId('negative-prompt-chips')).toBeInTheDocument();
  });

  it('collapses when toggle is clicked again', () => {
    render(<NegativePromptSection {...makeProps()} />);
    const toggle = screen.getByTestId('negative-prompt-toggle');
    fireEvent.click(toggle); // expand
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    fireEvent.click(toggle); // collapse
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
  });

  it('calls onChange when typing in textarea', () => {
    const props = makeProps();
    render(<NegativePromptSection {...props} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    const input = screen.getByTestId('negative-prompt-input');
    fireEvent.change(input, { target: { value: 'no reverb' } });
    expect(props.onChange).toHaveBeenCalledWith('no reverb');
  });

  it('adds chip to empty value on click', () => {
    const props = makeProps();
    render(<NegativePromptSection {...props} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.click(screen.getByText('no autotune'));
    expect(props.onChange).toHaveBeenCalledWith('no autotune');
  });

  it('appends chip with comma separator when value already exists', () => {
    const props = { ...makeProps(), value: 'no reverb' };
    render(<NegativePromptSection {...props} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.click(screen.getByText('no autotune'));
    expect(props.onChange).toHaveBeenCalledWith('no reverb, no autotune');
  });

  it('does not add duplicate chip', () => {
    const props = { ...makeProps(), value: 'no autotune' };
    render(<NegativePromptSection {...props} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    const chip = screen.getByRole('button', { name: 'no autotune' });
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('shows preview text when collapsed with value', () => {
    render(<NegativePromptSection {...makeProps()} value="no reverb, no distortion" onChange={vi.fn()} />);
    // Should show the truncated value preview
    expect(screen.getByText('no reverb, no distortion')).toBeInTheDocument();
  });

  it('disables textarea and chips when disabled prop is true', () => {
    render(<NegativePromptSection value="" onChange={vi.fn()} disabled />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeDisabled();
  });

  it('renders all 8 suggestion chips', () => {
    render(<NegativePromptSection {...makeProps()} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    const chips = screen.getByTestId('negative-prompt-chips');
    expect(chips.children).toHaveLength(8);
  });
});

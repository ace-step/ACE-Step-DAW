import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NegativePromptSection } from '../NegativePromptSection';

describe('NegativePromptSection', () => {
  it('renders collapsed by default', () => {
    render(<NegativePromptSection value="" onChange={vi.fn()} />);
    expect(screen.getByTestId('negative-prompt-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
  });

  it('expands when toggle is clicked', () => {
    render(<NegativePromptSection value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    expect(screen.getByTestId('negative-prompt-chips')).toBeInTheDocument();
  });

  it('shows active count badge when value is non-empty', () => {
    render(<NegativePromptSection value="distortion, noise" onChange={vi.fn()} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('calls onChange when textarea is edited', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.change(screen.getByTestId('negative-prompt-input'), {
      target: { value: 'noise' },
    });
    expect(onChange).toHaveBeenCalledWith('noise');
  });

  it('toggles suggestion chip on click', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    fireEvent.click(screen.getByTestId('chip-distortion'));
    expect(onChange).toHaveBeenCalledWith('distortion');
  });

  it('removes chip when already active', () => {
    const onChange = vi.fn();
    render(<NegativePromptSection value="distortion, noise" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('chip-distortion'));
    expect(onChange).toHaveBeenCalledWith('noise');
  });

  it('renders all 8 suggestion chips', () => {
    render(<NegativePromptSection value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    const chips = screen.getByTestId('negative-prompt-chips');
    expect(chips.children.length).toBe(8);
  });

  it('textarea is disabled when disabled prop is true', () => {
    render(<NegativePromptSection value="" onChange={vi.fn()} disabled />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeDisabled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionSelector, SECTION_PRESETS, getSectionColor } from '../SectionSelector';

const mockRect = new DOMRect(100, 100, 200, 20);

describe('SectionSelector', () => {
  it('renders all presets when query is empty', () => {
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('section-selector')).toBeInTheDocument();
    // Should show all presets
    SECTION_PRESETS.forEach((p) => {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    });
  });

  it('filters presets by query', () => {
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'cho' } });

    expect(screen.getByText('chorus')).toBeInTheDocument();
    expect(screen.getByText('pre-chorus')).toBeInTheDocument();
    expect(screen.queryByText('intro')).not.toBeInTheDocument();
  });

  it('commits on Enter with highlighted preset', () => {
    const onCommit = vi.fn();
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'intro' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('intro');
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows custom option when query does not match any preset', () => {
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'my section' } });

    expect(screen.getByText(/Use "my section"/)).toBeInTheDocument();
  });

  it('commits custom text on Enter when custom option is highlighted', () => {
    const onCommit = vi.fn();
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'my custom' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('my custom');
  });

  it('cancels on backdrop click', () => {
    const onCancel = vi.fn();
    render(
      <SectionSelector
        defaultValue="New Section"
        anchorRect={mockRect}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('section-selector-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('getSectionColor', () => {
  it('returns preset color for known sections', () => {
    expect(getSectionColor('Intro', '#000')).toBe('#6366f1');
    expect(getSectionColor('CHORUS', '#000')).toBe('#f59e0b');
    expect(getSectionColor('drop', '#000')).toBe('#06b6d4');
  });

  it('returns fallback for unknown sections', () => {
    expect(getSectionColor('my custom', '#aaa')).toBe('#aaa');
  });
});

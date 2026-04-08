import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SamplePickerDropdown } from '../SamplePicker';

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      decodeAudioData: vi.fn().mockResolvedValue({}),
    },
    resume: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../services/sampleManager', () => ({
  cacheUserSample: vi.fn(),
}));

function renderPicker(overrides: Partial<Parameters<typeof SamplePickerDropdown>[0]> = {}) {
  const defaults = {
    currentKey: '',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onPreview: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SamplePickerDropdown {...props} />), props };
}

describe('SamplePickerDropdown', () => {
  it('renders Built-in Samples header', () => {
    renderPicker();
    expect(screen.getByText('Built-in Samples')).toBeInTheDocument();
  });

  it('renders sample options from ALL_DRUM_SAMPLES', () => {
    renderPicker();
    // Verify known built-in sample names are rendered
    expect(screen.getByText('Kick')).toBeInTheDocument();
    expect(screen.getByText('Snare')).toBeInTheDocument();
    expect(screen.getByText('Closed HH')).toBeInTheDocument();
  });

  it('shows checkmark for currently selected sample', () => {
    renderPicker({ currentKey: 'kick' });
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('hides checkmark when no sample selected', () => {
    renderPicker({ currentKey: '' });
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('calls onSelect when clicking a sample', () => {
    const { props } = renderPicker();
    const buttons = screen.getAllByRole('button');
    // Click the first sample button (skip the backdrop)
    const sampleButton = buttons[0];
    fireEvent.click(sampleButton);
    expect(props.onSelect).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it('calls onPreview on mouseDown of a sample', () => {
    const { props } = renderPicker();
    const buttons = screen.getAllByRole('button');
    fireEvent.mouseDown(buttons[0]);
    expect(props.onPreview).toHaveBeenCalledWith(expect.any(String));
  });

  it('calls onClose when clicking the backdrop', () => {
    const { props, container } = renderPicker();
    // The first child is the fixed backdrop
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('renders Import Audio button', () => {
    renderPicker();
    expect(screen.getByText('Import Audio...')).toBeInTheDocument();
  });

  it('has a hidden file input for audio import', () => {
    const { container } = renderPicker();
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput?.getAttribute('accept')).toBe('audio/*');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransformMenu } from '../TransformMenu';

vi.mock('../../../utils/midiTransforms', () => ({
  SCALES: {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
  },
}));

describe('TransformMenu', () => {

  it('renders Transform button', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set()} />);
    expect(screen.getByText('Transform')).toBeInTheDocument();
  });

  it('disables button when no notes selected', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set()} />);
    expect(screen.getByText('Transform')).toBeDisabled();
  });

  it('enables button when notes are selected', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    expect(screen.getByText('Transform')).not.toBeDisabled();
  });

  it('opens dropdown on click', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    expect(screen.getByText('Humanize')).toBeInTheDocument();
    expect(screen.getByText('Transpose')).toBeInTheDocument();
    expect(screen.getByText('Invert')).toBeInTheDocument();
    expect(screen.getByText('Retrograde')).toBeInTheDocument();
    expect(screen.getByText('Legato')).toBeInTheDocument();
    expect(screen.getByText('Scale Correct')).toBeInTheDocument();
    expect(screen.getByText('Velocity Scale')).toBeInTheDocument();
  });

  it('shows transpose params when selected', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Transpose'));
    expect(screen.getByText('Semitones')).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('shows humanize params', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Humanize'));
    expect(screen.getByText('Timing (beats)')).toBeInTheDocument();
    expect(screen.getByText('Velocity')).toBeInTheDocument();
  });

  it('shows scale correct params with root and scale selectors', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Scale Correct'));
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Scale')).toBeInTheDocument();
  });

  it('shows velocity scale params', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Velocity Scale'));
    expect(screen.getByText('Min velocity')).toBeInTheDocument();
    expect(screen.getByText('Max velocity')).toBeInTheDocument();
  });

  it('shows Back button in param view', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Transpose'));
    expect(screen.getByText('← Back')).toBeInTheDocument();
  });

  it('returns to transform list on Back click', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    fireEvent.click(screen.getByText('Transform'));
    fireEvent.click(screen.getByText('Transpose'));
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Humanize')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set(['note-1'])} />);
    expect(screen.getByLabelText('MIDI transform tools')).toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    render(<TransformMenu clipId="clip-1" selectedNoteIds={new Set()} />);
    fireEvent.click(screen.getByText('Transform'));
    expect(screen.queryByText('Humanize')).not.toBeInTheDocument();
  });
});

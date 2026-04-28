import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PianoRollEmptyState } from '../PianoRollEmptyState';

describe('PianoRollEmptyState', () => {
  it('renders empty state title', () => {
    render(<PianoRollEmptyState />);
    expect(screen.getByText('No MIDI clip on this track')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<PianoRollEmptyState />);
    expect(screen.getByText('Select a MIDI track with clips to edit notes')).toBeInTheDocument();
  });

  it('renders music note SVG icon', () => {
    const { container } = render(<PianoRollEmptyState />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('centers content', () => {
    const { container } = render(<PianoRollEmptyState />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex-1');
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('justify-center');
  });
});

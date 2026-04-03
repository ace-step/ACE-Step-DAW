import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelSkeleton } from '../PanelSkeleton';

describe('PanelSkeleton', () => {
  it('renders mixer skeleton with multiple channel placeholders', () => {
    render(<PanelSkeleton variant="mixer" />);
    const mixer = screen.getByTestId('mixer-skeleton');
    expect(mixer).toBeDefined();
    const skeletons = mixer.querySelectorAll('[data-testid="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders editor skeleton for pianoRoll variant', () => {
    render(<PanelSkeleton variant="pianoRoll" />);
    const editor = screen.getByTestId('editor-skeleton');
    expect(editor).toBeDefined();
  });

  it('renders editor skeleton for effects variant', () => {
    render(<PanelSkeleton variant="effects" />);
    const editor = screen.getByTestId('editor-skeleton');
    expect(editor).toBeDefined();
  });

  it('renders editor skeleton for editor variant', () => {
    render(<PanelSkeleton variant="editor" />);
    const editor = screen.getByTestId('editor-skeleton');
    expect(editor).toBeDefined();
  });

  it('skeleton elements have aria-hidden', () => {
    render(<PanelSkeleton variant="mixer" />);
    const skeletons = screen.getAllByTestId('skeleton');
    skeletons.forEach((el) => {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

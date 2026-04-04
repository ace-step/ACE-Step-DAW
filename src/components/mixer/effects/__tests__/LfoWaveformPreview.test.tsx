import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LfoWaveformPreview } from '../LfoWaveformPreview';

describe('LfoWaveformPreview', () => {
  it('renders an SVG waveform element', () => {
    const { container } = render(
      <LfoWaveformPreview shape="sine" rate={2} depth={0.5} color="#22d3ee" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders a path element for the waveform', () => {
    const { container } = render(
      <LfoWaveformPreview shape="sine" rate={2} depth={0.5} color="#22d3ee" />,
    );
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('stroke')).toBe('#22d3ee');
  });

  it('renders with different shapes without error', () => {
    const shapes = ['sine', 'triangle', 'square', 'sawtooth'] as const;
    for (const shape of shapes) {
      const { container, unmount } = render(
        <LfoWaveformPreview shape={shape} rate={1} depth={1} color="#fff" />,
      );
      expect(container.querySelector('path')).not.toBeNull();
      unmount();
    }
  });

  it('includes aria-label for accessibility', () => {
    render(
      <LfoWaveformPreview shape="sine" rate={2} depth={0.5} color="#22d3ee" />,
    );
    expect(screen.getByLabelText(/lfo.*waveform/i)).toBeDefined();
  });

  it('uses depth to control waveform amplitude', () => {
    const { container: c1 } = render(
      <LfoWaveformPreview shape="sine" rate={1} depth={1} color="#fff" />,
    );
    const path1 = c1.querySelector('path')?.getAttribute('d') ?? '';

    const { container: c2 } = render(
      <LfoWaveformPreview shape="sine" rate={1} depth={0} color="#fff" />,
    );
    const path2 = c2.querySelector('path')?.getAttribute('d') ?? '';

    // Different depth should produce different path data
    expect(path1).not.toBe(path2);
  });
});

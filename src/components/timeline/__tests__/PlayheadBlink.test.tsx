import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Playhead } from '../Playhead';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';

describe('Playhead blink animation', () => {
  beforeEach(() => {
    useTransportStore.setState({ currentTime: 5, isPlaying: false });
    useUIStore.setState({ pixelsPerSecond: 50 });
  });

  it('applies blink animation when transport is stopped', () => {
    useTransportStore.setState({ isPlaying: false });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.animation).toContain('playhead-blink-line');
  });

  it('does not apply blink animation when transport is playing', () => {
    useTransportStore.setState({ isPlaying: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.animation).toBe('none');
  });

  it('positions playhead at currentTime * pixelsPerSecond', () => {
    useTransportStore.setState({ currentTime: 3 });
    useUIStore.setState({ pixelsPerSecond: 100 });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.left).toBe('300px');
  });

  it('uses purple color for playhead line when playing', () => {
    useTransportStore.setState({ isPlaying: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.backgroundColor).toBe('var(--color-daw-playhead)');
  });
});

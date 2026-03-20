import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Playhead } from '../Playhead';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';

describe('Playhead blink animation', () => {
  beforeEach(() => {
    useTransportStore.setState({ currentTime: 5, isPlaying: false });
    useUIStore.setState({ pixelsPerSecond: 50, timelineFocused: false });
  });

  it('applies blink animation when stopped and timeline is focused', () => {
    useTransportStore.setState({ isPlaying: false });
    useUIStore.setState({ timelineFocused: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.animation).toContain('playhead-blink-line');
  });

  it('does not blink when transport is playing', () => {
    useTransportStore.setState({ isPlaying: true });
    useUIStore.setState({ timelineFocused: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.animation).toBe('none');
  });

  it('does not blink when timeline is not focused', () => {
    useTransportStore.setState({ isPlaying: false });
    useUIStore.setState({ timelineFocused: false });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.animation).toBe('none');
  });

  it('shows white line when not blinking', () => {
    useTransportStore.setState({ isPlaying: false });
    useUIStore.setState({ timelineFocused: false });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    // JSDOM normalizes hex to rgb
    expect(line.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('positions playhead at currentTime * pixelsPerSecond', () => {
    useTransportStore.setState({ currentTime: 3 });
    useUIStore.setState({ pixelsPerSecond: 100 });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.style.left).toBe('300px');
  });
});

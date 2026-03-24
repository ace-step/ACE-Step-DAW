import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Playhead } from '../Playhead';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';

describe('Playhead blink animation', () => {
  beforeEach(() => {
    useTransportStore.setState({ currentTime: 0, playStartTime: 0, isPlaying: false });
    useUIStore.setState({ pixelsPerSecond: 50, timelineFocused: false, selectedTrackIds: new Set() });
  });

  it('renders transport line when currentTime differs from playStartTime', () => {
    useTransportStore.setState({ isPlaying: true, currentTime: 3, playStartTime: 1 });
    useUIStore.setState({ pixelsPerSecond: 100, timelineFocused: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(line.style.transform).toBe('translateX(300px)');
    expect(line.style.minHeight).toBe('100vh');
  });

  it('renders nothing when stopped, unfocused, and currentTime equals playStartTime', () => {
    useTransportStore.setState({ isPlaying: false, currentTime: 0, playStartTime: 0 });
    useUIStore.setState({ timelineFocused: false });
    const { container } = render(<Playhead />);
    expect(container.firstElementChild).toBeNull();
  });

  it('transport line stays visible after pause when currentTime differs from anchor', () => {
    // Simulate: played from t=1, paused at t=5
    useTransportStore.setState({ isPlaying: false, currentTime: 5, playStartTime: 1 });
    useUIStore.setState({ pixelsPerSecond: 100, timelineFocused: true });
    const { container } = render(<Playhead />);
    const line = container.firstElementChild as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.style.transform).toBe('translateX(500px)');
  });

  it('hides transport line when currentTime equals playStartTime', () => {
    useTransportStore.setState({ isPlaying: false, currentTime: 2, playStartTime: 2 });
    useUIStore.setState({ pixelsPerSecond: 100, timelineFocused: false, selectedTrackIds: new Set() });
    const { container } = render(<Playhead />);
    expect(container.firstElementChild).toBeNull();
  });
});

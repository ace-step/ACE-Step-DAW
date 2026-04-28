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
    expect(line.style.height).toBe('100%');
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

  it('renders anchor cursor using trackLaneRects cache instead of DOM queries', () => {
    const rects = new Map([['track-a', { top: 50, height: 80 }]]);
    useTransportStore.setState({ isPlaying: false, currentTime: 0, playStartTime: 2 });
    useUIStore.setState({
      pixelsPerSecond: 100,
      timelineFocused: true,
      selectedTrackIds: new Set(['track-a']),
      trackLaneRects: rects,
    });
    const { container } = render(<Playhead />);
    // First child is transport line, second is the anchor cursor
    const children = Array.from(container.children);
    const cursor = children.find(
      (el) => (el as HTMLElement).style.top === '50px' && (el as HTMLElement).style.height === '80px',
    ) as HTMLElement | undefined;
    expect(cursor).not.toBeNull();
    expect(cursor!.style.left).toBe('200px'); // playStartTime=2 * pps=100
  });

  it('does not render anchor cursor when trackLaneRects has no entry for the track', () => {
    useTransportStore.setState({ isPlaying: false, currentTime: 0, playStartTime: 2 });
    useUIStore.setState({
      pixelsPerSecond: 100,
      timelineFocused: true,
      selectedTrackIds: new Set(['track-missing']),
      trackLaneRects: new Map(),
    });
    const { container } = render(<Playhead />);
    // Transport line is shown (currentTime=0 vs playStartTime=2), but no cursor for missing track
    const children = Array.from(container.children);
    // Should only have the transport line
    expect(children.length).toBe(1);
  });
});

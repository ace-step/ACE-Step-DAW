import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { ClipBlock } from '../../src/components/timeline/ClipBlock';
import type { Clip, Track } from '../../src/types/project';

// Mock splitClipAtZeroCrossing
const mockSplitClipAtZeroCrossing = vi.fn().mockResolvedValue(undefined);

const makeClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  trackId: 'track-1',
  startTime: 2.0,
  duration: 4.0,
  prompt: 'test clip',
  generationStatus: 'ready',
  audioOffset: 0,
  audioDuration: 4.0,
  fadeInDuration: 0,
  fadeOutDuration: 0,
  fadeInCurve: 'linear',
  fadeOutCurve: 'linear',
  timeStretchRate: 1,
  pitchShift: 0,
  stretchMode: 'realtime',
  warpMarkers: [],
  muted: false,
  starred: false,
  source: 'generated',
  gainEnvelope: [],
  ...overrides,
});

const makeTrack = (overrides: Partial<Track> = {}): Track => ({
  id: 'track-1',
  trackName: 'drums',
  type: 'stems',
  color: '#ff0000',
  volume: 0.8,
  pan: 0,
  muted: false,
  soloed: false,
  armed: false,
  clips: [],
  effects: [],
  ...overrides,
});

describe('ClipBlock scissor mode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Scissor Test' });

    // Patch splitClipAtZeroCrossing
    useProjectStore.setState({ splitClipAtZeroCrossing: mockSplitClipAtZeroCrossing });
    mockSplitClipAtZeroCrossing.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.style.cursor = '';
  });

  it('does not activate scissor mode if clip is not ready', () => {
    const clip = makeClip({ generationStatus: 'empty' });
    const track = makeTrack({ clips: [clip] });
    const { container } = render(<ClipBlock clip={clip} track={track} />);
    const clipEl = container.querySelector('[data-clip-block]') as HTMLElement;
    if (!clipEl) return;

    // Mock getBoundingClientRect
    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 500, top: 0, bottom: 48, width: 400, height: 48,
      x: 100, y: 0, toJSON: () => {},
    });

    act(() => {
      clipEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 24, button: 0, bubbles: true }));
    });

    // Advance past long-press threshold
    act(() => { vi.advanceTimersByTime(400); });

    // No scissor line should appear (clip is not ready)
    expect(container.querySelector('.pointer-events-none.z-30')).toBeNull();
  });

  it('cancels scissor mode if mouse moves before 300ms', () => {
    const clip = makeClip();
    const track = makeTrack({ clips: [clip] });
    const { container } = render(<ClipBlock clip={clip} track={track} />);
    const clipEl = container.querySelector('[data-clip-block]') as HTMLElement;
    if (!clipEl) return;

    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 500, top: 0, bottom: 48, width: 400, height: 48,
      x: 100, y: 0, toJSON: () => {},
    });

    act(() => {
      clipEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 24, button: 0, bubbles: true }));
    });

    // Move more than 3px before 300ms
    act(() => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 24 }));
    });

    // Advance past threshold
    act(() => { vi.advanceTimersByTime(300); });

    // Scissor should NOT activate because drag started
    expect(mockSplitClipAtZeroCrossing).not.toHaveBeenCalled();
  });

  it('cancels scissor mode on Escape', () => {
    const clip = makeClip();
    const track = makeTrack({ clips: [clip] });
    const { container } = render(<ClipBlock clip={clip} track={track} />);
    const clipEl = container.querySelector('[data-clip-block]') as HTMLElement;
    if (!clipEl) return;

    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 500, top: 0, bottom: 48, width: 400, height: 48,
      x: 100, y: 0, toJSON: () => {},
    });

    act(() => {
      clipEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 24, button: 0, bubbles: true }));
    });

    act(() => { vi.advanceTimersByTime(400); });

    // Press Escape
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    // Should not split
    expect(mockSplitClipAtZeroCrossing).not.toHaveBeenCalled();
    // Cursor should be restored
    expect(document.body.style.cursor).toBe('');
  });

  it('does not execute split on mouseup after primary-button long press', () => {
    const clip = makeClip({ startTime: 2.0, duration: 4.0 });
    const track = makeTrack({ clips: [clip] });

    // Set pixelsPerSecond to 100 for easy calculation
    useUIStore.setState({ pixelsPerSecond: 100 });

    const { container } = render(<ClipBlock clip={clip} track={track} />);
    const clipEl = container.querySelector('[data-clip-block]') as HTMLElement;
    if (!clipEl) return;

    // clipRect: left=200 (startTime 2.0 * 100px/s), width=400 (4.0s * 100px/s)
    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      left: 200, right: 600, top: 0, bottom: 48, width: 400, height: 48,
      x: 200, y: 0, toJSON: () => {},
    });

    // Click at pixel 350 = 150px into clip = startTime + 1.5s = 3.5s
    act(() => {
      clipEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 350, clientY: 24, button: 0, bubbles: true }));
    });

    // Wait for long-press
    act(() => { vi.advanceTimersByTime(400); });

    // Release at same position
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 350, clientY: 24 }));
    });

    expect(mockSplitClipAtZeroCrossing).not.toHaveBeenCalled();
  });

  it('executes split on mouseup after secondary-button long press', () => {
    const clip = makeClip({ startTime: 2.0, duration: 4.0 });
    const track = makeTrack({ clips: [clip] });

    useUIStore.setState({ pixelsPerSecond: 100 });

    const { container } = render(<ClipBlock clip={clip} track={track} />);
    const clipEl = container.querySelector('[data-clip-block]') as HTMLElement;
    if (!clipEl) return;

    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      left: 200, right: 600, top: 0, bottom: 48, width: 400, height: 48,
      x: 200, y: 0, toJSON: () => {},
    });

    act(() => {
      clipEl.dispatchEvent(new MouseEvent('mousedown', { clientX: 350, clientY: 24, button: 2, bubbles: true }));
    });

    act(() => { vi.advanceTimersByTime(400); });

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 350, clientY: 24, button: 2 }));
    });

    expect(mockSplitClipAtZeroCrossing).toHaveBeenCalledOnce();
    expect(mockSplitClipAtZeroCrossing).toHaveBeenCalledWith('clip-1', expect.any(Number));
    const splitTime = mockSplitClipAtZeroCrossing.mock.calls[0][1];
    expect(splitTime).toBeGreaterThan(2.01);
    expect(splitTime).toBeLessThan(5.99);
  });
});

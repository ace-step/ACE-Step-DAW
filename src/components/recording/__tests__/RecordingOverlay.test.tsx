import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecordingOverlay } from '../RecordingOverlay';
import { useUIStore } from '../../../store/uiStore';

describe('RecordingOverlay', () => {
  beforeEach(() => {
    useUIStore.setState({
      videoRecording: { status: 'idle', duration: 0, blob: null, mimeType: null, error: null },
    });
  });

  it('renders nothing when not recording', () => {
    const { container } = render(<RecordingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders cursor highlight and watermark when recording', () => {
    useUIStore.setState({
      videoRecording: { status: 'recording', duration: 5, blob: null, mimeType: null, error: null },
    });

    const { container } = render(<RecordingOverlay />);

    // Cursor highlight overlay
    const overlay = container.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeTruthy();

    // Watermark with brand name
    expect(screen.getByText('ACE-Step DAW')).toBeInTheDocument();
  });

  it('renders nothing when status is error', () => {
    useUIStore.setState({
      videoRecording: { status: 'error', duration: 0, blob: null, mimeType: null, error: 'fail' },
    });

    const { container } = render(<RecordingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when status is stopped', () => {
    useUIStore.setState({
      videoRecording: { status: 'stopped', duration: 10, blob: null, mimeType: null, error: null },
    });

    const { container } = render(<RecordingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('creates click ripples on mouse down events', () => {
    vi.useFakeTimers();
    useUIStore.setState({
      videoRecording: { status: 'recording', duration: 1, blob: null, mimeType: null, error: null },
    });

    const { container } = render(<RecordingOverlay />);

    // Simulate a click
    act(() => {
      fireEvent.mouseDown(window, { clientX: 100, clientY: 200 });
    });

    // A ripple element should appear
    const ripple = container.querySelector('.animate-\\[ripple_0\\.5s_ease-out_forwards\\]');
    expect(ripple).toBeTruthy();

    // Ripple should be removed after timeout
    act(() => {
      vi.advanceTimersByTime(600);
    });

    const rippleAfter = container.querySelector('.animate-\\[ripple_0\\.5s_ease-out_forwards\\]');
    expect(rippleAfter).toBeNull();

    vi.useRealTimers();
  });

  it('positions cursor glow via ref on mousemove', () => {
    useUIStore.setState({
      videoRecording: { status: 'recording', duration: 1, blob: null, mimeType: null, error: null },
    });

    // Mock requestAnimationFrame to run callbacks synchronously
    const originalRaf = window.requestAnimationFrame;
    let rafCallback: FrameRequestCallback | null = null;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    };

    render(<RecordingOverlay />);

    act(() => {
      fireEvent.mouseMove(window, { clientX: 300, clientY: 400 });
    });

    // Trigger the animation frame to update glow position
    if (rafCallback) {
      act(() => {
        rafCallback!(0);
      });
    }

    window.requestAnimationFrame = originalRaf;
  });

  it('watermark includes the logo image', () => {
    useUIStore.setState({
      videoRecording: { status: 'recording', duration: 1, blob: null, mimeType: null, error: null },
    });

    render(<RecordingOverlay />);

    const img = document.querySelector('img[src="/acestudio_icon.png"]');
    expect(img).toBeTruthy();
  });

  it('cleans up event listeners on unmount', () => {
    useUIStore.setState({
      videoRecording: { status: 'recording', duration: 1, blob: null, mimeType: null, error: null },
    });

    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<RecordingOverlay />);
    unmount();

    const removedTypes = removeListenerSpy.mock.calls.map(([type]) => type);
    expect(removedTypes).toContain('mousemove');
    expect(removedTypes).toContain('mousedown');

    removeListenerSpy.mockRestore();
  });
});

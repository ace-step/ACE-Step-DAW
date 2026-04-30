import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TrackHeaderMeter } from '../TrackHeaderMeter';

// Mock the audio engine
const engine = {
  getTrackMeter: vi.fn().mockReturnValue({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false }),
  resetTrackClip: vi.fn(),
};

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => engine,
  getTauriPlaybackClockOwner: () => 'web-audio',
}));

describe('TrackHeaderMeter', () => {
  let rafCallbacks: Array<FrameRequestCallback>;
  let rafId: number;

  beforeEach(() => {
    engine.getTrackMeter.mockReset().mockReturnValue({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false });
    engine.resetTrackClip.mockReset();
    rafCallbacks = [];
    rafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafId++;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function tickFrame(leftLevel: number, rightLevel: number, clipped = false) {
    engine.getTrackMeter.mockReturnValue({
      level: Math.max(leftLevel, rightLevel),
      leftLevel,
      rightLevel,
      clipped,
    });
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb(performance.now()));
  }

  it('renders the stereo meter with left and right bars', () => {
    render(<TrackHeaderMeter trackId="track-1" />);
    expect(screen.getByTestId('meter-left')).toBeInTheDocument();
    expect(screen.getByTestId('meter-right')).toBeInTheDocument();
  });

  it('shows clip indicator when engine reports clipping', () => {
    render(<TrackHeaderMeter trackId="track-1" />);
    act(() => tickFrame(1.0, 1.0, true));

    const clipIndicator = screen.getByTestId('clip-indicator');
    expect(clipIndicator.className).toMatch(/bg-red/);
  });

  it('cleans up animation frame on unmount', () => {
    const { unmount } = render(<TrackHeaderMeter trackId="track-1" />);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});

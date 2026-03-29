import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StereoMeter } from '../StereoMeter';

// Mock the audio engine
const engine = {
  getTrackMeter: vi.fn().mockReturnValue({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false }),
  resetTrackClip: vi.fn(),
};

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => engine,
}));

describe('StereoMeter', () => {
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

  it('renders two horizontal level bars (left and right)', () => {
    render(<StereoMeter trackId="track-1" />);
    expect(screen.getByTestId('meter-left')).toBeInTheDocument();
    expect(screen.getByTestId('meter-right')).toBeInTheDocument();
  });

  it('has accessible labels on the bars', () => {
    render(<StereoMeter trackId="track-1" />);
    expect(screen.getByLabelText(/left channel/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/right channel/i)).toBeInTheDocument();
  });

  it('reflects left and right levels as bar fill positions', () => {
    render(<StereoMeter trackId="track-1" />);
    act(() => tickFrame(0.5, 0.25));

    const leftBar = screen.getByTestId('meter-left');
    const rightBar = screen.getByTestId('meter-right');
    // The mask div uses `left` to reveal the gradient underneath.
    // Higher level = larger left value = more gradient visible.
    const leftPos = parseFloat(leftBar.style.left);
    const rightPos = parseFloat(rightBar.style.left);
    expect(leftPos).toBeGreaterThan(0);
    expect(rightPos).toBeGreaterThan(0);
    // Left (louder) should reveal more gradient than right
    expect(leftPos).toBeGreaterThan(rightPos);
  });

  it('shows clip indicator when clipped', () => {
    render(<StereoMeter trackId="track-1" />);
    act(() => tickFrame(1.0, 1.0, true));

    const clipIndicator = screen.getByTestId('clip-indicator');
    expect(clipIndicator.className).toMatch(/bg-red/);
  });

  it('clip indicator resets on click', () => {
    render(<StereoMeter trackId="track-1" />);
    act(() => tickFrame(1.0, 1.0, true));

    const clipIndicator = screen.getByTestId('clip-indicator');
    fireEvent.click(clipIndicator);

    expect(engine.resetTrackClip).toHaveBeenCalledWith('track-1');

    act(() => tickFrame(0.1, 0.1));
    expect(screen.getByTestId('clip-indicator').className).not.toMatch(/bg-red/);
  });

  it('bars show zero fill when level is silent (-60dB or below)', () => {
    render(<StereoMeter trackId="track-1" />);
    act(() => tickFrame(0, 0));

    const leftBar = screen.getByTestId('meter-left');
    const rightBar = screen.getByTestId('meter-right');
    // Silence = mask starts at 0%, covering the entire gradient
    expect(leftBar.style.left).toBe('0%');
    expect(rightBar.style.left).toBe('0%');
  });

  it('cleans up animation frame on unmount', () => {
    const { unmount } = render(<StereoMeter trackId="track-1" />);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});

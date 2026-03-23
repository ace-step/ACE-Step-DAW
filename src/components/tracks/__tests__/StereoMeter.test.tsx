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

  it('renders two vertical level bars (left and right)', () => {
    render(<StereoMeter trackId="track-1" />);
    expect(screen.getByTestId('meter-left')).toBeInTheDocument();
    expect(screen.getByTestId('meter-right')).toBeInTheDocument();
  });

  it('has accessible labels on the bars', () => {
    render(<StereoMeter trackId="track-1" />);
    expect(screen.getByLabelText(/left channel/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/right channel/i)).toBeInTheDocument();
  });

  it('reflects left and right levels as bar fill heights', () => {
    render(<StereoMeter trackId="track-1" />);
    // -30 dB maps to ((-30) + 60) / 60 = 0.5 => 50%
    // linear value for -30dB = 10^(-30/20) ≈ 0.0316
    // But the meter receives dB values from the engine already? No — engine returns linear levels.
    // The component converts: height = Math.max(0, Math.min(1, (level_in_dB + 60) / 60))
    // For leftLevel=0.5 (linear), dB = 20*log10(0.5) ≈ -6.02, height = (-6.02+60)/60 ≈ 0.8997
    act(() => tickFrame(0.5, 0.25));

    const leftBar = screen.getByTestId('meter-left');
    const rightBar = screen.getByTestId('meter-right');
    // Left: 0.5 linear => -6.02 dB => (53.98)/60 ≈ 89.97%
    // Right: 0.25 linear => -12.04 dB => (47.96)/60 ≈ 79.93%
    expect(leftBar.style.height).not.toBe('0%');
    expect(rightBar.style.height).not.toBe('0%');
    // Left should be taller than right
    const leftHeight = parseFloat(leftBar.style.height);
    const rightHeight = parseFloat(rightBar.style.height);
    expect(leftHeight).toBeGreaterThan(rightHeight);
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

  it('bars show zero height when level is silent (-60dB or below)', () => {
    render(<StereoMeter trackId="track-1" />);
    act(() => tickFrame(0, 0));

    const leftBar = screen.getByTestId('meter-left');
    const rightBar = screen.getByTestId('meter-right');
    expect(leftBar.style.height).toBe('0%');
    expect(rightBar.style.height).toBe('0%');
  });

  it('cleans up animation frame on unmount', () => {
    const { unmount } = render(<StereoMeter trackId="track-1" />);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});

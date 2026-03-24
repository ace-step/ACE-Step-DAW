import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaveformPreview } from '../WaveformPreview';
import { PEAK_STRIDE } from '../../../utils/waveformPeaks';

function makeStereopeaks(count: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = Math.sin((i / count) * Math.PI);
    peaks.push(val, -val * 0.8, val * 0.9, -val * 0.7); // Lmax, Lmin, Rmax, Rmin
  }
  return peaks;
}

describe('WaveformPreview', () => {
  it('renders empty state when peaks array is empty', () => {
    render(
      <WaveformPreview
        peaks={[]}
        color="#14b8a6"
        height={40}
        playbackProgress={0}
        data-testid="waveform"
      />,
    );
    expect(screen.getByText('No waveform data')).toBeInTheDocument();
  });

  it('renders SVG waveform path for stereo peaks', () => {
    const peaks = makeStereopeaks(60);
    expect(peaks.length).toBe(60 * PEAK_STRIDE);

    render(
      <WaveformPreview
        peaks={peaks}
        color="#14b8a6"
        height={40}
        playbackProgress={0}
        data-testid="waveform"
      />,
    );
    expect(screen.getByTestId('waveform')).toBeInTheDocument();
    expect(screen.getByTestId('waveform-path')).toBeInTheDocument();
  });

  it('renders simple amplitude peaks', () => {
    const peaks = [0.2, 0.5, 0.8, 0.6, 0.3];
    render(
      <WaveformPreview
        peaks={peaks}
        color="#f43f5e"
        height={40}
        playbackProgress={0}
        data-testid="waveform"
      />,
    );
    expect(screen.getByTestId('waveform-path')).toBeInTheDocument();
  });

  it('shows progress overlay when playbackProgress > 0', () => {
    const peaks = makeStereopeaks(60);
    render(
      <WaveformPreview
        peaks={peaks}
        color="#14b8a6"
        height={40}
        playbackProgress={0.5}
        data-testid="waveform"
      />,
    );
    const progressEl = screen.getByTestId('waveform-progress');
    expect(progressEl).toBeInTheDocument();
    expect(progressEl.style.width).toBe('50%');
  });

  it('does not show progress overlay when playbackProgress is 0', () => {
    const peaks = makeStereopeaks(60);
    render(
      <WaveformPreview
        peaks={peaks}
        color="#14b8a6"
        height={40}
        playbackProgress={0}
        data-testid="waveform"
      />,
    );
    expect(screen.queryByTestId('waveform-progress')).not.toBeInTheDocument();
  });

  it('calls onSeek with normalized position when clicked', () => {
    const peaks = makeStereopeaks(60);
    const onSeek = vi.fn();
    render(
      <WaveformPreview
        peaks={peaks}
        color="#14b8a6"
        height={40}
        playbackProgress={0}
        onSeek={onSeek}
        data-testid="waveform"
      />,
    );
    const el = screen.getByTestId('waveform');
    // Mock getBoundingClientRect
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 40,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.click(el, { clientX: 100, clientY: 20 });
    expect(onSeek).toHaveBeenCalledWith(0.5);
  });

  it('clamps seek to 0-1 range', () => {
    const peaks = makeStereopeaks(60);
    const onSeek = vi.fn();
    render(
      <WaveformPreview
        peaks={peaks}
        color="#14b8a6"
        height={40}
        playbackProgress={0}
        onSeek={onSeek}
        data-testid="waveform"
      />,
    );
    const el = screen.getByTestId('waveform');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 300,
      width: 200,
      top: 0,
      bottom: 40,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => {},
    });
    // Click before the element
    fireEvent.click(el, { clientX: 50, clientY: 20 });
    expect(onSeek).toHaveBeenCalledWith(0);
  });
});

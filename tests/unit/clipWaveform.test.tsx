import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClipWaveform } from '../../src/components/timeline/ClipWaveform';
import { PEAK_STRIDE } from '../../src/utils/waveformPeaks';

/** Create stereo min/max peaks: [Lmax, Lmin, Rmax, Rmin, ...] */
function makePeaks(count: number, fillMax = 0.5, fillMin = -0.5): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push(fillMax, fillMin, fillMax, fillMin);
  }
  return peaks;
}

describe('ClipWaveform', () => {
  it('renders audible content inset when the clip has a silent lead-in', () => {
    const { container } = render(
      <div style={{ width: 500, height: 80 }}>
        <ClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={5}
          contentOffset={1}
          width={500}
          color="#22c55e"
        />
      </div>,
    );

    // 4 paths: 2 filled (L+R channel) + 2 peak envelope lines
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.length).toBe(4);
    const d = paths[0].getAttribute('d') ?? '';
    // First M command sets the starting X — should be offset by contentOffset
    const match = d.match(/^M\s+([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(100);
  });

  it('fills the clip width when repitch stretch is active', () => {
    const { container } = render(
      <div style={{ width: 600, height: 80 }}>
        <ClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={6}
          contentOffset={1}
          timeStretchRate={4 / 6}
          stretchMode="repitch"
          width={600}
          color="#60a5fa"
        />
      </div>,
    );

    // 4 paths: 2 filled (L+R channel) + 2 peak envelope lines
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.length).toBe(4);
    const d = paths[0].getAttribute('d') ?? '';
    const match = d.match(/^M\s+([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(1); // starts near x=0
  });

  it('renders dual-channel with left and right channel paths', () => {
    // 2 logical peaks × PEAK_STRIDE = 8 values
    const peaks = [
      0.8, -0.3, 0.2, -0.9,  // peak 0: L(max=0.8, min=-0.3), R(max=0.2, min=-0.9)
      0.6, -0.5, 0.4, -0.6,  // peak 1: L(max=0.6, min=-0.5), R(max=0.4, min=-0.6)
    ];
    expect(peaks.length).toBe(2 * PEAK_STRIDE);

    const { container } = render(
      <div style={{ width: 200, height: 80 }}>
        <ClipWaveform
          peaks={peaks}
          audioDuration={2}
          audioOffset={0}
          clipDuration={2}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    // 4 paths: 2 filled (L+R channel) + 2 peak envelope lines
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.length).toBe(4);
    expect(paths[0].getAttribute('data-testid')).toBe('waveform-left-channel');
    expect(paths[1].getAttribute('data-testid')).toBe('waveform-right-channel');

    // Verify the center divider line exists
    const lines = Array.from(container.querySelectorAll('line'));
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute('y1')).toBe('50');
  });
});

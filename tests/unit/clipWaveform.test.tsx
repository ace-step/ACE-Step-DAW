import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClipWaveform } from '../../src/components/timeline/ClipWaveform';

describe('ClipWaveform', () => {
  it('renders audible content inset when the clip has a silent lead-in', () => {
    const { container } = render(
      <div style={{ width: 500, height: 80 }}>
        <ClipWaveform
          peaks={Array.from({ length: 64 }, (_, index) => ((index % 5) + 1) / 5)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={5}
          contentOffset={1}
          width={500}
          color="#22c55e"
        />
      </div>,
    );

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(0);
    expect(Number(rects[0].getAttribute('x'))).toBeGreaterThanOrEqual(100);
  });

  it('fills the clip width when repitch stretch is active', () => {
    const { container } = render(
      <div style={{ width: 600, height: 80 }}>
        <ClipWaveform
          peaks={Array.from({ length: 64 }, (_, index) => ((index % 7) + 1) / 7)}
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

    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(0);
    expect(Number(rects[0].getAttribute('x'))).toBe(0);
  });
});

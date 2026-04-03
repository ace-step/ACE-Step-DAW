import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LevelMeter } from '../LevelMeter';

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackMeter: () => ({ level: 0.5, leftLevel: 0.4, rightLevel: 0.6, clipped: false }),
    getMasterMeter: () => ({ level: 0.3, clipped: false }),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
  }),
}));

describe('LevelMeter', () => {
  it('renders with level-meter testid', () => {
    render(<LevelMeter trackId="track-1" />);
    const meter = screen.getByTestId('level-meter');
    expect(meter).not.toBeUndefined();
  });

  it('renders a canvas element for meter display', () => {
    render(<LevelMeter trackId="track-1" />);
    const canvas = screen.getByTestId('meter-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
  });

  it('renders with correct aria-label for track meter', () => {
    render(<LevelMeter trackId="track-1" />);
    const canvas = screen.getByTestId('meter-canvas');
    expect(canvas.getAttribute('aria-label')).toBe('Mixer level meter for track-1');
  });

  it('renders with correct aria-label for master stage', () => {
    render(<LevelMeter masterStage="output" />);
    const canvas = screen.getByTestId('meter-canvas');
    expect(canvas.getAttribute('aria-label')).toBe('Master output level meter');
  });

  it('renders stereo bars by default for track meters (wider container)', () => {
    render(<LevelMeter trackId="track-1" />);
    const container = screen.getByTestId('level-meter');
    // Stereo: BAR_WIDTH(4)*2 + BAR_GAP(1) + 6 = 15px
    expect(container.style.width).toBe('15px');
  });

  it('renders mono bar for master stage by default', () => {
    render(<LevelMeter masterStage="input" />);
    const container = screen.getByTestId('level-meter');
    // Mono: BAR_WIDTH(4) + 6 = 10px
    expect(container.style.width).toBe('10px');
  });

  it('can force stereo=false for tracks', () => {
    render(<LevelMeter trackId="track-1" stereo={false} />);
    const container = screen.getByTestId('level-meter');
    // Mono: BAR_WIDTH(4) + 6 = 10px
    expect(container.style.width).toBe('10px');
  });

  it('renders clip indicator button initially hidden', () => {
    render(<LevelMeter trackId="track-1" />);
    const clipBtn = screen.getByTitle('Reset clip indicator');
    expect(clipBtn.style.display).toBe('none');
  });
});

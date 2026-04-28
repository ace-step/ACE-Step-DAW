import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelMeter } from '../../src/components/mixer/LevelMeter';

const engine = {
  getTrackMeter: vi.fn(),
  getMasterMeter: vi.fn(),
  resetTrackClip: vi.fn(),
  resetMasterClip: vi.fn(),
  getTrackLevel: vi.fn(),
  getMasterLevel: vi.fn(),
};

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => engine,
}));

describe('LevelMeter', () => {
  beforeEach(() => {
    engine.getTrackMeter.mockReset();
    engine.getMasterMeter.mockReset();
    engine.resetTrackClip.mockReset();
    engine.resetMasterClip.mockReset();
    engine.getTrackLevel.mockReset();
    engine.getMasterLevel.mockReset();

    engine.getTrackMeter.mockReturnValue({ level: 0.5, leftLevel: 0.4, rightLevel: 0.6, clipped: false });
    engine.getMasterMeter.mockReturnValue({ level: 0.3, clipped: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a canvas element with correct aria-label for track meter', () => {
    render(<LevelMeter trackId="track-1" />);
    const canvas = screen.getByTestId('meter-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
    expect(canvas.getAttribute('aria-label')).toBe('Mixer level meter for track-1');
  });

  it('renders a canvas with master aria-label for master stage', () => {
    render(<LevelMeter masterStage="output" />);
    const canvas = screen.getByTestId('meter-canvas');
    expect(canvas.getAttribute('aria-label')).toBe('Master output level meter');
  });

  it('renders clip indicator button (initially hidden)', () => {
    render(<LevelMeter trackId="track-1" />);
    const clipBtn = screen.getByTitle('Reset clip indicator');
    expect(clipBtn.style.display).toBe('none');
  });

  it('renders stereo width for track meters by default', () => {
    render(<LevelMeter trackId="track-1" />);
    const container = screen.getByTestId('level-meter');
    // Stereo: BAR_WIDTH(4)*2 + BAR_GAP(1) + 6 = 15px
    expect(container.style.width).toBe('15px');
  });
});

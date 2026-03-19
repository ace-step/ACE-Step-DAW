import { act, fireEvent, render, screen } from '@testing-library/react';
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
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    rafCallback = null;
    engine.getTrackMeter.mockReset();
    engine.getMasterMeter.mockReset();
    engine.resetTrackClip.mockReset();
    engine.resetMasterClip.mockReset();
    engine.getTrackLevel.mockReset();
    engine.getMasterLevel.mockReset();

    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function runFrame() {
    if (!rafCallback) throw new Error('No animation frame scheduled');
    const cb = rafCallback;
    rafCallback = null;
    act(() => {
      cb(performance.now());
    });
  }

  it('holds the peak marker after the current level falls', () => {
    engine.getTrackMeter
      .mockReturnValueOnce({ level: 0.8, clipped: false })
      .mockReturnValue({ level: 0.2, clipped: false });

    render(<LevelMeter trackId="track-1" />);

    runFrame();
    runFrame();

    expect(screen.getByLabelText('Mixer level meter for track-1')).toBeInTheDocument();
    expect(screen.getByTestId('meter-level-fill')).toHaveStyle({ height: '20%' });
    expect(screen.getByTestId('meter-peak-hold')).toHaveStyle({ bottom: 'calc(80% - 1px)' });
  });

  it('shows a resettable clip indicator when the engine reports clipping', () => {
    engine.getTrackMeter
      .mockReturnValueOnce({ level: 1, clipped: true })
      .mockReturnValue({ level: 0.2, clipped: false });

    render(<LevelMeter trackId="track-1" />);

    runFrame();

    const resetButton = screen.getByRole('button', { name: 'Reset clip indicator for track-1' });
    fireEvent.click(resetButton);

    expect(engine.resetTrackClip).toHaveBeenCalledWith('track-1');
    expect(screen.queryByRole('button', { name: 'Reset clip indicator for track-1' })).not.toBeInTheDocument();
  });
});

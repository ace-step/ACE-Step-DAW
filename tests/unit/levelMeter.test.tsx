import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelMeter } from '../../src/components/mixer/LevelMeter';

const mocks = vi.hoisted(() => ({
  owner: 'web-audio' as 'native' | 'web-audio',
  engine: {
    getTrackMeter: vi.fn(),
    getMasterMeter: vi.fn(),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
    getTrackLevel: vi.fn(),
    getMasterLevel: vi.fn(),
  },
  bridge: {
    backend: 'tauri' as const,
    getTrackMeter: vi.fn(),
    getMasterMeter: vi.fn(),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
  },
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => mocks.engine,
  getTauriPlaybackClockOwner: () => mocks.owner,
}));

vi.mock('../../src/engine/bridge', () => ({
  getAudioBridge: () => mocks.bridge,
}));

describe('LevelMeter', () => {
  let rafCallbacks: Array<FrameRequestCallback>;

  beforeEach(() => {
    mocks.owner = 'web-audio';
    rafCallbacks = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    mocks.engine.getTrackMeter.mockReset();
    mocks.engine.getMasterMeter.mockReset();
    mocks.engine.resetTrackClip.mockReset();
    mocks.engine.resetMasterClip.mockReset();
    mocks.engine.getTrackLevel.mockReset();
    mocks.engine.getMasterLevel.mockReset();
    mocks.bridge.getTrackMeter.mockReset();
    mocks.bridge.getMasterMeter.mockReset();
    mocks.bridge.resetTrackClip.mockReset();
    mocks.bridge.resetMasterClip.mockReset();

    mocks.engine.getTrackMeter.mockReturnValue({ level: 0.5, leftLevel: 0.4, rightLevel: 0.6, clipped: false });
    mocks.engine.getMasterMeter.mockReturnValue({ level: 0.3, clipped: false });
    mocks.bridge.getTrackMeter.mockReturnValue({ level: 0.9, leftLevel: 0.8, rightLevel: 0.9, clipped: false });
    mocks.bridge.getMasterMeter.mockReturnValue({ level: 0.7, clipped: false });
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

  it('reads WebAudio meters when Tauri playback falls back to WebAudio', () => {
    render(<LevelMeter trackId="track-1" />);
    rafCallbacks.shift()?.(performance.now());

    expect(mocks.engine.getTrackMeter).toHaveBeenCalledWith('track-1');
    expect(mocks.bridge.getTrackMeter).not.toHaveBeenCalled();
  });

  it('reads native bridge meters when native playback owns the clock', () => {
    mocks.owner = 'native';

    render(<LevelMeter trackId="track-1" />);
    rafCallbacks.shift()?.(performance.now());

    expect(mocks.bridge.getTrackMeter).toHaveBeenCalledWith('track-1');
    expect(mocks.engine.getTrackMeter).not.toHaveBeenCalled();
  });

  it('resets clip state on the active meter source', () => {
    mocks.owner = 'native';

    render(<LevelMeter trackId="track-1" />);
    fireEvent.click(screen.getByTitle('Reset clip indicator'));

    expect(mocks.bridge.resetTrackClip).toHaveBeenCalledWith('track-1');
    expect(mocks.engine.resetTrackClip).not.toHaveBeenCalled();
  });
});

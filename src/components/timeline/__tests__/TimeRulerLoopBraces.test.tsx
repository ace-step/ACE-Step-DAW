import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { TimeRuler } from '../TimeRuler';

// Mock projectStorage to avoid browser API issues
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// Mock Tone.js-related hooks
vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    startScrub: vi.fn(),
    scrubTo: vi.fn(),
    endScrub: vi.fn(),
  }),
}));

const DEFAULT_PROJECT = {
  id: 'test-project',
  name: 'Test',
  bpm: 120,
  timeSignature: 4,
  totalDuration: 60,
  tracks: [],
  tempoMap: [],
  timeSignatureMap: [],
  sampleRate: 44100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('TimeRuler loop region braces', () => {
  beforeEach(() => {
    useTransportStore.setState({
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
      currentTime: 0,
      isScrubbing: false,
    });
    useUIStore.setState({ pixelsPerSecond: 50 });
    useProjectStore.setState({ project: DEFAULT_PROJECT as never });
  });

  it('does not render loop region when loop is disabled', () => {
    useTransportStore.setState({ loopEnabled: false, loopStart: 4, loopEnd: 8 });
    render(<TimeRuler />);
    expect(screen.queryByTestId('timeline-loop-region')).toBeNull();
  });

  it('does not render loop region when loopEnd <= loopStart', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 5, loopEnd: 5 });
    render(<TimeRuler />);
    expect(screen.queryByTestId('timeline-loop-region')).toBeNull();
  });

  it('renders loop region with highlight when loop is enabled and range is valid', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const region = screen.getByTestId('timeline-loop-region');
    expect(region).toBeTruthy();
    // Should have a gradient background for the highlight band
    expect(region.style.background).toContain('linear-gradient');
  });

  it('positions the loop region correctly based on pixelsPerSecond', () => {
    const pps = 50;
    useUIStore.setState({ pixelsPerSecond: pps });
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const region = screen.getByTestId('timeline-loop-region');
    expect(region.style.left).toBe(`${2 * pps}px`);
    expect(region.style.width).toBe(`${(6 - 2) * pps}px`);
  });

  it('renders start handle with correct aria attributes', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-start-handle');
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.getAttribute('aria-label')).toBe('Adjust loop start');
    expect(handle.getAttribute('aria-valuenow')).toBe('2');
  });

  it('renders end handle with correct aria attributes', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-end-handle');
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.getAttribute('aria-label')).toBe('Adjust loop end');
    expect(handle.getAttribute('aria-valuenow')).toBe('6');
  });

  it('renders move handle for center-drag', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-move-handle');
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('aria-label')).toBe('Move loop region');
  });

  it('start handle has col-resize cursor styling', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-start-handle');
    expect(handle.className).toContain('cursor-col-resize');
  });

  it('end handle has col-resize cursor styling', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-end-handle');
    expect(handle.className).toContain('cursor-col-resize');
  });

  it('move handle has grab cursor styling', () => {
    useTransportStore.setState({ loopEnabled: true, loopStart: 2, loopEnd: 6 });
    render(<TimeRuler />);
    const handle = screen.getByTestId('timeline-loop-move-handle');
    expect(handle.className).toContain('cursor-grab');
  });

  describe('store-level loop region interactions', () => {
    it('setLoopRegion updates loopStart and loopEnd', () => {
      const store = useTransportStore.getState();
      store.setLoopRegion(3, 10);
      const state = useTransportStore.getState();
      expect(state.loopStart).toBe(3);
      expect(state.loopEnd).toBe(10);
    });

    it('setLoopRegion normalizes inverted range', () => {
      const store = useTransportStore.getState();
      store.setLoopRegion(10, 3);
      const state = useTransportStore.getState();
      expect(state.loopStart).toBe(3);
      expect(state.loopEnd).toBe(10);
    });

    it('setLoopRegion clamps negative values to 0', () => {
      const store = useTransportStore.getState();
      store.setLoopRegion(-5, 10);
      const state = useTransportStore.getState();
      expect(state.loopStart).toBe(0);
      expect(state.loopEnd).toBe(10);
    });

    it('toggleLoop toggles loopEnabled', () => {
      expect(useTransportStore.getState().loopEnabled).toBe(false);
      useTransportStore.getState().toggleLoop();
      expect(useTransportStore.getState().loopEnabled).toBe(true);
      useTransportStore.getState().toggleLoop();
      expect(useTransportStore.getState().loopEnabled).toBe(false);
    });
  });

  describe('snap behavior utility', () => {
    it('snapToGrid snaps time to beat boundaries at 120 BPM', async () => {
      const { snapToGrid } = await import('../../../utils/time');
      // At 120 BPM, one beat = 0.5s
      const snapped = snapToGrid(0.7, 120, 1);
      // Should snap to nearest beat: 0.5 or 1.0
      expect(snapped === 0.5 || snapped === 1.0).toBe(true);
    });
  });

  describe('keyboard shortcut for loop toggle', () => {
    it('transport.loop shortcut defaults to KeyL', async () => {
      const { SHORTCUT_ACTIONS } = await import('../../../constants/shortcutDefaults');
      const loopAction = SHORTCUT_ACTIONS.find((a) => a.id === 'transport.loop');
      expect(loopAction).toBeTruthy();
      expect(loopAction!.defaultCombo.code).toBe('KeyL');
    });
  });
});

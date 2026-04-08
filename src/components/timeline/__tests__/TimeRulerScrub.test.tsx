import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRuler } from '../TimeRuler';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useTransportStore } from '../../../store/transportStore';

const mockSeek = vi.fn();

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    seek: mockSeek,
  }),
}));

function setupProject() {
  useProjectStore.setState({
    project: {
      id: 'test',
      name: 'Test',
      bpm: 120,
      timeSignature: 4,
      totalDuration: 60,
      tracks: [],
      key: 'C',
      scale: 'major',
      generationDefaults: { model: '', tags: '', lyrics: '' },
      globalEffects: [],
      tempoMap: [],
      timeSignatureMap: [],
      masterVolume: 1,
      version: 1,
    } as any,
  });
  useUIStore.setState({ pixelsPerSecond: 50, timelineViewportWidth: 1000 });
  useTransportStore.setState({
    currentTime: 0,
    playStartTime: 0,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    isPlaying: false,
    isScrubbing: false,
    scrubAnchorTime: null,
    scrubResumeOnRelease: false,
    scrubPreviewRate: 0,
  });
}

describe('TimeRuler scrubbing (Alt+drag)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProject();
  });

  it('Alt+click starts scrubbing in transport store', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Alt+click at x=250 → 250/50 = 5s
    fireEvent.pointerDown(ruler, {
      clientX: 250,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: true,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(true);
    expect(state.currentTime).toBe(5);
    expect(state.scrubAnchorTime).toBe(5);
  });

  it('Alt+click during playback sets scrubResumeOnRelease', () => {
    useTransportStore.setState({ isPlaying: true });
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    fireEvent.pointerDown(ruler, {
      clientX: 500,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: true,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(true);
    expect(state.scrubResumeOnRelease).toBe(true);
    // Scrub mode pauses playback
    expect(state.isPlaying).toBe(false);
  });

  it('Alt+drag updates scrub position', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Start scrub at x=100
    fireEvent.pointerDown(ruler, {
      clientX: 100,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: true,
    });

    // Drag to x=300 (exceeds threshold of 3px)
    fireEvent.pointerMove(ruler, {
      clientX: 300,
      clientY: 10,
      pointerId: 1,
      altKey: true,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(true);
    // 300/50 = 6s
    expect(state.currentTime).toBe(6);
  });

  it('releasing after scrub ends scrub mode', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Start scrub
    fireEvent.pointerDown(ruler, {
      clientX: 100,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: true,
    });

    expect(useTransportStore.getState().isScrubbing).toBe(true);

    // Release
    fireEvent.pointerUp(ruler, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(false);
    expect(state.scrubAnchorTime).toBeNull();
  });

  it('normal click (no Alt) does NOT start scrubbing', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    fireEvent.pointerDown(ruler, {
      clientX: 250,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: false,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(false);
    // But seek should happen
    expect(state.currentTime).toBe(5);
  });

  it('normal drag (no Alt) creates loop region, not scrub', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    fireEvent.pointerDown(ruler, {
      clientX: 100,
      clientY: 10,
      button: 0,
      pointerId: 1,
      altKey: false,
    });

    // Drag past threshold
    fireEvent.pointerMove(ruler, {
      clientX: 300,
      clientY: 10,
      pointerId: 1,
    });

    const state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(false);
    expect(state.loopEnabled).toBe(true);
    // Loop region: 100/50=2s to 300/50=6s
    expect(state.loopStart).toBe(2);
    expect(state.loopEnd).toBe(6);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Timeline } from '../../src/components/timeline/Timeline';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => ({
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    startScrub: vi.fn(),
    scrubTo: vi.fn(),
    endScrub: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importMultipleFiles: vi.fn(),
    importLoopToTrack: vi.fn(),
    importAssetToTrack: vi.fn(),
    importAudioFileAsNewQuickSampler: vi.fn(),
    importAssetAsQuickSampler: vi.fn(),
  }),
}));

vi.mock('../../src/components/timeline/TimeRuler', () => ({
  TimeRuler: () => <div data-testid="time-ruler" />,
}));

vi.mock('../../src/components/timeline/ArrangementMarkers', () => ({
  ArrangementMarkers: () => <div data-testid="arrangement-markers" />,
}));

vi.mock('../../src/components/timeline/GridOverlay', () => ({
  GridOverlay: () => <div data-testid="grid-overlay" />,
}));

vi.mock('../../src/components/timeline/Playhead', () => ({
  Playhead: () => <div data-testid="playhead" />,
}));

vi.mock('../../src/components/timeline/Minimap', () => ({
  Minimap: () => <div data-testid="minimap" />,
}));

vi.mock('../../src/components/timeline/TempoLane', () => ({
  TempoLane: () => <div data-testid="tempo-lane" />,
}));

vi.mock('../../src/components/timeline/TimeSignatureLane', () => ({
  TimeSignatureLane: () => <div data-testid="time-signature-lane" />,
}));

vi.mock('../../src/components/tracks/TrackHeader', () => ({
  TrackHeader: ({ track }: { track: { id: string } }) => (
    <div data-track-column-region="true" data-track-id={track.id} data-testid={`track-header-${track.id}`} />
  ),
}));

vi.mock('../../src/components/tracks/TrackListDisplayToggle', () => ({
  TrackListDisplayToggle: () => <button type="button" aria-label="Toggle track list display">toggle</button>,
}));

vi.mock('../../src/components/timeline/TrackLane', () => ({
  TrackLane: ({ track }: { track: { id: string } }) => (
    <div data-timeline-lane data-track-id={track.id} data-testid={`track-lane-${track.id}`} />
  ),
}));

vi.mock('../../src/components/generation/MultiTrackGenerateModal', () => ({
  MultiTrackGenerateModal: () => null,
}));

vi.mock('../../src/components/generation/RegionRegenerateModal', () => ({
  RegionRegenerateModal: () => null,
}));

vi.mock('../../src/components/timeline/RegionContextMenu', () => ({
  RegionContextMenu: () => null,
}));

vi.mock('../../src/components/timeline/InlineSuggestionBadge', () => ({
  InlineSuggestionBadge: () => null,
}));

describe('Timeline zoom anchor', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Timeline Zoom Anchor Test' });
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setPixelsPerSecond(50);
  });

  it('keeps the time under the cursor fixed when zooming with Cmd/Ctrl+scroll', async () => {
    render(<Timeline />);

    const timeline = screen.getByRole('grid');
    const trackListWidth = useUIStore.getState().trackListWidth;
    Object.defineProperty(timeline, 'scrollLeft', {
      value: 300,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(timeline, 'clientWidth', {
      value: 800,
      configurable: true,
    });

    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });

    const pointerViewportX = 250 - trackListWidth;
    const initialTime = (300 + pointerViewportX) / 50;

    // Dispatch a native WheelEvent (not React synthetic) because the handler
    // is now attached via addEventListener({ passive: false }), not onWheel
    timeline.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -120,
        ctrlKey: true,
        clientX: 250,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(() => {
      expect(useUIStore.getState().pixelsPerSecond).toBeGreaterThan(50);
    });

    const nextPixelsPerSecond = useUIStore.getState().pixelsPerSecond;
    const anchoredTime = ((timeline as HTMLElement).scrollLeft + pointerViewportX) / nextPixelsPerSecond;
    expect(anchoredTime).toBeCloseTo(initialTime, 1);
  });
});

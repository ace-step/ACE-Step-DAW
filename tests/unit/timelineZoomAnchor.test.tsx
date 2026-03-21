import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Timeline } from '../../src/components/timeline/Timeline';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
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

vi.mock('../../src/components/timeline/TrackLane', () => ({
  TrackLane: ({ track }: { track: { id: string } }) => (
    <div data-track-id={track.id} data-testid={`track-lane-${track.id}`} />
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

  it('keeps the time under the cursor fixed when zooming with Cmd/Ctrl+scroll', () => {
    render(<Timeline />);

    const timeline = screen.getByRole('grid');
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

    expect(useUIStore.getState().pixelsPerSecond).toBe(100);
    expect(timeline.scrollLeft).toBe(850);
  });
});

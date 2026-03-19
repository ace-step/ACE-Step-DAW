import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Timeline } from '../../src/components/timeline/Timeline';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useToastStore } from '../../src/hooks/useToast';
import { getTimelineFitViewport } from '../../src/utils/timelineZoom';

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

describe('Timeline zoom requests', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useToastStore.getState().clearToasts();

    useProjectStore.getState().createProject({ name: 'Timeline Zoom Request Test' });
    useUIStore.getState().setPixelsPerSecond(50);
  });

  function setupTimelineViewport(width = 1000) {
    render(<Timeline />);

    const timeline = screen.getByRole('grid');
    Object.defineProperty(timeline, 'scrollLeft', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(timeline, 'clientWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(timeline, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });

    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: 400,
      width,
      height: 400,
      toJSON: () => ({}),
    });

    return timeline;
  }

  it('fits selected clips when the selection zoom request fires', async () => {
    const track = useProjectStore.getState().addTrack('drums');
    const clipA = useProjectStore.getState().addClip(track.id, {
      startTime: 24,
      duration: 4,
      prompt: 'clip-a',
      lyrics: '',
      source: 'generated',
    });
    const clipB = useProjectStore.getState().addClip(track.id, {
      startTime: 30,
      duration: 6,
      prompt: 'clip-b',
      lyrics: '',
      source: 'generated',
    });

    useUIStore.getState().selectClips([clipA.id, clipB.id]);
    const timeline = setupTimelineViewport();
    const expectedViewport = getTimelineFitViewport({ startTime: 24, endTime: 36 }, 1000);

    act(() => {
      useUIStore.getState().zoomTimelineToSelection();
    });

    await vi.waitFor(() => {
      expect(useUIStore.getState().pixelsPerSecond).toBeCloseTo(expectedViewport.pixelsPerSecond, 4);
    });
    expect(timeline.scrollLeft).toBeCloseTo(expectedViewport.scrollLeft, 4);
  });

  it('fits the selected time region when there are no selected clips', async () => {
    useProjectStore.getState().addTrack('bass');
    useUIStore.getState().setSelectWindow({
      startTime: 48,
      endTime: 60,
      trackIds: [useProjectStore.getState().project!.tracks[0].id],
    });
    const timeline = setupTimelineViewport();
    const expectedViewport = getTimelineFitViewport({ startTime: 48, endTime: 60 }, 1000);

    act(() => {
      useUIStore.getState().zoomTimelineToSelection();
    });

    await vi.waitFor(() => {
      expect(useUIStore.getState().pixelsPerSecond).toBeCloseTo(expectedViewport.pixelsPerSecond, 4);
    });
    expect(timeline.scrollLeft).toBeCloseTo(expectedViewport.scrollLeft, 4);
  });

  it('falls back to the full project and shows feedback when nothing is selected', async () => {
    const track = useProjectStore.getState().addTrack('synth');
    useProjectStore.getState().addClip(track.id, {
      startTime: 96,
      duration: 8,
      prompt: 'ending',
      lyrics: '',
      source: 'generated',
    });
    const timeline = setupTimelineViewport();

    act(() => {
      useUIStore.getState().zoomTimelineToSelection();
    });

    await vi.waitFor(() => {
      expect(useUIStore.getState().pixelsPerSecond).toBe(10);
    });
    expect(timeline.scrollLeft).toBe(0);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/zoomed to the full project/i);
  });

  it('fits the entire project when the project zoom request fires', async () => {
    const track = useProjectStore.getState().addTrack('pads');
    useProjectStore.getState().addClip(track.id, {
      startTime: 80,
      duration: 16,
      prompt: 'wide',
      lyrics: '',
      source: 'generated',
    });
    const timeline = setupTimelineViewport();

    act(() => {
      useUIStore.getState().zoomTimelineToProject();
    });

    await vi.waitFor(() => {
      expect(useUIStore.getState().pixelsPerSecond).toBe(10);
    });
    expect(timeline.scrollLeft).toBe(0);
  });
});

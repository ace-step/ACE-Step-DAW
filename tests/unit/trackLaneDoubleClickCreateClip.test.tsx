import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackLane } from '../../src/components/timeline/TrackLane';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importAssetAsQuickSampler: vi.fn(),
    importAudioFileAsSampler: vi.fn(),
    importAudioFileAsNewQuickSampler: vi.fn(),
    importAudioToTrack: vi.fn(),
    importMidiFile: vi.fn(),
    importLoopToTrack: vi.fn(),
    importAssetToTrack: vi.fn(),
    openQuickSamplerFilePicker: vi.fn(),
  }),
}));

vi.mock('../../src/components/timeline/ClipBlock', () => ({
  ClipBlock: () => <div data-testid="clip-block" />,
}));

vi.mock('../../src/components/timeline/TakeLaneStrip', () => ({
  TakeLaneStrip: () => null,
}));

vi.mock('../../src/components/timeline/AutomationLaneView', () => ({
  AutomationLaneView: () => null,
}));

vi.mock('../../src/components/generation/AddLayerModal', () => ({
  AddLayerModal: () => null,
}));

vi.mock('../../src/components/timeline/CrossfadeOverlay', () => ({
  CrossfadeOverlay: () => null,
}));

function doubleClickLane(trackId: string, clientX: number) {
  const lane = screen.getByTestId(`track-lane-${trackId}`);
  Object.defineProperty(lane, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 64,
      right: 1000,
      bottom: 64,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  fireEvent.doubleClick(lane, { clientX });
}

describe('TrackLane double-click clip creation', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Track Lane Double Click Test', bpm: 120, timeSignature: 4 });
    useUIStore.getState().setPixelsPerSecond(100);
  });

  it('creates and selects an empty audio clip on stems tracks and supports undo', () => {
    const track = useProjectStore.getState().addTrack('guitar');

    render(<TrackLane track={track} />);

    doubleClickLane(track.id, 230);

    const updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(updatedTrack.clips).toHaveLength(1);
    expect(updatedTrack.clips[0]).toMatchObject({
      trackId: track.id,
      startTime: 2.5,
      duration: 8,
      prompt: 'Audio Clip',
      source: 'uploaded',
      midiData: undefined,
    });
    expect(useUIStore.getState().selectedClipIds).toEqual(new Set([updatedTrack.clips[0].id]));
    expect(useUIStore.getState().addLayerOpen).toBe(false);

    useProjectStore.getState().undo();

    const undoneTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(undoneTrack.clips).toHaveLength(0);
  });

  it('creates, selects, and opens a new MIDI clip on piano roll tracks', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');

    render(<TrackLane track={track} />);

    doubleClickLane(track.id, 260);

    const updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(updatedTrack.clips).toHaveLength(1);
    expect(updatedTrack.clips[0]).toMatchObject({
      trackId: track.id,
      startTime: 2.5,
      duration: 8,
      prompt: 'MIDI Clip',
      source: 'uploaded',
      midiData: { notes: [], grid: '1/16' },
    });
    expect(useUIStore.getState().selectedClipIds).toEqual(new Set([updatedTrack.clips[0].id]));
    expect(useUIStore.getState().openPianoRollTrackId).toBe(track.id);
    expect(useUIStore.getState().openPianoRollClipId).toBe(updatedTrack.clips[0].id);
  });
});

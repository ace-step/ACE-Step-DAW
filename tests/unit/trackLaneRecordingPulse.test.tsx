import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackLane } from '../../src/components/timeline/TrackLane';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

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

describe('TrackLane recording pulse', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Recording Pulse Test' });
  });

  it('shows pulsing overlay when track is armed and transport is recording', () => {
    const track = useProjectStore.getState().addTrack('vocals');
    useProjectStore.getState().updateTrack(track.id, { armed: true });
    useTransportStore.setState({ isRecording: true });

    const updatedTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    render(<TrackLane track={updatedTrack} />);

    const pulse = screen.getByTestId(`recording-lane-pulse-${track.id}`);
    expect(pulse).toBeInTheDocument();
    expect(pulse.getAttribute('style')).toContain('recording-lane-pulse');
  });

  it('shows pulsing overlay when transport store marks the track as armed', () => {
    const track = useProjectStore.getState().addTrack('vocals');
    useTransportStore.setState({ isRecording: true, armedTrackIds: [track.id] });

    render(<TrackLane track={track} />);

    expect(screen.getByTestId(`recording-lane-pulse-${track.id}`)).toBeInTheDocument();
  });

  it('does NOT show pulsing overlay when track is NOT armed', () => {
    const track = useProjectStore.getState().addTrack('vocals');
    useTransportStore.setState({ isRecording: true });

    render(<TrackLane track={track} />);

    expect(screen.queryByTestId(`recording-lane-pulse-${track.id}`)).not.toBeInTheDocument();
  });

  it('does NOT show pulsing overlay when NOT recording', () => {
    const track = useProjectStore.getState().addTrack('vocals');
    useProjectStore.getState().updateTrack(track.id, { armed: true });
    useTransportStore.setState({ isRecording: false });

    const updatedTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    render(<TrackLane track={updatedTrack} />);

    expect(screen.queryByTestId(`recording-lane-pulse-${updatedTrack.id}`)).not.toBeInTheDocument();
  });
});

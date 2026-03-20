import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('TrackLane empty-lane alignment', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Track Lane Alignment Test' });
  });

  it('marks empty stems lanes with the stronger arrangement surface', () => {
    const track = useProjectStore.getState().addTrack('guitar');

    render(<TrackLane track={track} />);

    const lane = screen.getByTestId(`track-lane-${track.id}`);
    expect(lane).toHaveAttribute('data-lane-surface', 'empty');
    expect(lane.getAttribute('style')).toContain('background-color: var(--color-daw-arrangement-empty-lane-bg)');
    expect(lane.getAttribute('style')).toContain('border-color: var(--color-daw-arrangement-separator)');
  });

  it('keeps populated lanes on the default surface', () => {
    const track = useProjectStore.getState().addTrack('guitar');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 4,
      prompt: 'lane content',
      lyrics: '',
      source: 'generated',
    });
    const populatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;

    render(<TrackLane track={populatedTrack} />);

    const lane = screen.getByTestId(`track-lane-${track.id}`);
    expect(lane).toHaveAttribute('data-lane-surface', 'default');
    expect(lane).not.toHaveStyle({
      backgroundColor: 'var(--color-daw-arrangement-empty-lane-bg)',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackList } from '../../src/components/tracks/TrackList';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/components/tracks/TrackHeader', () => ({
  TrackHeader: ({ track }: { track: { displayName: string } }) => <div>{track.displayName}</div>,
}));

vi.mock('../../src/components/tracks/AddTrackButton', () => ({
  AddTrackButton: () => <div>Add Track</div>,
}));

vi.mock('../../src/components/tracks/TrackHeightPresetSelector', () => ({
  TrackHeightPresetSelector: () => <div>Preset</div>,
}));

describe('TrackList alignment spacers', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Track List Alignment Test' });
  });

  it('keeps the ruler spacer as the first shared top-stack row', () => {
    useProjectStore.getState().addTrack('guitar');

    render(<TrackList />);

    expect(screen.getByText('Tracks').parentElement).toHaveStyle({ height: '24px' });
  });

  it('adds marker and tempo spacers when those top-stack lanes are visible', () => {
    useProjectStore.getState().addTrack('guitar');
    useProjectStore.getState().addMarker(0, 'Intro');
    useUIStore.getState().toggleTempoLane();

    render(<TrackList />);

    expect(screen.getByTestId('tracklist-marker-spacer')).toBeInTheDocument();
    expect(screen.getByTestId('tracklist-tempo-spacer')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteTracksConfirmDialog } from '../DeleteTracksConfirmDialog';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

function setupWithTracks() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  useProjectStore.getState().addTrack('stems');
  const tracks = useProjectStore.getState().project!.tracks;
  return tracks.map((t) => t.id);
}

describe('DeleteTracksConfirmDialog', () => {
  let trackIds: string[];

  beforeEach(() => {
    vi.restoreAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    trackIds = setupWithTracks();
  });

  it('renders nothing when no pending deletes', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [] });
    const { container } = render(<DeleteTracksConfirmDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog for single track deletion', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    render(<DeleteTracksConfirmDialog />);
    expect(screen.getByText('Delete 1 track?')).toBeInTheDocument();
  });

  it('renders dialog for multiple track deletion', () => {
    useUIStore.setState({ pendingDeleteTrackIds: trackIds });
    render(<DeleteTracksConfirmDialog />);
    expect(screen.getByText(`Delete ${trackIds.length} tracks?`)).toBeInTheDocument();
  });

  it('lists track names', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    render(<DeleteTracksConfirmDialog />);
    const track = useProjectStore.getState().project!.tracks[0];
    expect(screen.getByText(track.displayName)).toBeInTheDocument();
  });

  it('shows clip count per track', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    render(<DeleteTracksConfirmDialog />);
    const track = useProjectStore.getState().project!.tracks[0];
    expect(screen.getByText(`${track.clips.length} clips`)).toBeInTheDocument();
  });

  it('shows undo hint', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    render(<DeleteTracksConfirmDialog />);
    expect(screen.getByText(/Cmd\+Z/)).toBeInTheDocument();
  });

  it('has Cancel and Delete buttons', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    render(<DeleteTracksConfirmDialog />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls confirmDeleteTracks on Delete click', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    const confirmSpy = vi.spyOn(useUIStore.getState(), 'confirmDeleteTracks');
    render(<DeleteTracksConfirmDialog />);
    fireEvent.click(screen.getByText('Delete'));
    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it('calls cancelDeleteTracks on Cancel click', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    const cancelSpy = vi.spyOn(useUIStore.getState(), 'cancelDeleteTracks');
    render(<DeleteTracksConfirmDialog />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it('calls cancelDeleteTracks on close button click', () => {
    useUIStore.setState({ pendingDeleteTrackIds: [trackIds[0]] });
    const cancelSpy = vi.spyOn(useUIStore.getState(), 'cancelDeleteTracks');
    render(<DeleteTracksConfirmDialog />);
    fireEvent.click(screen.getByLabelText('Close delete confirmation'));
    expect(cancelSpy).toHaveBeenCalledOnce();
  });
});

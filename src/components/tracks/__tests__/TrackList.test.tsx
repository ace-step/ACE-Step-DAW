import type { DragEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrackList } from '../TrackList';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../TrackListDisplayToggle', () => ({
  TrackListDisplayToggle: () => <div data-testid="track-list-display-toggle" />,
}));

vi.mock('../TrackHeader', () => ({
  TrackHeader: ({
    track,
    onDragStart,
    onDragOver,
    onDrop,
    isDragOver,
    dragOverPosition,
  }: {
    track: { id: string; displayName: string };
    onDragStart: (id: string) => void;
    onDragOver: (e: DragEvent, id: string) => void;
    onDrop: (e: DragEvent, id: string) => void;
    isDragOver: boolean;
    dragOverPosition: 'before' | 'after' | null;
  }) => (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-testid={`track-header-${track.id}`}
      data-drag-over={isDragOver ? 'true' : 'false'}
      data-drag-position={dragOverPosition ?? 'none'}
      onDragStart={() => onDragStart(track.id)}
      onDragOver={(event) => onDragOver(event, track.id)}
      onDrop={(event) => onDrop(event, track.id)}
    >
      {track.displayName}
    </div>
  ),
}));

describe('TrackList drag-and-drop', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useUIStore.setState({
      trackListWidth: 320,
      trackListDisplayMode: 'expanded',
      showTempoLane: false,
      scrollY: 0,
      selectedTrackIds: new Set(),
    });
  });

  it('allows dropping a track into an empty arrangement row', async () => {
    const store = useProjectStore.getState();
    const drums = store.addTrack('drums', 'stems', { order: 1 });
    const bass = store.addTrack('bass', 'stems', { order: 4 });

    render(<TrackList />);

    fireEvent.dragStart(screen.getByTestId(`track-header-${drums.id}`));
    fireEvent.dragOver(screen.getByTestId('empty-header-row-1'));
    fireEvent.drop(screen.getByTestId('empty-header-row-1'));

    await waitFor(() => {
      const project = useProjectStore.getState().project!;
      expect(project.tracks.find((track) => track.id === drums.id)?.order).toBe(2);
      expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(4);
    });
  });

  it('disables empty-slot drops that are occupied by children of a collapsed group', async () => {
    const store = useProjectStore.getState();
    const group = store.createGroupTrack('Drum Bus');
    const child = store.addTrack('drums', 'stems', { order: 2 });
    const bass = store.addTrack('bass', 'stems', { order: 4 });

    store.moveTrackToGroup(child.id, group.id);
    store.toggleGroupCollapse(group.id);

    render(<TrackList />);

    const blockedSlot = screen.getByTestId('empty-header-row-1');
    expect(blockedSlot.getAttribute('data-drop-disabled')).toBe('true');

    fireEvent.dragStart(screen.getByTestId(`track-header-${bass.id}`));
    fireEvent.dragOver(blockedSlot);
    fireEvent.drop(blockedSlot);

    await waitFor(() => {
      const project = useProjectStore.getState().project!;
      expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(4);
      expect(project.tracks.find((track) => track.id === child.id)?.order).toBe(2);
    });
  });
});

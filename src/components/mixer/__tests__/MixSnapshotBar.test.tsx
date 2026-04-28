import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MixSnapshotBar } from '../MixSnapshotBar';
import { useProjectStore } from '../../../store/projectStore';
import { useCollaborationStore } from '../../../store/collaborationStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
    getTrackMeter: () => ({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false }),
    getMasterMeter: () => ({ level: 0, clipped: false }),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
    masterVolume: 1,
    getMasterLevel: () => ({ left: 0, right: 0 }),
    getMasterInputLevel: () => ({ left: 0, right: 0 }),
    getAnalyserData: () => null,
  }),
}));

function setupProject() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('vocals');
}

describe('MixSnapshotBar', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useCollaborationStore.getState().reset();
    setupProject();
  });

  it('renders save button', () => {
    render(<MixSnapshotBar />);
    expect(screen.getByTestId('save-mix-snapshot-btn')).toBeTruthy();
  });

  it('does not show snapshot count when no snapshots', () => {
    render(<MixSnapshotBar />);
    expect(screen.queryByTestId('toggle-snapshot-list-btn')).toBeNull();
  });

  it('saves a snapshot when save button is clicked', () => {
    render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));

    const project = useProjectStore.getState().project!;
    expect(project.mixSnapshots).toHaveLength(1);
    expect(project.mixSnapshots![0].name).toBe('Snapshot 1');
  });

  it('ignores save clicks when no project is loaded', () => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    render(<MixSnapshotBar />);

    expect(() => fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'))).not.toThrow();
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('ignores save clicks in viewer mode', () => {
    useCollaborationStore.getState().setViewerMode(true);
    render(<MixSnapshotBar />);

    expect(() => fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'))).not.toThrow();
    expect(useProjectStore.getState().project!.mixSnapshots).toBeUndefined();
  });

  it('shows snapshot count after saving', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));
    rerender(<MixSnapshotBar />);

    const toggleBtn = screen.getByTestId('toggle-snapshot-list-btn');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toContain('1');
  });

  it('expands snapshot list when toggle clicked', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));
    rerender(<MixSnapshotBar />);

    fireEvent.click(screen.getByTestId('toggle-snapshot-list-btn'));
    rerender(<MixSnapshotBar />);

    expect(screen.getByTestId('snapshot-list-panel')).toBeTruthy();
  });

  it('loads a snapshot when load button is clicked', () => {
    // Save with volume 0.8 (default from addTrack)
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));

    // Change volume
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { volume: 0.9 });
    expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);

    // Expand list and click load
    rerender(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('toggle-snapshot-list-btn'));
    rerender(<MixSnapshotBar />);

    const snapshotId = useProjectStore.getState().project!.mixSnapshots![0].id;
    fireEvent.click(screen.getByTestId(`load-snapshot-${snapshotId}`));

    expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.8);
  });

  it('deletes a snapshot when delete button is clicked', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));
    rerender(<MixSnapshotBar />);

    fireEvent.click(screen.getByTestId('toggle-snapshot-list-btn'));
    rerender(<MixSnapshotBar />);

    const snapshotId = useProjectStore.getState().project!.mixSnapshots![0].id;
    fireEvent.click(screen.getByTestId(`delete-snapshot-${snapshotId}`));

    expect(useProjectStore.getState().project!.mixSnapshots).toHaveLength(0);
  });

  it('toggles A/B comparison', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));

    // Change volume
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { volume: 0.9 });

    rerender(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('toggle-snapshot-list-btn'));
    rerender(<MixSnapshotBar />);

    const snapshotId = useProjectStore.getState().project!.mixSnapshots![0].id;
    fireEvent.click(screen.getByTestId(`ab-snapshot-${snapshotId}`));

    // Should now show saved volume (0.8) and A/B indicator
    expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.8);
    expect(useProjectStore.getState().isAbComparing()).toBe(true);
  });

  it('shows A/B indicator when comparison is active', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));

    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { volume: 0.9 });

    const snapshotId = useProjectStore.getState().project!.mixSnapshots![0].id;
    useProjectStore.getState().toggleAbCompare(snapshotId);

    rerender(<MixSnapshotBar />);
    expect(screen.getByTestId('ab-indicator')).toBeTruthy();
  });

  it('increments snapshot name for each save', () => {
    const { rerender } = render(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));
    rerender(<MixSnapshotBar />);
    fireEvent.click(screen.getByTestId('save-mix-snapshot-btn'));

    const snapshots = useProjectStore.getState().project!.mixSnapshots!;
    expect(snapshots[0].name).toBe('Snapshot 1');
    expect(snapshots[1].name).toBe('Snapshot 2');
  });
});

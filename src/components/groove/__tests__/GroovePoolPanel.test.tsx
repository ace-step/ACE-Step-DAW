import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GroovePoolPanel } from '../GroovePoolPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import type { GrooveTemplate } from '../../../types/project';

vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

function makeGroove(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
  return {
    id: 'groove-1',
    name: 'Swing 16ths',
    timingOffsets: [0, 0.03, 0, -0.02],
    velocityPattern: [1.0, 0.7, 0.9, 0.6],
    gridBeats: 0.25,
    lengthBeats: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

function setupProject(grooves: GrooveTemplate[] = []) {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
  if (grooves.length > 0) {
    const state = useProjectStore.getState();
    useProjectStore.setState({
      project: { ...state.project!, groovePool: grooves },
    });
  }
}

describe('GroovePoolPanel', () => {
  beforeEach(() => {
    setupProject();
    useUIStore.setState({ showGroovePool: false });
  });

  // ── Visibility ─────────────────────────────────────────────────────────────

  it('renders nothing when showGroovePool is false', () => {
    useUIStore.setState({ showGroovePool: false });
    const { container } = render(<GroovePoolPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders panel when showGroovePool is true', () => {
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    expect(screen.getByTestId('groove-pool-panel')).toBeInTheDocument();
    expect(screen.getByText('Groove Pool')).toBeInTheDocument();
  });

  it('closes panel when close button is clicked', () => {
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-pool-close'));
    expect(useUIStore.getState().showGroovePool).toBe(false);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no grooves exist', () => {
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    expect(screen.getByTestId('groove-pool-empty')).toBeInTheDocument();
    expect(screen.getByText('No grooves yet')).toBeInTheDocument();
  });

  it('shows instruction text in empty state', () => {
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    expect(screen.getByText(/Extract Groove/)).toBeInTheDocument();
  });

  // ── Groove list ────────────────────────────────────────────────────────────

  it('renders groove items from project groovePool', () => {
    const g1 = makeGroove({ id: 'g1', name: 'Swing 16ths' });
    const g2 = makeGroove({ id: 'g2', name: 'Straight 8ths' });
    setupProject([g1, g2]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    expect(screen.getByTestId('groove-item-g1')).toBeInTheDocument();
    expect(screen.getByTestId('groove-item-g2')).toBeInTheDocument();
    expect(screen.getByText('Swing 16ths')).toBeInTheDocument();
    expect(screen.getByText('Straight 8ths')).toBeInTheDocument();
  });

  it('displays grid and length info for each groove', () => {
    const g = makeGroove({ id: 'g1', gridBeats: 0.25, lengthBeats: 4 });
    setupProject([g]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    const item = screen.getByTestId('groove-item-g1');
    expect(item.textContent).toContain('1/4 note');
    expect(item.textContent).toContain('4B loop');
  });

  it('displays whole-beat grid label correctly', () => {
    const g = makeGroove({ id: 'g1', gridBeats: 1, lengthBeats: 4 });
    setupProject([g]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    const item = screen.getByTestId('groove-item-g1');
    expect(item.textContent).toContain('1 beat');
  });

  // ── Search/filter ──────────────────────────────────────────────────────────

  it('filters grooves by search query', () => {
    const g1 = makeGroove({ id: 'g1', name: 'Swing 16ths' });
    const g2 = makeGroove({ id: 'g2', name: 'Straight 8ths' });
    setupProject([g1, g2]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.change(screen.getByTestId('groove-pool-search'), { target: { value: 'swing' } });

    expect(screen.getByTestId('groove-item-g1')).toBeInTheDocument();
    expect(screen.queryByTestId('groove-item-g2')).not.toBeInTheDocument();
  });

  it('shows empty search message when no matches', () => {
    setupProject([makeGroove()]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.change(screen.getByTestId('groove-pool-search'), { target: { value: 'nonexistent' } });

    expect(screen.getByText('No grooves match your search')).toBeInTheDocument();
  });

  // ── Selection ──────────────────────────────────────────────────────────────

  it('selects a groove on click and shows apply bar', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));

    expect(screen.getByTestId('groove-item-g1').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('apply-groove-bar')).toBeInTheDocument();
  });

  it('does not show apply bar when nothing selected', () => {
    setupProject([makeGroove()]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    expect(screen.queryByTestId('apply-groove-bar')).not.toBeInTheDocument();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('deletes groove when delete button is clicked', () => {
    const g = makeGroove({ id: 'g1' });
    setupProject([g]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-delete-g1'));

    const pool = useProjectStore.getState().project?.groovePool ?? [];
    expect(pool).toHaveLength(0);
  });

  it('clears selection when selected groove is deleted', () => {
    const g = makeGroove({ id: 'g1' });
    setupProject([g]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));
    expect(screen.getByTestId('apply-groove-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('groove-delete-g1'));
    expect(screen.queryByTestId('apply-groove-bar')).not.toBeInTheDocument();
  });

  // ── Rename ─────────────────────────────────────────────────────────────────

  it('enters rename mode on double-click', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.doubleClick(screen.getByTestId('groove-item-g1'));

    expect(screen.getByTestId('groove-rename-input-g1')).toBeInTheDocument();
  });

  it('commits rename on Enter key', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Old Name' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.doubleClick(screen.getByTestId('groove-item-g1'));

    const input = screen.getByTestId('groove-rename-input-g1');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const pool = useProjectStore.getState().project?.groovePool ?? [];
    expect(pool[0].name).toBe('New Name');
  });

  it('cancels rename on Escape key', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Original' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.doubleClick(screen.getByTestId('groove-item-g1'));

    const input = screen.getByTestId('groove-rename-input-g1');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should exit editing without saving
    expect(screen.queryByTestId('groove-rename-input-g1')).not.toBeInTheDocument();
    const pool = useProjectStore.getState().project?.groovePool ?? [];
    expect(pool[0].name).toBe('Original');
  });

  // ── Apply groove bar ──────────────────────────────────────────────────────

  it('shows default strength of 100%', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));

    expect(screen.getByTestId('groove-strength-value').textContent).toBe('100%');
  });

  it('updates strength display when slider changes', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));
    fireEvent.change(screen.getByTestId('groove-strength-slider'), { target: { value: '50' } });

    expect(screen.getByTestId('groove-strength-value').textContent).toBe('50%');
  });

  it('has timing and velocity checkboxes checked by default', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));

    expect(screen.getByTestId('groove-apply-timing')).toBeChecked();
    expect(screen.getByTestId('groove-apply-velocity')).toBeChecked();
  });

  it('disables apply button when no MIDI clip is selected', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true, selectedClipIds: new Set() });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));

    const button = screen.getByTestId('groove-apply-button');
    expect(button).toBeDisabled();
    expect(button.textContent).toBe('Select a MIDI clip first');
  });

  it('enables apply button when MIDI clip is selected', () => {
    const g = makeGroove({ id: 'g1' });
    setupProject([g]);

    // Create a track with a MIDI clip
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.addClip(track.id, {
      startTime: 0,
      duration: 4,
      midiData: {
        notes: [
          { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        ],
      },
    });
    const updatedProject = useProjectStore.getState().project!;
    const clipId = updatedProject.tracks.find((t) => t.id === track.id)!.clips[0].id;

    useUIStore.setState({
      showGroovePool: true,
      selectedClipIds: new Set([clipId]),
    });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));

    const button = screen.getByTestId('groove-apply-button');
    expect(button).not.toBeDisabled();
    expect(button.textContent).toBe('Apply Groove');
  });

  it('calls applyGrooveToClip when apply is clicked with selected MIDI clip', () => {
    const g = makeGroove({ id: 'g1' });
    setupProject([g]);

    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.addClip(track.id, {
      startTime: 0,
      duration: 4,
      midiData: {
        notes: [
          { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
          { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 },
        ],
      },
    });
    const updatedProject = useProjectStore.getState().project!;
    const clipId = updatedProject.tracks.find((t) => t.id === track.id)!.clips[0].id;

    const spy = vi.spyOn(useProjectStore.getState(), 'applyGrooveToClip');

    useUIStore.setState({
      showGroovePool: true,
      selectedClipIds: new Set([clipId]),
    });

    render(<GroovePoolPanel />);
    fireEvent.click(screen.getByTestId('groove-item-g1'));
    fireEvent.click(screen.getByTestId('groove-apply-button'));

    expect(spy).toHaveBeenCalledWith(
      clipId,
      ['n1', 'n2'],
      'g1',
      { strength: 100, applyTiming: true, applyVelocity: true },
    );
    spy.mockRestore();
  });

  // ── Panel accessibility ────────────────────────────────────────────────────

  it('has listbox role and accessible label', () => {
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    const panel = screen.getByTestId('groove-pool-panel');
    expect(panel.getAttribute('role')).toBe('listbox');
    expect(panel.getAttribute('aria-label')).toBe('Groove Pool');
  });

  it('has option role on groove items', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    useUIStore.setState({ showGroovePool: true });
    render(<GroovePoolPanel />);
    const item = screen.getByTestId('groove-item-g1');
    expect(item.getAttribute('role')).toBe('option');
  });
});

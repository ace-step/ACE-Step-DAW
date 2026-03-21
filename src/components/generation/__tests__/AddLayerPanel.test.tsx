import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddLayerPanel } from '../AddLayerPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore } from '../../../store/generationStore';
import { generateFromAddLayer } from '../../../services/generationPipeline';

// Mock external dependencies
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../services/generationPipeline', () => ({
  generateFromAddLayer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: vi.fn().mockResolvedValue(null),
}));

function setupProject() {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject();
  useUIStore.setState({
    addLayerOpen: true,
    selectWindow: { startTime: 3, endTime: 7, trackIds: [] },
    contextWindow: null,
  });
}

describe('AddLayerPanel', () => {
  beforeEach(() => {
    setupProject();
  });

  it('renders nothing when addLayerOpen is false', () => {
    useUIStore.setState({ addLayerOpen: false });
    const { container } = render(<AddLayerPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the panel when addLayerOpen is true', () => {
    render(<AddLayerPanel />);
    expect(screen.getByTestId('add-layer-panel')).toBeInTheDocument();
    expect(screen.getByText('Add a Layer')).toBeInTheDocument();
  });

  it('renders a target track selector', () => {
    render(<AddLayerPanel />);
    expect(screen.getByRole('group', { name: 'Target Track' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Target track: Drums' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Target track: Vocals' })).toBeInTheDocument();
  });

  it('shows all 12 preset target tracks', () => {
    render(<AddLayerPanel />);
    expect(screen.getAllByRole('button', { name: /Target track:/i })).toHaveLength(12);
  });

  it('defaults target track to the first selected preset track in the select window', () => {
    const bassTrack = useProjectStore.getState().project!.tracks.find((track) => track.trackName === 'bass');
    expect(bassTrack).toBeDefined();

    useUIStore.setState({
      selectWindow: { startTime: 3, endTime: 7, trackIds: [bassTrack!.id] },
    });

    render(<AddLayerPanel />);
    const bassButton = screen.getByRole('button', { name: 'Target track: Bass' });
    expect(bassButton.className).toContain('bg-white/10');
    expect(screen.getByText(`Generate into ${bassTrack!.displayName}`)).toBeInTheDocument();
  });

  it('creates a new preset track instead of falling back to the first existing track when the selection is on an empty row', async () => {
    useUIStore.setState({
      selectWindow: { startTime: 3, endTime: 7, trackIds: ['__empty-0'], primaryTrackId: '__empty-0', targetRowIndex: 0 },
    });

    const initialTrackCount = useProjectStore.getState().project!.tracks.length;
    const existingDrumsTrackId = useProjectStore.getState().project!.tracks.find((track) => track.trackName === 'drums')!.id;

    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(useProjectStore.getState().project!.tracks).toHaveLength(initialTrackCount + 1);
    });

    const latestCall = vi.mocked(generateFromAddLayer).mock.calls.at(-1);
    expect(latestCall).toBeDefined();
    expect(latestCall![0].trackId).not.toBe(existingDrumsTrackId);
  });

  it('creates the generated track at the selected empty row order', async () => {
    useProjectStore.getState().addTrack('drums');
    useUIStore.setState({
      selectWindow: { startTime: 3, endTime: 7, trackIds: ['__empty-3'], primaryTrackId: '__empty-3', targetRowIndex: 3 },
    });

    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(useProjectStore.getState().project!.tracks).toHaveLength(2);
    });

    const generatedTrack = [...useProjectStore.getState().project!.tracks].sort((a, b) => a.order - b.order).at(-1);
    expect(generatedTrack?.order).toBe(4);
  });

  it('prefers the dragged empty row over overlapped existing tracks when generating', async () => {
    const thirdTrack = useProjectStore.getState().project!.tracks[2];
    expect(thirdTrack).toBeDefined();

    useUIStore.setState({
      selectWindow: {
        startTime: 3,
        endTime: 7,
        trackIds: [thirdTrack.id, '__empty-4'],
        primaryTrackId: '__empty-4',
        targetRowIndex: 4,
      },
    });

    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(useProjectStore.getState().project!.tracks).toHaveLength(4);
    });

    const latestCall = vi.mocked(generateFromAddLayer).mock.calls.at(-1);
    const generatedTrack = useProjectStore.getState().project!.tracks.find((track) => track.id === latestCall?.[0].trackId);
    expect(generatedTrack?.order).toBe(5);
    expect(generatedTrack?.id).not.toBe(thirdTrack.id);
  });

  it('displays the selection range from uiStore selectWindow', () => {
    render(<AddLayerPanel />);
    expect(screen.getAllByText(/3\.0s/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/7\.0s/).length).toBeGreaterThan(0);
  });

  it('renders layer type buttons', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText('Song Track')).toBeInTheDocument();
    expect(screen.getByText('Vocal')).toBeInTheDocument();
    expect(screen.getByText('Backing')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows lyrics textarea when Vocal layer type is selected', () => {
    render(<AddLayerPanel />);
    // Lyrics should not be visible by default (Song Track selected)
    expect(screen.queryByPlaceholderText('Song lyrics...')).not.toBeInTheDocument();

    // Click Vocal
    fireEvent.click(screen.getByText('Vocal'));
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();
  });

  it('shows lyrics textarea when Backing layer type is selected', () => {
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Backing'));
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();
  });

  it('hides lyrics textarea when Song Track layer type is selected', () => {
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Vocal'));
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Song Track'));
    expect(screen.queryByPlaceholderText('Song lyrics...')).not.toBeInTheDocument();
  });

  it('has a collapsed Advanced section by default', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText(/Advanced/)).toBeInTheDocument();
    // Seed input should not be visible
    expect(screen.queryByPlaceholderText('Leave empty for random')).not.toBeInTheDocument();
  });

  it('expands Advanced section on click', () => {
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText(/Advanced/));
    expect(screen.getByPlaceholderText('Leave empty for random')).toBeInTheDocument();
    expect(screen.getByText('Sample mode')).toBeInTheDocument();
    expect(screen.getByText('Auto-expand prompt')).toBeInTheDocument();
    expect(screen.getByText(/Mask mode/)).toBeInTheDocument();
  });

  it('shows context info in Advanced when contextWindow is set', () => {
    useUIStore.setState({
      contextWindow: { startTime: 1, endTime: 5, trackIds: [] },
    });
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText(/Advanced/));
    expect(screen.getByText(/1\.0s/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0s/)).toBeInTheDocument();
  });

  it('shows "none" context message when no contextWindow', () => {
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText(/Advanced/));
    expect(screen.getByText(/Context: none/)).toBeInTheDocument();
  });

  it('has no backdrop overlay — floating panel only', () => {
    const { container } = render(<AddLayerPanel />);
    // The panel should not have a fixed inset-0 backdrop
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeNull();
  });

  it('closes the panel when close button is clicked', () => {
    render(<AddLayerPanel />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(useUIStore.getState().addLayerOpen).toBe(false);
  });

  it('closes the panel on Escape key', () => {
    render(<AddLayerPanel />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUIStore.getState().addLayerOpen).toBe(false);
  });

  it('has a Generate button', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('disables Generate button when generating', () => {
    useGenerationStore.setState({ isGenerating: true });
    render(<AddLayerPanel />);
    const btn = screen.getByText(/Generating/);
    expect(btn).toBeDisabled();
  });

  it('shows "Select the whole song" button when selection is partial', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText('+ Select the whole song')).toBeInTheDocument();
  });

  it('preserves typed style when selecting the whole song', () => {
    render(<AddLayerPanel />);
    const styleInput = screen.getByPlaceholderText('Describe the sound...');
    fireEvent.change(styleInput, { target: { value: 'wide cinematic pads' } });

    fireEvent.click(screen.getByText('+ Select the whole song'));

    expect(screen.getByDisplayValue('wide cinematic pads')).toBeInTheDocument();
  });

  it('offers a way to restore the previous window after selecting the whole song', () => {
    render(<AddLayerPanel />);

    fireEvent.click(screen.getByText('+ Select the whole song'));

    expect(screen.getByText('Restore previous window')).toBeInTheDocument();
    expect(useUIStore.getState().selectWindow).toMatchObject({ startTime: 0 });

    fireEvent.click(screen.getByText('Restore previous window'));

    expect(useUIStore.getState().selectWindow).toEqual({
      startTime: 3,
      endTime: 7,
      trackIds: [],
    });
  });

  it('does not show "Select the whole song" when selection covers full song', () => {
    const totalDuration = useProjectStore.getState().project!.totalDuration;
    useUIStore.setState({
      selectWindow: { startTime: 0, endTime: totalDuration, trackIds: [] },
    });
    render(<AddLayerPanel />);
    expect(screen.queryByText('+ Select the whole song')).not.toBeInTheDocument();
  });

  it('renders style textarea', () => {
    render(<AddLayerPanel />);
    expect(screen.getByPlaceholderText('Describe the sound...')).toBeInTheDocument();
  });

  it('applies active styling to selected layer type pill', () => {
    render(<AddLayerPanel />);
    const songBtn = screen.getByText('Song Track');
    // Song Track should have teal active styling
    expect(songBtn.className).toContain('bg-teal-600');

    const vocalBtn = screen.getByText('Vocal');
    expect(vocalBtn.className).not.toContain('bg-teal-600');
  });

  it('moves the panel when dragging the header', () => {
    render(<AddLayerPanel />);

    const panel = screen.getByTestId('add-layer-panel');
    const dragHandle = screen.getByTestId('add-layer-drag-handle');

    Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 420 });
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 520 });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 100,
      width: 420,
      height: 520,
      top: 100,
      right: 540,
      bottom: 620,
      left: 120,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(dragHandle, { button: 0, clientX: 150, clientY: 140 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 260 });
    fireEvent.mouseUp(window);

    expect(panel.style.left).toBe('270px');
    expect(panel.style.top).toBe('220px');
  });

  it('clears the select window after generation starts', async () => {
    const bassTrack = useProjectStore.getState().project!.tracks.find((track) => track.trackName === 'bass');
    useUIStore.setState({
      selectWindow: { startTime: 3, endTime: 7, trackIds: [bassTrack!.id] },
    });

    render(<AddLayerPanel />);
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(useUIStore.getState().selectWindow).toBeNull();
    });
  });
});

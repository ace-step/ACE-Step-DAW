import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddLayerPanel } from '../AddLayerPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore } from '../../../store/generationStore';
import { generateFromAddLayer } from '../../../services/generationPipeline';

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
    vi.clearAllMocks();
    setupProject();
    useGenerationStore.setState({ isGenerating: false });
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

  it('renders a target track dropdown', () => {
    render(<AddLayerPanel />);
    const select = screen.getByRole('combobox', { name: 'Target track' });
    expect(select).toBeInTheDocument();
    // Should have all 12 preset tracks as options
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(12);
  });

  it('defaults target track to the first selected preset track in the select window', () => {
    useProjectStore.getState().addTrack('bass');
    const bassTrack = useProjectStore.getState().project!.tracks.find((track) => track.trackName === 'bass');
    expect(bassTrack).not.toBeUndefined();

    useUIStore.setState({
      selectWindow: { startTime: 3, endTime: 7, trackIds: [bassTrack!.id] },
    });

    render(<AddLayerPanel />);
    const select = screen.getByRole('combobox', { name: 'Target track' }) as HTMLSelectElement;
    expect(select.value).toBe('bass');
    expect(screen.getByText(`Generate into selected row: ${bassTrack!.displayName}`)).toBeInTheDocument();
  });

  it('creates a new preset track instead of falling back to the first existing track when the selection is on an empty row', async () => {
    useProjectStore.getState().addTrack('drums');
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
    expect(latestCall).not.toBeUndefined();
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
    useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addTrack('bass');
    useProjectStore.getState().addTrack('guitar');
    const thirdTrack = useProjectStore.getState().project!.tracks[2];
    expect(thirdTrack).not.toBeUndefined();

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

  it('shows lyrics textarea when vocals track is selected', () => {
    render(<AddLayerPanel />);
    expect(screen.queryByPlaceholderText('Song lyrics...')).not.toBeInTheDocument();

    // Select vocals track via dropdown
    const select = screen.getByRole('combobox', { name: 'Target track' });
    fireEvent.change(select, { target: { value: 'vocals' } });
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();
  });

  it('shows lyrics textarea when backing_vocals track is selected', () => {
    render(<AddLayerPanel />);
    const select = screen.getByRole('combobox', { name: 'Target track' });
    fireEvent.change(select, { target: { value: 'backing_vocals' } });
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();
  });

  it('hides lyrics textarea when non-vocal track is selected', () => {
    render(<AddLayerPanel />);
    const select = screen.getByRole('combobox', { name: 'Target track' });

    fireEvent.change(select, { target: { value: 'vocals' } });
    expect(screen.getByPlaceholderText('Song lyrics...')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'drums' } });
    expect(screen.queryByPlaceholderText('Song lyrics...')).not.toBeInTheDocument();
  });

  it('shows seed and mask mode controls inline (no Advanced fold)', () => {
    render(<AddLayerPanel />);
    expect(screen.getByTitle('Random seed')).toBeInTheDocument();
    expect(screen.getByText(/Mask/)).toBeInTheDocument();
    expect(screen.getByText('Rand')).toBeInTheDocument();
  });

  it('shows context info when contextWindow is set', () => {
    useUIStore.setState({
      contextWindow: { startTime: 1, endTime: 5, trackIds: [] },
    });
    render(<AddLayerPanel />);
    expect(screen.getByText(/1\.0s/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0s/)).toBeInTheDocument();
  });

  it('shows "none" context message when no contextWindow', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText(/Context: none/)).toBeInTheDocument();
  });

  it('has no backdrop overlay — floating panel only', () => {
    const { container } = render(<AddLayerPanel />);
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

  it('shows "Whole song" button in header when selection is partial', () => {
    render(<AddLayerPanel />);
    expect(screen.getByText('Whole song')).toBeInTheDocument();
  });

  it('preserves typed style when selecting the whole song', () => {
    render(<AddLayerPanel />);
    const styleInput = screen.getByPlaceholderText('Describe the sound...');
    fireEvent.change(styleInput, { target: { value: 'wide cinematic pads' } });

    fireEvent.click(screen.getByText('Whole song'));

    expect(screen.getByDisplayValue('wide cinematic pads')).toBeInTheDocument();
  });

  it('offers a way to restore the previous window after selecting the whole song', () => {
    render(<AddLayerPanel />);

    fireEvent.click(screen.getByText('Whole song'));

    expect(screen.getByText('Restore')).toBeInTheDocument();
    expect(useUIStore.getState().selectWindow).toMatchObject({ startTime: 0 });

    fireEvent.click(screen.getByText('Restore'));

    expect(useUIStore.getState().selectWindow).toEqual({
      startTime: 3,
      endTime: 7,
      trackIds: [],
    });
  });

  it('does not show "Whole song" when selection covers full song', () => {
    const totalDuration = useProjectStore.getState().project!.totalDuration;
    useUIStore.setState({
      selectWindow: { startTime: 0, endTime: totalDuration, trackIds: [] },
    });
    render(<AddLayerPanel />);
    expect(screen.queryByText('Whole song')).not.toBeInTheDocument();
  });

  it('renders stem description textarea', () => {
    render(<AddLayerPanel />);
    expect(screen.getByPlaceholderText('Describe the sound...')).toBeInTheDocument();
    expect(screen.getByText('Stem Description')).toBeInTheDocument();
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
    useProjectStore.getState().addTrack('bass');
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

  it('hides global caption in chunk mode (partial selection)', () => {
    render(<AddLayerPanel />);
    // Partial selection (3-7s), should NOT show global caption
    expect(screen.queryByPlaceholderText(/upbeat pop song/)).not.toBeInTheDocument();
  });

  it('shows global caption for full song selection', () => {
    const totalDuration = useProjectStore.getState().project!.totalDuration;
    useUIStore.setState({
      selectWindow: { startTime: 0, endTime: totalDuration, trackIds: [] },
    });
    render(<AddLayerPanel />);
    expect(screen.getByPlaceholderText(/upbeat pop song/)).toBeInTheDocument();
  });
});

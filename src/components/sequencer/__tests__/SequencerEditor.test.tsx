import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerEditor } from '../SequencerEditor';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      currentTime: 0,
      createBufferSource: () => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      }),
      createGain: () => ({
        gain: { value: 1 },
        connect: vi.fn(),
      }),
      createStereoPanner: () => ({
        pan: { value: 0 },
        connect: vi.fn(),
      }),
      destination: {},
      decodeAudioData: vi.fn().mockResolvedValue({}),
    },
    resume: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../services/sequencerBounce', () => ({
  bounceSequencerToAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/sampleManager', () => ({
  getSample: vi.fn().mockResolvedValue(null),
  cacheUserSample: vi.fn(),
}));

vi.mock('../../../hooks/useNonPassiveWheel', () => ({
  useNonPassiveWheel: () => () => {},
}));

function setupSequencerTrack(): string {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  const tracks = useProjectStore.getState().project!.tracks;
  const track = tracks[tracks.length - 1];
  // Initialize sequencer pattern
  useProjectStore.getState().initSequencerPattern(track.id);
  // Open the sequencer editor
  useUIStore.setState({
    openSequencerTrackId: track.id,
    sequencerEditorHeight: 300,
  });
  return track.id;
}

describe('SequencerEditor', () => {
  let trackId: string;

  beforeEach(() => {
    trackId = setupSequencerTrack();
  });

  it('renders nothing when no sequencer track is open', () => {
    useUIStore.setState({ openSequencerTrackId: null });
    const { container } = render(<SequencerEditor />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the toolbar with track name', () => {
    render(<SequencerEditor />);
    expect(screen.getByText('CHANNEL RACK')).toBeInTheDocument();
  });

  it('renders sequencer rows from pattern', () => {
    render(<SequencerEditor />);
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    // Each row should have its name displayed
    for (const row of pattern.rows) {
      expect(screen.getByText(row.name)).toBeInTheDocument();
    }
  });

  it('renders Add Channel button', () => {
    render(<SequencerEditor />);
    expect(screen.getByText('Add Channel...')).toBeInTheDocument();
  });

  it('toggles step on click', () => {
    render(<SequencerEditor />);
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    const firstRow = pattern.rows[0];
    const firstStep = firstRow.steps[0].active;

    // Find and click a step cell
    const cells = document.querySelectorAll('[data-seq-step="0"]');
    const firstRowCell = Array.from(cells).find(
      (c) => c.getAttribute('data-seq-row') === firstRow.id,
    )!;

    // Simulate mousedown + mouseup (no drag = toggle)
    fireEvent.mouseDown(firstRowCell);
    fireEvent.mouseUp(window);

    const updatedPattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    expect(updatedPattern.rows[0].steps[0].active).toBe(!firstStep);
  });

  it('closes editor when clicking close button', () => {
    render(<SequencerEditor />);
    const closeBtn = screen.getByTitle('Esc');
    fireEvent.click(closeBtn);
    expect(useUIStore.getState().openSequencerTrackId).toBeNull();
  });

  it('closes editor on Escape key', () => {
    render(<SequencerEditor />);
    fireEvent.keyDown(window, { code: 'Escape' }, true);
    expect(useUIStore.getState().openSequencerTrackId).toBeNull();
  });

  it('changes steps per bar', () => {
    render(<SequencerEditor />);
    fireEvent.click(screen.getByText('32'));
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    expect(pattern.stepsPerBar).toBe(32);
  });

  it('adds a bar when clicking + button', () => {
    render(<SequencerEditor />);
    const initialBars = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!.bars;

    // Find + button for bars in toolbar
    const plusBtns = screen.getAllByRole('button').filter(
      (btn) => btn.textContent === '+',
    );
    // The first + should be the bars increment
    fireEvent.click(plusBtns[0]);

    const updatedBars = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!.bars;
    expect(updatedBars).toBe(initialBars + 1);
  });

  it('shows sample picker when clicking Add Channel', () => {
    render(<SequencerEditor />);
    fireEvent.click(screen.getByText('Add Channel...'));
    expect(screen.getByText('Built-in Samples')).toBeInTheDocument();
  });

  it('opens context menu on row right-click', () => {
    render(<SequencerEditor />);
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    const rowName = pattern.rows[0].name;
    const rowNameEl = screen.getByText(rowName);
    const rowHeader = rowNameEl.closest('[draggable]')!;
    fireEvent.contextMenu(rowHeader);
    expect(screen.getByText('Clone Channel')).toBeInTheDocument();
    expect(screen.getByText('Delete Channel')).toBeInTheDocument();
  });

  it('mutes a row when clicking mute LED', () => {
    render(<SequencerEditor />);
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    const firstRowId = pattern.rows[0].id;

    // Find mute LED (small circle with title containing "Mute")
    const muteLeds = screen.getAllByTitle(/Mute.*click/);
    fireEvent.click(muteLeds[0]);

    const updated = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    const row = updated.rows.find((r) => r.id === firstRowId)!;
    expect(row.muted).toBe(true);
  });

  it('renders Play button initially', () => {
    render(<SequencerEditor />);
    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  it('renders Bounce button', () => {
    render(<SequencerEditor />);
    expect(screen.getByText('Bounce')).toBeInTheDocument();
  });

  it('has resize handle at top', () => {
    const { container } = render(<SequencerEditor />);
    const resizeHandle = container.querySelector('.cursor-ns-resize');
    expect(resizeHandle).toBeInTheDocument();
  });

  it('deletes a row via context menu', () => {
    render(<SequencerEditor />);
    const pattern = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    const initialRowCount = pattern.rows.length;
    const rowName = pattern.rows[0].name;

    // Right-click to open context menu
    const rowNameEl = screen.getByText(rowName);
    const rowHeader = rowNameEl.closest('[draggable]')!;
    fireEvent.contextMenu(rowHeader);

    // Click delete
    fireEvent.click(screen.getByText('Delete Channel'));

    const updated = useProjectStore.getState().project!.tracks
      .find((t) => t.id === trackId)!.sequencerPattern!;
    expect(updated.rows.length).toBe(initialRowCount - 1);
  });
});

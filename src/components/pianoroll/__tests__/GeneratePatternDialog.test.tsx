import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeneratePatternDialog } from '../GeneratePatternDialog';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../utils/midiPatternGenerator', () => ({
  generatePattern: vi.fn().mockReturnValue([]),
}));

function setupDialog() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('midi');
  const tracks = useProjectStore.getState().project!.tracks;
  const track = tracks[tracks.length - 1];
  // Create a real MIDI clip via the store
  const clip = useProjectStore.getState().ensureMidiClip(track.id);
  useUIStore.setState({
    showGeneratePatternDialog: true,
    generatePatternClipId: clip.id,
  });
  return { clipId: clip.id };
}

describe('GeneratePatternDialog', () => {
  beforeEach(() => {
    setupDialog();
  });

  it('renders nothing when not shown', () => {
    useUIStore.setState({ showGeneratePatternDialog: false });
    const { container } = render(<GeneratePatternDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when shown', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByText('Generate Pattern')).toBeInTheDocument();
  });

  it('renders role options', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByText('Melody')).toBeInTheDocument();
    expect(screen.getByText('Chords')).toBeInTheDocument();
    expect(screen.getByText('Bass')).toBeInTheDocument();
    expect(screen.getByText('Arpeggio')).toBeInTheDocument();
  });

  it('renders genre selector', () => {
    render(<GeneratePatternDialog />);
    // Genre options should be available in a select
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders density slider', () => {
    render(<GeneratePatternDialog />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Generate and Cancel buttons', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByText('Generate')).toBeInTheDocument();
    // Cancel or close button
    const cancelBtn = screen.queryByText('Cancel') ?? screen.queryByText('Close');
    expect(cancelBtn).toBeInTheDocument();
  });

  it('renders Regenerate button', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
  });

  it('renders Regenerate with correct title', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByTitle('Generate with a new random seed')).toBeInTheDocument();
  });

  it('closes dialog on Cancel', () => {
    render(<GeneratePatternDialog />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(useUIStore.getState().showGeneratePatternDialog).toBe(false);
  });

  it('renders bar length options', () => {
    render(<GeneratePatternDialog />);
    expect(screen.getByText('Length (bars)')).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChordSuggestionPanel } from '../ChordSuggestionPanel';
import { useChordSuggestionStore } from '../../../store/chordSuggestionStore';

// Mock the service module — we don't want real ONNX inference in tests
vi.mock('../../../services/chordSuggestionService', () => ({
  addChordAndPredict: vi.fn(),
  undoLastChordAndPredict: vi.fn(),
  clearAll: vi.fn(),
  requestPrediction: vi.fn(),
  ensureModelLoaded: vi.fn().mockResolvedValue(undefined),
}));

// Mock the stores that PianoRoll-related components use
vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      project: {
        timeSignature: 4,
        tracks: [{
          id: 'track-1',
          clips: [{
            id: 'clip-1',
            midiData: { notes: [], grid: '1/16' },
          }],
        }],
      },
      stampChord: vi.fn(),
    }),
  ),
}));

vi.mock('../../../store/uiStore', () => ({
  useUIStore: vi.fn((selector) =>
    selector({
      openPianoRollClipId: 'clip-1',
      openPianoRollTrackId: 'track-1',
    }),
  ),
}));

describe('ChordSuggestionPanel', () => {
  beforeEach(() => {
    useChordSuggestionStore.setState({
      progression: [],
      suggestions: [],
      status: 'ready',
      error: null,
      modelVariant: 'transformer-s',
      styleCondition: { genres: {}, decades: {} },
      topK: 8,
      panelOpen: true,
    });
  });

  it('renders with the AI Chord Suggest label', () => {
    render(<ChordSuggestionPanel />);
    expect(screen.getByText('AI Chord Suggest')).toBeInTheDocument();
  });

  it('renders model selector', () => {
    render(<ChordSuggestionPanel />);
    expect(screen.getByLabelText('Chord AI model')).toBeInTheDocument();
  });

  it('shows empty state with starter chords when no progression', () => {
    render(<ChordSuggestionPanel />);
    expect(screen.getByTitle('Start with C')).toBeInTheDocument();
    expect(screen.getByTitle('Start with Am')).toBeInTheDocument();
    expect(screen.getByTitle('Start with F')).toBeInTheDocument();
  });

  it('shows progression chips when chords are added', () => {
    useChordSuggestionStore.setState({ progression: [0, 1] }); // C, Cm
    render(<ChordSuggestionPanel />);
    expect(screen.getByText('Progression:')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('Cm')).toBeInTheDocument();
  });

  it('shows suggestions with probabilities', () => {
    useChordSuggestionStore.setState({
      progression: [0],
      suggestions: [
        { token: { index: 1, label: 'Cm', root: 0, midiNotes: [60, 63, 67] }, probability: 0.45 },
        { token: { index: 20, label: 'D', root: 2, midiNotes: [62, 66, 69] }, probability: 0.30 },
      ],
    });
    render(<ChordSuggestionPanel />);
    expect(screen.getByText('Next:')).toBeInTheDocument();
    expect(screen.getByTitle(/Add Cm to progression/)).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    useChordSuggestionStore.setState({ status: 'loading-model' });
    render(<ChordSuggestionPanel />);
    expect(screen.getByText('Loading model...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    useChordSuggestionStore.setState({ status: 'error', error: 'Network timeout' });
    render(<ChordSuggestionPanel />);
    expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
  });

  it('undo button is disabled when progression is empty', () => {
    render(<ChordSuggestionPanel />);
    const undoBtn = screen.getByTitle('Undo last chord');
    expect(undoBtn).toBeDisabled();
  });

  it('undo button is enabled when progression has chords', () => {
    useChordSuggestionStore.setState({ progression: [0] });
    render(<ChordSuggestionPanel />);
    const undoBtn = screen.getByTitle('Undo last chord');
    expect(undoBtn).not.toBeDisabled();
  });

  it('calls undoLastChordAndPredict when undo is clicked', async () => {
    const { undoLastChordAndPredict } = await import('../../../services/chordSuggestionService');
    useChordSuggestionStore.setState({ progression: [0, 1] });
    render(<ChordSuggestionPanel />);
    fireEvent.click(screen.getByTitle('Undo last chord'));
    expect(undoLastChordAndPredict).toHaveBeenCalled();
  });

  it('calls clearAll when clear is clicked', async () => {
    const { clearAll } = await import('../../../services/chordSuggestionService');
    useChordSuggestionStore.setState({ progression: [0, 1] });
    render(<ChordSuggestionPanel />);
    fireEvent.click(screen.getByTitle('Clear progression'));
    expect(clearAll).toHaveBeenCalled();
  });

  it('shows genre/decade selectors for conditional models', () => {
    useChordSuggestionStore.setState({ modelVariant: 'conditional-s' });
    render(<ChordSuggestionPanel />);
    expect(screen.getByLabelText('Genre conditioning')).toBeInTheDocument();
    expect(screen.getByLabelText('Decade conditioning')).toBeInTheDocument();
  });

  it('hides genre/decade selectors for non-conditional models', () => {
    useChordSuggestionStore.setState({ modelVariant: 'transformer-s' });
    render(<ChordSuggestionPanel />);
    expect(screen.queryByLabelText('Genre conditioning')).not.toBeInTheDocument();
  });

  it('has stamp-to-piano-roll buttons on suggestions', () => {
    useChordSuggestionStore.setState({
      progression: [0],
      suggestions: [
        { token: { index: 1, label: 'Cm', root: 0, midiNotes: [60, 63, 67] }, probability: 0.5 },
      ],
    });
    render(<ChordSuggestionPanel />);
    expect(screen.getByTitle(/Stamp Cm into piano roll/)).toBeInTheDocument();
  });
});

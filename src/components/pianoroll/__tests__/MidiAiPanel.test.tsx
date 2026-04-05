import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MidiAiPanel } from '../MidiAiPanel';
import { useMidiAiStore } from '../../../store/midiAiStore';

// Mock the service — no real API calls in tests
vi.mock('../../../services/midiAiService', () => ({
  generateMidiAi: vi.fn(),
  serializeNotesToMidiContext: vi.fn(() => ''),
  deserializeMidiResult: vi.fn(() => []),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      project: {
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        tracks: [{
          id: 'track-1',
          clips: [{
            id: 'clip-1',
            midiData: {
              notes: [
                { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
                { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 },
              ],
              grid: '1/16',
            },
          }],
        }],
      },
      addMidiNote: vi.fn(),
      removeMidiNote: vi.fn(),
    }),
  ),
}));

vi.mock('../../../store/uiStore', () => ({
  useUIStore: vi.fn((selector) =>
    selector({
      selectedPianoRollNoteIds: [],
    }),
  ),
}));

describe('MidiAiPanel', () => {
  beforeEach(() => {
    useMidiAiStore.getState().closePanel();
    useMidiAiStore.getState().openPanel('track-1', 'clip-1');
  });

  it('renders with the AI MIDI Generate label', () => {
    render(<MidiAiPanel />);
    expect(screen.getByText('AI MIDI Generate')).toBeInTheDocument();
  });

  it('shows mode selector buttons', () => {
    render(<MidiAiPanel />);
    expect(screen.getByText('Infill')).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Variation')).toBeInTheDocument();
    expect(screen.getByText('Arrange')).toBeInTheDocument();
  });

  it('switches mode on button click', () => {
    render(<MidiAiPanel />);
    fireEvent.click(screen.getByText('Continue'));
    expect(useMidiAiStore.getState().mode).toBe('continue');
  });

  it('shows generate button', () => {
    render(<MidiAiPanel />);
    expect(screen.getByText(/Generate \(infill\)/)).toBeInTheDocument();
  });

  it('disables generate in infill mode without selection', () => {
    useMidiAiStore.getState().setMode('infill');
    render(<MidiAiPanel />);
    const btn = screen.getByText('Generate (infill)');
    expect(btn).toBeDisabled();
  });

  it('enables generate in infill mode with selection', () => {
    useMidiAiStore.getState().setMode('infill');
    useMidiAiStore.getState().setSelection(0, 4);
    render(<MidiAiPanel />);
    const btn = screen.getByText('Generate (infill)');
    expect(btn).not.toBeDisabled();
  });

  it('shows selection region info', () => {
    useMidiAiStore.getState().setMode('infill');
    useMidiAiStore.getState().setSelection(0, 8);
    render(<MidiAiPanel />);
    expect(screen.getByText(/Region:.*0\.0.*8\.0.*beats/)).toBeInTheDocument();
  });

  it('shows locked note count', () => {
    useMidiAiStore.getState().lockNotes(['n1', 'n2']);
    render(<MidiAiPanel />);
    expect(screen.getByText('2 notes locked')).toBeInTheDocument();
  });

  it('shows generating status', () => {
    useMidiAiStore.getState().startGeneration();
    render(<MidiAiPanel />);
    // Both the status indicator and the button show "Generating..."
    expect(screen.getAllByText('Generating...')).toHaveLength(2);
  });

  it('shows error status and retry button', () => {
    useMidiAiStore.getState().setError('Connection failed');
    render(<MidiAiPanel />);
    expect(screen.getByText(/Error:.*Connection failed/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows preview controls when previewing variations', () => {
    useMidiAiStore.getState().setVariations([
      {
        id: 'v1',
        notes: [{ id: 'gen-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }],
        score: 0.85,
        model: 'anticipatory-music-transformer',
      },
      {
        id: 'v2',
        notes: [{ id: 'gen-2', pitch: 62, startBeat: 1, durationBeats: 1, velocity: 90 }],
        score: 0.72,
        model: 'anticipatory-music-transformer',
      },
    ]);

    render(<MidiAiPanel />);
    expect(screen.getByText('Preview:')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Score: 85%')).toBeInTheDocument();
    expect(screen.getByText('1 notes')).toBeInTheDocument();
  });

  it('navigates between variations', () => {
    useMidiAiStore.getState().setVariations([
      { id: 'v1', notes: [], model: 'test' },
      { id: 'v2', notes: [], model: 'test' },
    ]);

    render(<MidiAiPanel />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('>'));
    expect(useMidiAiStore.getState().activeVariationIndex).toBe(1);
  });

  it('rejects variations and returns to idle', () => {
    useMidiAiStore.getState().setVariations([
      { id: 'v1', notes: [], model: 'test' },
    ]);

    render(<MidiAiPanel />);
    fireEvent.click(screen.getByText('Reject'));
    expect(useMidiAiStore.getState().status).toBe('idle');
    expect(useMidiAiStore.getState().variations).toHaveLength(0);
  });

  it('shows close button', () => {
    render(<MidiAiPanel />);
    fireEvent.click(screen.getByTitle('Close AI MIDI panel'));
    expect(useMidiAiStore.getState().panelOpen).toBe(false);
  });

  it('updates temperature via slider', () => {
    render(<MidiAiPanel />);
    const slider = screen.getByTitle(/Temperature/);
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(useMidiAiStore.getState().temperature).toBe(0.5);
  });
});

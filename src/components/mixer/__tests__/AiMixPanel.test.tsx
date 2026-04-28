import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiMixPanel } from '../AiMixPanel';
import { useAiMixStore } from '../../../store/aiMixStore';
import type { AiMixResult } from '../../../types/api';

vi.mock('../../../services/aiMixService', () => ({
  analyzeAiMix: vi.fn(),
  formatDb: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`,
  formatPan: (v: number) => Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`,
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      project: {
        tracks: [
          { id: 't1', trackName: 'vocals', displayName: 'Vocals', volume: 0 },
          { id: 't2', trackName: 'drums', displayName: 'Drums', volume: 0 },
        ],
      },
      updateTrack: vi.fn(),
      updateTrackMixer: vi.fn(),
    }),
  ),
}));

const makeSuggestion = (): AiMixResult => ({
  tracks: {
    vocals: { gain_db: -3, pan: 0, reverb_send: 0.2 },
    drums: { gain_db: -1, pan: 0 },
  },
  master: { target_lufs: -14, limiter_ceiling_db: -0.3 },
});

describe('AiMixPanel', () => {
  beforeEach(() => {
    useAiMixStore.getState().closePanel();
    useAiMixStore.getState().openPanel();
  });

  it('renders with AI Mix label', () => {
    render(<AiMixPanel />);
    expect(screen.getByTestId('ai-mix-panel')).toBeInTheDocument();
    // Header label + button both say "AI Mix"
    expect(screen.getAllByText('AI Mix')).toHaveLength(2);
  });

  it('shows mode buttons', () => {
    render(<AiMixPanel />);
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('switches mode', () => {
    render(<AiMixPanel />);
    fireEvent.click(screen.getByText('Text'));
    expect(useAiMixStore.getState().mode).toBe('text');
  });

  it('shows text input in text mode', () => {
    useAiMixStore.getState().setMode('text');
    render(<AiMixPanel />);
    expect(screen.getByPlaceholderText(/warm vocals/)).toBeInTheDocument();
  });

  it('shows AI Mix button when idle', () => {
    render(<AiMixPanel />);
    expect(screen.getByLabelText('Analyze mix with AI')).toBeInTheDocument();
  });

  it('shows analyzing state', () => {
    useAiMixStore.getState().startAnalysis();
    render(<AiMixPanel />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    expect(screen.getByText(/Analyzing tracks/)).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    useAiMixStore.getState().setError('Server offline');
    render(<AiMixPanel />);
    expect(screen.getByText(/Error:.*Server offline/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows track suggestions when reviewing', () => {
    useAiMixStore.getState().setSuggestion(makeSuggestion());
    render(<AiMixPanel />);
    expect(screen.getByText(/vocals/)).toBeInTheDocument();
    expect(screen.getByText(/drums/)).toBeInTheDocument();
    expect(screen.getByText('Accept All')).toBeInTheDocument();
    expect(screen.getByText('Reject All')).toBeInTheDocument();
  });

  it('rejects all suggestions', () => {
    useAiMixStore.getState().setSuggestion(makeSuggestion());
    render(<AiMixPanel />);
    fireEvent.click(screen.getByText('Reject All'));
    expect(useAiMixStore.getState().status).toBe('idle');
    expect(useAiMixStore.getState().suggestion).toBeNull();
  });

  it('shows LUFS target buttons', () => {
    render(<AiMixPanel />);
    expect(screen.getByText('-14')).toBeInTheDocument();
    expect(screen.getByText('-11')).toBeInTheDocument();
    expect(screen.getByText('-8')).toBeInTheDocument();
  });

  it('sets LUFS target', () => {
    render(<AiMixPanel />);
    fireEvent.click(screen.getByText('-11'));
    expect(useAiMixStore.getState().targetLufs).toBe(-11);
  });

  it('shows master bus suggestion', () => {
    useAiMixStore.getState().setSuggestion(makeSuggestion());
    render(<AiMixPanel />);
    expect(screen.getByText('Master Bus')).toBeInTheDocument();
    expect(screen.getByText('-14 LUFS')).toBeInTheDocument();
  });

  it('closes panel', () => {
    render(<AiMixPanel />);
    fireEvent.click(screen.getByText('Close'));
    expect(useAiMixStore.getState().panelOpen).toBe(false);
  });
});

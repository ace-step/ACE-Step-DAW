import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VariationComparisonPanel } from '../VariationComparisonPanel';
import { useGenerationStore } from '../../../store/generationStore';
import type { VariationSession, Variation } from '../../../store/generationStore';

function makeVariation(overrides: Partial<Variation> = {}): Variation {
  return {
    index: 0,
    status: 'done',
    clipId: 'clip-1',
    progress: 'done',
    progressPercent: 100,
    ...overrides,
  };
}

function makeSession(overrides: Partial<VariationSession> = {}): VariationSession {
  return {
    id: 'session-1',
    prompt: 'epic orchestral soundtrack',
    trackId: 'track-1',
    variations: [
      makeVariation({ index: 0, clipId: 'clip-0' }),
      makeVariation({ index: 1, clipId: 'clip-1' }),
      makeVariation({ index: 2, clipId: 'clip-2', status: 'generating', progressPercent: 45, stage: 'inference' }),
    ],
    activeVariationIndex: 0,
    status: 'generating',
    params: {
      prompt: 'epic orchestral soundtrack',
      trackId: 'track-1',
      variationCount: 3,
      bpm: 120,
      keyScale: 'C Major',
      duration: 30,
      guidanceScale: 3.5,
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('VariationComparisonPanel', () => {
  beforeEach(() => {
    useGenerationStore.setState({ variationSession: null });
  });

  it('renders nothing when no variation session exists', () => {
    const { container } = render(<VariationComparisonPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders variation cards for each variation in session', () => {
    useGenerationStore.setState({ variationSession: makeSession() });
    render(<VariationComparisonPanel />);
    const cards = screen.getAllByTestId(/^variation-card-/);
    expect(cards).toHaveLength(3);
  });

  it('highlights the active variation', () => {
    useGenerationStore.setState({ variationSession: makeSession({ activeVariationIndex: 1 }) });
    render(<VariationComparisonPanel />);
    const activeCard = screen.getByTestId('variation-card-1');
    expect(activeCard).toHaveAttribute('aria-pressed', 'true');
    const inactiveCard = screen.getByTestId('variation-card-0');
    expect(inactiveCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls setActiveVariation when a card is clicked', () => {
    const setActiveVariation = vi.fn();
    useGenerationStore.setState({
      variationSession: makeSession(),
      setActiveVariation,
    });
    render(<VariationComparisonPanel />);
    fireEvent.click(screen.getByTestId('variation-card-2'));
    expect(setActiveVariation).toHaveBeenCalledWith(2);
  });

  it('shows keyboard hint (1, 2, 3) on each card', () => {
    useGenerationStore.setState({ variationSession: makeSession() });
    render(<VariationComparisonPanel />);
    // Each card has a key hint badge showing its number
    const card0 = screen.getByTestId('variation-card-0');
    const card1 = screen.getByTestId('variation-card-1');
    const card2 = screen.getByTestId('variation-card-2');
    expect(within(card0).getByText('1')).toBeInTheDocument();
    expect(within(card1).getByText('2')).toBeInTheDocument();
    expect(within(card2).getByText('3')).toBeInTheDocument();
  });

  it('shows progress bar for generating variations', () => {
    useGenerationStore.setState({ variationSession: makeSession() });
    render(<VariationComparisonPanel />);
    const card = screen.getByTestId('variation-card-2');
    const progressBar = within(card).getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '45');
  });

  it('shows done status for completed variations', () => {
    useGenerationStore.setState({ variationSession: makeSession() });
    render(<VariationComparisonPanel />);
    const card = screen.getByTestId('variation-card-0');
    expect(within(card).getByText(/done/i)).toBeInTheDocument();
  });

  it('shows session prompt text', () => {
    useGenerationStore.setState({ variationSession: makeSession() });
    render(<VariationComparisonPanel />);
    expect(screen.getByText('epic orchestral soundtrack')).toBeInTheDocument();
  });

  it('shows cancel button when session is generating', () => {
    const cancelVariationSession = vi.fn();
    useGenerationStore.setState({
      variationSession: makeSession({ status: 'generating' }),
      cancelVariationSession,
    });
    render(<VariationComparisonPanel />);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(cancelVariationSession).toHaveBeenCalled();
  });

  it('hides cancel button when session is done', () => {
    useGenerationStore.setState({
      variationSession: makeSession({
        status: 'done',
        variations: [
          makeVariation({ index: 0 }),
          makeVariation({ index: 1 }),
        ],
      }),
    });
    render(<VariationComparisonPanel />);
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('shows clear button to dismiss session', () => {
    const clearVariationSession = vi.fn();
    useGenerationStore.setState({
      variationSession: makeSession({ status: 'done', variations: [makeVariation()] }),
      clearVariationSession,
    });
    render(<VariationComparisonPanel />);
    const clearBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(clearBtn);
    expect(clearVariationSession).toHaveBeenCalled();
  });

  it('displays model name when available', () => {
    useGenerationStore.setState({
      variationSession: makeSession({
        variations: [
          makeVariation({ index: 0, modelName: 'ace-step-v1.5' }),
          makeVariation({ index: 1, modelName: 'ace-step-v2.0' }),
        ],
      }),
    });
    render(<VariationComparisonPanel />);
    expect(screen.getByText('ace-step-v1.5')).toBeInTheDocument();
    expect(screen.getByText('ace-step-v2.0')).toBeInTheDocument();
  });

  it('shows error state for failed variations', () => {
    useGenerationStore.setState({
      variationSession: makeSession({
        variations: [
          makeVariation({ index: 0, status: 'error', error: 'GPU out of memory' }),
        ],
      }),
    });
    render(<VariationComparisonPanel />);
    const card = screen.getByTestId('variation-card-0');
    expect(within(card).getByText(/error/i)).toBeInTheDocument();
    expect(within(card).getByText('GPU out of memory')).toBeInTheDocument();
  });
});

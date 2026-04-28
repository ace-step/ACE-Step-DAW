import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrangementAssistantPanel } from '../ArrangementAssistantPanel';
import { useArrangementAssistantStore } from '../../../store/arrangementAssistantStore';
import { useProjectStore } from '../../../store/projectStore';

// Mock the analysis service
vi.mock('../../../services/arrangementAnalysis', () => ({
  analyzeArrangement: vi.fn(() => ({
    sections: [
      { id: 'sec-1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.8 },
    ],
    suggestions: [
      {
        id: 'sug-1',
        kind: 'next-section',
        title: 'Add chorus',
        description: 'Add a chorus section after the verse',
        time: 30,
        duration: 16,
        trackIds: [],
        sectionType: 'chorus',
        status: 'pending',
      },
    ],
    projectMeta: { bpm: 120, keyScale: 'C major', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
  })),
}));

describe('ArrangementAssistantPanel', () => {
  beforeEach(() => {
    useArrangementAssistantStore.setState({
      isOpen: false,
      isAnalyzing: false,
      sections: [],
      suggestions: [],
      projectMeta: null,
      error: null,
      lastAnalyzedProjectId: null,
    });
    useProjectStore.setState({
      project: {
        id: 'p1',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 60,
        tracks: [],
        generationDefaults: {} as any,
      },
    });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ArrangementAssistantPanel />);
    expect(container.querySelector('[data-testid="arrangement-assistant-panel"]')).toBeNull();
  });

  it('renders the panel when open', () => {
    useArrangementAssistantStore.setState({ isOpen: true, lastAnalyzedProjectId: 'p1' });
    render(<ArrangementAssistantPanel />);
    expect(screen.getByTestId('arrangement-assistant-panel')).toBeTruthy();
    expect(screen.getByText('Arrangement Assistant')).toBeTruthy();
  });

  it('shows suggestions when available', () => {
    useArrangementAssistantStore.setState({
      isOpen: true,
      lastAnalyzedProjectId: 'p1',
      suggestions: [
        {
          id: 'sug-1',
          kind: 'next-section',
          title: 'Add chorus',
          description: 'Add a chorus section',
          time: 30,
          duration: 16,
          trackIds: [],
          sectionType: 'chorus',
          status: 'pending',
        },
      ],
      sections: [
        { id: 'sec-1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.8 },
      ],
    });
    render(<ArrangementAssistantPanel />);
    expect(screen.getByText('Add chorus')).toBeTruthy();
  });

  it('shows sections in the sections tab', () => {
    useArrangementAssistantStore.setState({
      isOpen: true,
      lastAnalyzedProjectId: 'p1',
      sections: [
        { id: 'sec-1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.8 },
      ],
    });
    render(<ArrangementAssistantPanel />);
    // Click sections tab
    fireEvent.click(screen.getByText(/Sections/));
    expect(screen.getByText('verse')).toBeTruthy();
  });

  it('accepts a suggestion when Accept is clicked', () => {
    useArrangementAssistantStore.setState({
      isOpen: true,
      lastAnalyzedProjectId: 'p1',
      suggestions: [
        {
          id: 'sug-1',
          kind: 'next-section',
          title: 'Add chorus',
          description: 'Add a chorus section',
          time: 30,
          duration: 16,
          trackIds: [],
          status: 'pending',
        },
      ],
    });
    render(<ArrangementAssistantPanel />);
    fireEvent.click(screen.getByTestId('accept-suggestion-sug-1'));
    expect(useArrangementAssistantStore.getState().suggestions[0].status).toBe('accepted');
  });

  it('rejects a suggestion when Dismiss is clicked', () => {
    useArrangementAssistantStore.setState({
      isOpen: true,
      lastAnalyzedProjectId: 'p1',
      suggestions: [
        {
          id: 'sug-1',
          kind: 'next-section',
          title: 'Add chorus',
          description: 'Add a chorus section',
          time: 30,
          duration: 16,
          trackIds: [],
          status: 'pending',
        },
      ],
    });
    render(<ArrangementAssistantPanel />);
    fireEvent.click(screen.getByTestId('reject-suggestion-sug-1'));
    expect(useArrangementAssistantStore.getState().suggestions[0].status).toBe('rejected');
  });

  it('closes panel when close button is clicked', () => {
    useArrangementAssistantStore.setState({ isOpen: true, lastAnalyzedProjectId: 'p1' });
    render(<ArrangementAssistantPanel />);
    fireEvent.click(screen.getByTestId('arrangement-close'));
    expect(useArrangementAssistantStore.getState().isOpen).toBe(false);
  });

  it('shows project metadata when available', () => {
    useArrangementAssistantStore.setState({
      isOpen: true,
      lastAnalyzedProjectId: 'p1',
      projectMeta: { bpm: 120, keyScale: 'C major', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
    });
    render(<ArrangementAssistantPanel />);
    expect(screen.getByText('120 BPM')).toBeTruthy();
    expect(screen.getByText('C major')).toBeTruthy();
  });

  it('shows error message when present', () => {
    // Set lastAnalyzedProjectId to match project so auto-analyze doesn't trigger
    useArrangementAssistantStore.setState({
      isOpen: true,
      error: 'Analysis failed',
      sections: [
        { id: 'sec-1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.8 },
      ],
      lastAnalyzedProjectId: 'p1',
    });
    render(<ArrangementAssistantPanel />);
    expect(screen.getByText('Analysis failed')).toBeTruthy();
  });
});

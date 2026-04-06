import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useArrangementAssistantStore } from '../arrangementAssistantStore';
import { useProjectStore } from '../projectStore';

// Mock the analysis service
vi.mock('../../services/arrangementAnalysis', () => ({
  analyzeArrangement: vi.fn(() => ({
    sections: [
      { id: 'sec-1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.8 },
    ],
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
      {
        id: 'sug-2',
        kind: 'fill-gap',
        title: 'Fill gap',
        description: 'Fill a gap',
        time: 10,
        duration: 5,
        trackIds: ['t1'],
        prompt: 'fill it',
        status: 'pending',
      },
    ],
    projectMeta: { bpm: 120, keyScale: 'C major', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
  })),
}));

describe('arrangementAssistantStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useArrangementAssistantStore.setState({
      isOpen: false,
      isAnalyzing: false,
      sections: [],
      suggestions: [],
      projectMeta: null,
      error: null,
      lastAnalyzedProjectId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed with no data', () => {
    const state = useArrangementAssistantStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.sections).toEqual([]);
    expect(state.suggestions).toEqual([]);
  });

  it('toggles panel open/closed', () => {
    useArrangementAssistantStore.getState().toggle();
    expect(useArrangementAssistantStore.getState().isOpen).toBe(true);
    useArrangementAssistantStore.getState().toggle();
    expect(useArrangementAssistantStore.getState().isOpen).toBe(false);
  });

  it('sets open state directly', () => {
    useArrangementAssistantStore.getState().setOpen(true);
    expect(useArrangementAssistantStore.getState().isOpen).toBe(true);
  });

  it('analyzes arrangement and populates state', () => {
    // Set up a project in projectStore
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

    useArrangementAssistantStore.getState().analyze();
    // Analysis runs in setTimeout(fn, 0) — advance timers
    vi.advanceTimersByTime(0);

    const state = useArrangementAssistantStore.getState();
    expect(state.isAnalyzing).toBe(false);
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].type).toBe('verse');
    expect(state.suggestions).toHaveLength(2);
    expect(state.projectMeta?.bpm).toBe(120);
    expect(state.error).toBeNull();
  });

  it('sets error when no project is open', () => {
    useProjectStore.setState({ project: null });
    useArrangementAssistantStore.getState().analyze();
    expect(useArrangementAssistantStore.getState().error).toBe('No project open');
  });

  it('accepts a suggestion by id', () => {
    useArrangementAssistantStore.setState({
      suggestions: [
        { id: 'sug-1', kind: 'next-section', title: 'Add chorus', description: '', time: 30, duration: 16, trackIds: [], status: 'pending' },
        { id: 'sug-2', kind: 'fill-gap', title: 'Fill gap', description: '', time: 10, duration: 5, trackIds: [], status: 'pending' },
      ],
    });

    useArrangementAssistantStore.getState().acceptSuggestion('sug-1');

    const suggestions = useArrangementAssistantStore.getState().suggestions;
    expect(suggestions[0].status).toBe('accepted');
    expect(suggestions[1].status).toBe('pending');
  });

  it('rejects a suggestion by id', () => {
    useArrangementAssistantStore.setState({
      suggestions: [
        { id: 'sug-1', kind: 'next-section', title: 'Add chorus', description: '', time: 30, duration: 16, trackIds: [], status: 'pending' },
      ],
    });

    useArrangementAssistantStore.getState().rejectSuggestion('sug-1');
    expect(useArrangementAssistantStore.getState().suggestions[0].status).toBe('rejected');
  });

  it('clears all analysis data', () => {
    useArrangementAssistantStore.setState({
      sections: [{ id: '1', type: 'verse', startTime: 0, endTime: 30, trackIds: [], confidence: 0.8 }],
      suggestions: [{ id: '1', kind: 'next-section', title: '', description: '', time: 0, duration: 10, trackIds: [], status: 'pending' }],
      projectMeta: { bpm: 120, keyScale: 'C', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
    });

    useArrangementAssistantStore.getState().clear();

    const state = useArrangementAssistantStore.getState();
    expect(state.sections).toEqual([]);
    expect(state.suggestions).toEqual([]);
    expect(state.projectMeta).toBeNull();
  });
});

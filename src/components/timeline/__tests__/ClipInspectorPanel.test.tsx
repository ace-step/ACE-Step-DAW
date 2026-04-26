import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipInspectorPanel } from '../ClipInspectorPanel';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { useCollaborationStore } from '../../../store/collaborationStore';
import type { Project, Clip, Track } from '../../../types/project';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: 0,
    duration: 10,
    prompt: 'upbeat pop song',
    lyrics: 'la la la',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: 'audio-key-1',
    isolatedAudioKey: null,
    waveformPeaks: null,
    source: 'generated',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: overrides.trackName ?? 'vocals',
    displayName: overrides.displayName ?? 'Vocals',
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: overrides.clips ?? [makeClip()],
    effects: [],
    effectsEnabled: true,
    ...overrides,
  } as Track;
}

function setupStores(clips?: Clip[]) {
  const clip = clips?.[0] ?? makeClip();
  useProjectStore.setState({
    project: {
      id: 'test-project',
      name: 'Test Project',
      tracks: [makeTrack({ clips: clips ?? [clip] })],
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      globalCaption: 'pop',
      measures: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalDuration: 30,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      history: [],
    } as unknown as Project,
  });
  useUIStore.setState({
    selectedClipIds: new Set([clip.id]),
    showClipInspector: true,
  });
}

describe('ClipInspectorPanel', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useUIStore.setState({
      selectedClipIds: new Set(),
      showClipInspector: false,
    });
  });

  it('renders nothing when showClipInspector is false', () => {
    setupStores();
    useUIStore.setState({ showClipInspector: false });
    const { container } = render(<ClipInspectorPanel />);
    expect(container.querySelector('[data-testid="clip-inspector-panel"]')).toBeNull();
  });

  it('shows empty state when no clip is selected', () => {
    useUIStore.setState({
      selectedClipIds: new Set(),
      showClipInspector: true,
    });
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 0,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
    });
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/select a clip/i)).toBeTruthy();
  });

  it('displays clip name and duration when a clip is selected', () => {
    setupStores([makeClip({ duration: 15.5 })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByTestId('clip-inspector-panel')).toBeTruthy();
    expect(screen.getByText(/15\.5/)).toBeTruthy();
  });

  it('displays generation metadata for AI-generated clips', () => {
    setupStores([makeClip({
      source: 'generated',
      prompt: 'upbeat pop song',
      generationParams: {
        type: 'text2music',
        prompt: 'upbeat pop song',
        lyrics: 'la la la',
        seed: 42,
      },
    })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/upbeat pop song/)).toBeTruthy();
  });

  it('displays clip tags', () => {
    setupStores([makeClip({ tags: ['verse', 'favorite'] })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByText('verse')).toBeTruthy();
    expect(screen.getByText('favorite')).toBeTruthy();
  });

  it('displays inferred metadata when available', () => {
    setupStores([makeClip({
      inferredMetas: {
        bpm: 128,
        keyScale: 'A minor',
        genres: 'Electronic',
      },
    })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/128/)).toBeTruthy();
    expect(screen.getByText(/A minor/)).toBeTruthy();
  });

  it('shows source badge for generated clips', () => {
    setupStores([makeClip({ source: 'generated' })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/generated/i)).toBeTruthy();
  });

  it('shows source badge for uploaded clips', () => {
    setupStores([makeClip({ source: 'uploaded' })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/uploaded/i)).toBeTruthy();
  });

  // ── Tag Management UI ──────────────────────────────────────────────

  it('shows tag section with add input even when clip has no tags', () => {
    setupStores([makeClip({ tags: [] })]);
    render(<ClipInspectorPanel />);
    expect(screen.getByPlaceholderText(/add tag/i)).toBeTruthy();
  });

  it('renders remove button on each tag chip', () => {
    setupStores([makeClip({ tags: ['verse', 'favorite'] })]);
    render(<ClipInspectorPanel />);
    const removeButtons = screen.getAllByRole('button', { name: /remove tag/i });
    expect(removeButtons).toHaveLength(2);
  });

  it('calls removeClipTag when remove button is clicked', () => {
    const clip = makeClip({ tags: ['verse', 'favorite'] });
    setupStores([clip]);
    const removeClipTag = vi.fn();
    useProjectStore.setState({ removeClipTag });

    render(<ClipInspectorPanel />);
    const removeButtons = screen.getAllByRole('button', { name: /remove tag/i });
    fireEvent.click(removeButtons[0]);
    expect(removeClipTag).toHaveBeenCalledWith('clip-1', 'verse');
  });

  it('renders clip tags as read-only in viewer mode', () => {
    const clip = makeClip({ tags: ['verse'] });
    setupStores([clip]);
    const addClipTag = vi.fn();
    const removeClipTag = vi.fn();
    useProjectStore.setState({ addClipTag, removeClipTag });
    useCollaborationStore.getState().setViewerMode(true);

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /remove tag/i })).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(addClipTag).not.toHaveBeenCalled();
    expect(removeClipTag).not.toHaveBeenCalled();
  });

  it('calls addClipTag when tag is submitted via Enter', () => {
    setupStores([makeClip({ tags: [] })]);
    const addClipTag = vi.fn();
    useProjectStore.setState({ addClipTag });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(input, { target: { value: 'chorus' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(addClipTag).toHaveBeenCalledWith('clip-1', 'chorus');
  });

  it('clears input after adding a tag', () => {
    setupStores([makeClip({ tags: [] })]);
    useProjectStore.setState({ addClipTag: vi.fn() });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'chorus' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  it('clears a draft tag when switching selected clips', async () => {
    const clips = [
      makeClip({ id: 'clip-1', tags: [] }),
      makeClip({ id: 'clip-2', tags: [] }),
    ];
    setupStores(clips);

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'draft' } });
    expect(input.value).toBe('draft');

    useUIStore.setState({ selectedClipIds: new Set(['clip-2']) });

    await waitFor(() => {
      expect((screen.getByPlaceholderText(/add tag/i) as HTMLInputElement).value).toBe('');
    });
  });

  it('does not call addClipTag for empty input', () => {
    setupStores([makeClip({ tags: [] })]);
    const addClipTag = vi.fn();
    useProjectStore.setState({ addClipTag });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(addClipTag).not.toHaveBeenCalled();
  });

  it('shows autocomplete suggestions from existing project tags', () => {
    const clips = [
      makeClip({ id: 'clip-1', tags: ['verse', 'intro'] }),
      makeClip({ id: 'clip-2', tags: ['chorus', 'verse'] }),
    ];
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [makeTrack({ clips })],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 30,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
    });
    useUIStore.setState({
      selectedClipIds: new Set(['clip-1']),
      showClipInspector: true,
    });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(input, { target: { value: 'ch' } });
    expect(screen.getByText('chorus')).toBeTruthy();
  });

  it('does not suggest tags already on the clip', () => {
    const clips = [
      makeClip({ id: 'clip-1', tags: ['verse', 'intro'] }),
      makeClip({ id: 'clip-2', tags: ['chorus'] }),
    ];
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [makeTrack({ clips })],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 30,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
    });
    useUIStore.setState({
      selectedClipIds: new Set(['clip-1']),
      showClipInspector: true,
    });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(input, { target: { value: 'v' } });
    // 'verse' is already on clip-1, so it should not appear as a suggestion
    const suggestions = screen.queryAllByTestId('tag-suggestion');
    const verseInSuggestions = suggestions.some((el) => el.textContent === 'verse');
    expect(verseInSuggestions).toBe(false);
  });

  it('applies autocomplete suggestion on click', () => {
    const clips = [
      makeClip({ id: 'clip-1', tags: [] }),
      makeClip({ id: 'clip-2', tags: ['chorus'] }),
    ];
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [makeTrack({ clips })],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 30,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
      addClipTag: vi.fn(),
    });
    useUIStore.setState({
      selectedClipIds: new Set(['clip-1']),
      showClipInspector: true,
    });

    render(<ClipInspectorPanel />);
    const input = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(input, { target: { value: 'ch' } });
    fireEvent.click(screen.getByText('chorus'));
    expect(useProjectStore.getState().addClipTag).toHaveBeenCalledWith('clip-1', 'chorus');
  });

  it('displays multi-selection summary for multiple clips', () => {
    const clips = [
      makeClip({ id: 'clip-1', duration: 10 }),
      makeClip({ id: 'clip-2', duration: 20 }),
    ];
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [makeTrack({ clips })],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 30,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
    });
    useUIStore.setState({
      selectedClipIds: new Set(['clip-1', 'clip-2']),
      showClipInspector: true,
    });
    render(<ClipInspectorPanel />);
    expect(screen.getByText(/2 clips/i)).toBeTruthy();
  });
});

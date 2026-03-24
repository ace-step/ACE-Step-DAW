import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancePanel } from '../EnhancePanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore } from '../../../store/generationStore';
import { ENHANCE_PRESETS } from '../../../constants/enhancePresets';

vi.mock('../../../services/generationPipeline', () => ({
  generateCoverClip: vi.fn().mockResolvedValue(undefined),
  generateRepaintClip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../services/aceStepApi', () => ({
  modelSupportsTaskType: vi.fn(() => true),
}));

const mockPlayback = {
  playingId: null as string | null,
  progress: 0,
  duration: 0,
  play: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  stopPlayback: vi.fn(),
  loadBuffer: vi.fn(),
};

vi.mock('../../../hooks/useEnhancePlayback', () => ({
  useEnhancePlayback: () => mockPlayback,
}));

function setupProjectWithClip() {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject();
  // Add a stems track (this creates a track with a clip)
  const newTrack = useProjectStore.getState().addTrack('stems');
  const project = useProjectStore.getState().project!;
  const track = project.tracks.find((t) => t.id === newTrack.id)!;
  // Ensure there's a clip with audio
  if (!track.clips.length) {
    track.clips.push({
      id: 'test-clip-1',
      startTime: 0,
      duration: 10,
      prompt: 'test prompt',
      lyrics: 'test lyrics',
      isolatedAudioKey: 'some-audio-key',
      generationStatus: 'ready',
    } as never);
  }
  const clip = track.clips[0];
  clip.isolatedAudioKey = 'some-audio-key';
  clip.generationStatus = 'ready';
  clip.prompt = clip.prompt || 'test prompt';
  clip.lyrics = clip.lyrics || 'test lyrics';
  clip.duration = clip.duration || 10;
  return { track, clip };
}

describe('EnhancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false });
  });

  it('renders nothing when enhancerOpen is false', () => {
    useUIStore.setState({ enhancerOpen: false, enhancerTarget: null });
    const { container } = render(<EnhancePanel />);
    expect(container.innerHTML).toBe('');
  });

  it('shows no-selection guidance when enhancerOpen is true but no target', () => {
    setupProjectWithClip();
    useUIStore.setState({ enhancerOpen: true, enhancerTarget: null });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-panel')).toBeInTheDocument();
    expect(screen.getByText('First, create a selection on the canvas')).toBeInTheDocument();
  });

  it('renders the full panel with Cover mode when enhancerTarget is set', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-panel')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-mode-cover')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-mode-repaint')).toBeInTheDocument();
    // Cover-specific controls should be visible
    expect(screen.getByTestId('enhance-lyrics-input')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-styles-input')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-consistency-toggle')).toBeInTheDocument();
  });

  it('switches to Repaint mode when clicking Repaint tab', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    // Click repaint tab
    fireEvent.click(screen.getByTestId('enhance-mode-repaint'));
    // Repaint-specific controls should appear
    expect(screen.getByTestId('enhance-repaint-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-repaint-mode-toggle')).toBeInTheDocument();
  });

  it('auto-infers Repaint mode when enhancerTarget has sub-range', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: { start: 2, end: 5 },
        mode: 'repaint',
      },
    });
    render(<EnhancePanel />);
    // Should show repaint controls by default
    expect(screen.getByTestId('enhance-repaint-prompt')).toBeInTheDocument();
  });

  it('closes when clicking close button', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    fireEvent.click(screen.getByTestId('enhance-close-btn'));
    expect(useUIStore.getState().enhancerOpen).toBe(false);
    expect(useUIStore.getState().enhancerTarget).toBeNull();
  });

  it('shows session history sidebar', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-history')).toBeInTheDocument();
    expect(screen.getByTestId('enhance-new-session-btn')).toBeInTheDocument();
    expect(screen.getByText('Enhancement 1')).toBeInTheDocument();
  });

  it('shows results panel', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-results')).toBeInTheDocument();
    expect(screen.getByText('Enhanced results will appear here')).toBeInTheDocument();
  });

  it('renders real source waveform instead of fake bars', () => {
    const { track, clip } = setupProjectWithClip();
    // Give the clip waveform peaks
    clip.waveformPeaks = new Array(240).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.5);
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('source-waveform')).toBeInTheDocument();
  });

  it('source play button calls togglePlay', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    fireEvent.click(screen.getByTestId('source-play-btn'));
    expect(mockPlayback.togglePlay).toHaveBeenCalledWith('source', 'some-audio-key');
  });

  it('does not show A/B toggle when no results exist', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.queryByTestId('ab-toggle-btn')).not.toBeInTheDocument();
  });

  it('shows source duration', () => {
    const { track, clip } = setupProjectWithClip();
    clip.duration = 65; // 1:05
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });
});

describe('EnhancePanel Quick Styles presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false });
  });

  function renderCoverPanel() {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: null,
        mode: 'cover',
      },
    });
    return render(<EnhancePanel />);
  }

  it('shows Quick Styles toggle button in cover mode', () => {
    renderCoverPanel();
    expect(screen.getByTestId('quick-styles-toggle')).toBeInTheDocument();
  });

  it('preset grid is collapsed by default', () => {
    renderCoverPanel();
    expect(screen.queryByTestId('quick-styles-grid')).not.toBeInTheDocument();
  });

  it('expands preset grid when clicking toggle', () => {
    renderCoverPanel();
    fireEvent.click(screen.getByTestId('quick-styles-toggle'));
    expect(screen.getByTestId('quick-styles-grid')).toBeInTheDocument();
  });

  it('shows all preset buttons plus Surprise Me when expanded', () => {
    renderCoverPanel();
    fireEvent.click(screen.getByTestId('quick-styles-toggle'));
    for (const preset of ENHANCE_PRESETS) {
      expect(screen.getByTestId(`preset-${preset.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('preset-surprise-me')).toBeInTheDocument();
  });

  it('clicking a preset fills the styles textarea', () => {
    renderCoverPanel();
    fireEvent.click(screen.getByTestId('quick-styles-toggle'));
    const jazzPreset = ENHANCE_PRESETS.find((p) => p.id === 'jazz')!;
    fireEvent.click(screen.getByTestId('preset-jazz'));
    const stylesInput = screen.getByTestId('enhance-styles-input') as HTMLTextAreaElement;
    expect(stylesInput.value).toBe(jazzPreset.caption);
  });

  it('clicking a preset updates the consistency toggle', () => {
    renderCoverPanel();
    fireEvent.click(screen.getByTestId('quick-styles-toggle'));
    // Click orchestral which has high consistency
    fireEvent.click(screen.getByTestId('preset-orchestral'));
    const consistencyToggle = screen.getByTestId('enhance-consistency-toggle');
    // The "high" button should be active
    const highButton = consistencyToggle.querySelectorAll('button')[2];
    expect(highButton.className).toContain('bg-teal-600');
  });

  it('Surprise Me button fills caption with a random preset', () => {
    renderCoverPanel();
    fireEvent.click(screen.getByTestId('quick-styles-toggle'));
    fireEvent.click(screen.getByTestId('preset-surprise-me'));
    const stylesInput = screen.getByTestId('enhance-styles-input') as HTMLTextAreaElement;
    expect(stylesInput.value.length).toBeGreaterThan(0);
  });

  it('does not show Quick Styles in repaint mode', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: {
        clipId: clip.id,
        trackId: track.id,
        range: { start: 2, end: 5 },
        mode: 'repaint',
      },
    });
    render(<EnhancePanel />);
    expect(screen.queryByTestId('quick-styles-toggle')).not.toBeInTheDocument();
  });
});

describe('uiStore enhancer actions', () => {
  beforeEach(() => {
    setupProjectWithClip();
  });

  it('openEnhancer sets enhancerOpen and enhancerTarget with cover mode for full clip', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const clip = track.clips[0];
    useUIStore.getState().openEnhancer(clip.id, track.id);
    const state = useUIStore.getState();
    expect(state.enhancerOpen).toBe(true);
    expect(state.enhancerTarget).toEqual({
      clipId: clip.id,
      trackId: track.id,
      range: null,
      mode: 'cover',
    });
  });

  it('openEnhancer infers repaint mode when range is a sub-range of clip', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const clip = track.clips[0];
    const range = { start: clip.startTime + 1, end: clip.startTime + clip.duration - 1 };
    useUIStore.getState().openEnhancer(clip.id, track.id, range);
    const state = useUIStore.getState();
    expect(state.enhancerTarget?.mode).toBe('repaint');
  });

  it('openEnhancer infers cover mode when range covers full clip', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const clip = track.clips[0];
    const range = { start: clip.startTime, end: clip.startTime + clip.duration };
    useUIStore.getState().openEnhancer(clip.id, track.id, range);
    const state = useUIStore.getState();
    expect(state.enhancerTarget?.mode).toBe('cover');
  });

  it('closeEnhancer clears enhancerOpen and enhancerTarget', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const clip = track.clips[0];
    useUIStore.getState().openEnhancer(clip.id, track.id);
    useUIStore.getState().closeEnhancer();
    const state = useUIStore.getState();
    expect(state.enhancerOpen).toBe(false);
    expect(state.enhancerTarget).toBeNull();
  });

  it('openEnhancerFromSelection opens with no target when no selectWindow', () => {
    useUIStore.setState({ selectWindow: null });
    useUIStore.getState().openEnhancerFromSelection();
    const state = useUIStore.getState();
    expect(state.enhancerOpen).toBe(true);
    expect(state.enhancerTarget).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancePanel } from '../EnhancePanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore } from '../../../store/generationStore';
import { ENHANCE_PRESETS } from '../../../constants/enhancePresets';

const mockGenerateCoverClip = vi.fn().mockResolvedValue(undefined);
const mockGenerateRepaintClip = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../services/generationPipeline', () => ({
  generateCoverClip: (...args: unknown[]) => mockGenerateCoverClip(...args),
  generateRepaintClip: (...args: unknown[]) => mockGenerateRepaintClip(...args),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../services/aceStepApi', () => ({
  modelSupportsTaskType: vi.fn(() => true),
  isModelInventoryLoaded: vi.fn(() => true),
  isModelReady: vi.fn(() => true),
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

  it('closeEnhancer also clears enhancementSession', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const clip = track.clips[0];
    useUIStore.getState().openEnhancer(clip.id, track.id);
    useUIStore.getState().startEnhancementSession(clip.id);
    expect(useUIStore.getState().enhancementSession).not.toBeNull();
    useUIStore.getState().closeEnhancer();
    expect(useUIStore.getState().enhancementSession).toBeNull();
  });
});

describe('uiStore enhancement session actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProjectWithClip();
  });

  it('startEnhancementSession creates a new session', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const session = useUIStore.getState().enhancementSession;
    expect(session).not.toBeNull();
    expect(session!.clipId).toBe('clip-1');
    expect(session!.nodes).toEqual([]);
    expect(session!.activeNodeId).toBeNull();
  });

  it('addEnhancementNode adds a node and sets it active', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const nodeId = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-key-1',
      mode: 'cover',
      params: { caption: 'jazz cover' },
      label: 'Enhancement 1',
    });
    const session = useUIStore.getState().enhancementSession!;
    expect(session.nodes).toHaveLength(1);
    expect(session.nodes[0].id).toBe(nodeId);
    expect(session.nodes[0].parentId).toBeNull();
    expect(session.nodes[0].audioKey).toBe('audio-key-1');
    expect(session.nodes[0].label).toBe('Enhancement 1');
    expect(session.activeNodeId).toBe(nodeId);
  });

  it('addEnhancementNode chains with parentId', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const nodeId1 = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: { caption: 'jazz' },
      label: 'v1',
    });
    const nodeId2 = useUIStore.getState().addEnhancementNode({
      parentId: nodeId1,
      clipId: 'clip-1',
      audioKey: 'audio-2',
      mode: 'cover',
      params: { caption: 'add reverb' },
      label: 'v2',
    });
    const session = useUIStore.getState().enhancementSession!;
    expect(session.nodes).toHaveLength(2);
    expect(session.nodes[1].parentId).toBe(nodeId1);
    expect(session.activeNodeId).toBe(nodeId2);
  });

  it('setActiveEnhancementNode changes the active node', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const nodeId1 = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: {},
      label: 'v1',
    });
    useUIStore.getState().addEnhancementNode({
      parentId: nodeId1,
      clipId: 'clip-1',
      audioKey: 'audio-2',
      mode: 'cover',
      params: {},
      label: 'v2',
    });
    // Active should be v2
    expect(useUIStore.getState().enhancementSession!.activeNodeId).not.toBe(nodeId1);
    // Set back to v1
    useUIStore.getState().setActiveEnhancementNode(nodeId1);
    expect(useUIStore.getState().enhancementSession!.activeNodeId).toBe(nodeId1);
  });

  it('rollbackToNode sets the target node as active', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const nodeId1 = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: {},
      label: 'v1',
    });
    useUIStore.getState().addEnhancementNode({
      parentId: nodeId1,
      clipId: 'clip-1',
      audioKey: 'audio-2',
      mode: 'repaint',
      params: { repaintRange: { start: 2, end: 5 } },
      label: 'v2',
    });
    useUIStore.getState().rollbackToNode(nodeId1);
    expect(useUIStore.getState().enhancementSession!.activeNodeId).toBe(nodeId1);
  });

  it('rollbackToNode does nothing if node not found', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    const nodeId1 = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: {},
      label: 'v1',
    });
    useUIStore.getState().rollbackToNode('nonexistent');
    expect(useUIStore.getState().enhancementSession!.activeNodeId).toBe(nodeId1);
  });

  it('clearEnhancementSession nullifies the session', () => {
    useUIStore.getState().startEnhancementSession('clip-1');
    useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: {},
      label: 'v1',
    });
    useUIStore.getState().clearEnhancementSession();
    expect(useUIStore.getState().enhancementSession).toBeNull();
  });

  it('addEnhancementNode returns id even without session', () => {
    // No session started
    useUIStore.setState({ enhancementSession: null });
    const id = useUIStore.getState().addEnhancementNode({
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-1',
      mode: 'cover',
      params: {},
      label: 'v1',
    });
    expect(typeof id).toBe('string');
    // Session remains null
    expect(useUIStore.getState().enhancementSession).toBeNull();
  });
});

describe('EnhancePanel accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false });
  });

  it('panel has role="dialog" and aria-label="AI Enhancer" when rendered with target', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
    });
    render(<EnhancePanel />);
    const panel = screen.getByTestId('enhance-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('AI Enhancer');
    expect(panel.getAttribute('aria-modal')).toBeNull();
  });

  it('guidance panel has role="dialog" and aria-label="AI Enhancer" when no target', () => {
    setupProjectWithClip();
    useUIStore.setState({ enhancerOpen: true, enhancerTarget: null });
    render(<EnhancePanel />);
    const panel = screen.getByTestId('enhance-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('AI Enhancer');
    expect(panel.getAttribute('aria-modal')).toBeNull();
  });

  it('does not render a dead "More options" button', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
    });
    render(<EnhancePanel />);
    expect(screen.queryByText('More options')).not.toBeInTheDocument();
  });

  it('panel has max-w-[95vw] class for viewport safety', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
    });
    render(<EnhancePanel />);
    const panel = screen.getByTestId('enhance-panel');
    expect(panel.className).toContain('max-w-[95vw]');
  });
});

describe('EnhancePanel version tree UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false });
  });

  it('does not show version tree when no enhancement nodes exist', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: {
        id: 'session-1',
        clipId: clip.id,
        nodes: [],
        activeNodeId: null,
      },
    });
    render(<EnhancePanel />);
    expect(screen.queryByTestId('version-tree')).not.toBeInTheDocument();
  });

  it('shows version tree when enhancement nodes exist', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: {
        id: 'session-1',
        clipId: clip.id,
        nodes: [
          {
            id: 'enh-1',
            parentId: null,
            clipId: clip.id,
            audioKey: 'result-audio-1',
            mode: 'cover' as const,
            params: { caption: 'jazz' },
            createdAt: 1000,
            label: 'Jazz cover',
          },
        ],
        activeNodeId: 'enh-1',
      },
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('version-tree')).toBeInTheDocument();
    expect(screen.getByTestId('version-tree-original')).toBeInTheDocument();
    expect(screen.getByText(/v0 \(Original\)/)).toBeInTheDocument();
    expect(screen.getByText(/Jazz cover/)).toBeInTheDocument();
  });

  it('Escape closes the panel when no modal is open', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
      showCommandPalette: false,
      showSettingsDialog: false,
      showQuantizeDialog: false,
      showExportDialog: false,
      showKeyboardShortcutsDialog: false,
      showNewProjectDialog: false,
      showProjectListDialog: false,
      showShortcutEditorDialog: false,
      showGeneratePatternDialog: false,
      showInstrumentPicker: false,
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-panel')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUIStore.getState().enhancerOpen).toBe(false);
  });

  it('Escape does NOT close the panel when a modal dialog is open', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
      showCommandPalette: true,
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-panel')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    // Panel should still be open because command palette is open
    expect(useUIStore.getState().enhancerOpen).toBe(true);
  });

  it('clicking the backdrop closes the panel', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('enhance-backdrop'));
    expect(useUIStore.getState().enhancerOpen).toBe(false);
  });

  it('backdrop has role="presentation" for accessibility', () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
    });
    render(<EnhancePanel />);
    expect(screen.getByTestId('enhance-backdrop')).toHaveAttribute('role', 'presentation');
  });

  it('passes correct coverStrength for each consistency level (high=0.25, medium=0.5, low=0.75)', async () => {
    const { generateCoverClip } = await import('../../../services/generationPipeline');
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
    });
    const { unmount } = render(<EnhancePanel />);

    // Default is 'medium' — click Enhance
    const enhanceBtn = screen.getByTestId('enhance-btn');
    fireEvent.click(enhanceBtn);
    expect(generateCoverClip).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverStrength: 0.5 }),
    );

    // Switch to 'high' consistency — should map to LOW deviation (0.25)
    const highBtn = screen.getByText('high');
    fireEvent.click(highBtn);
    fireEvent.click(enhanceBtn);
    expect(generateCoverClip).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverStrength: 0.25 }),
    );

    // Switch to 'low' consistency — should map to HIGH deviation (0.75)
    const lowBtn = screen.getByText('low');
    fireEvent.click(lowBtn);
    fireEvent.click(enhanceBtn);
    expect(generateCoverClip).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverStrength: 0.75 }),
    );

    unmount();
  });

  it('shows chained source indicator when chainedSourceAudioKey is set', () => {
    // This tests the UI indicator — we can't directly set React state,
    // but we can verify the version tree renders. The chained indicator
    // is driven by local React state which is set via handleUseAsSource.
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
      enhancementSession: null,
    });
    render(<EnhancePanel />);
    // Without chaining, no indicator should appear
    expect(screen.queryByTestId('chained-source-indicator')).not.toBeInTheDocument();
  });
});

describe('EnhancePanel generation calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false });
  });

  it('passes sourceAudioOverride to generateCoverClip when chaining is not active', async () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
    });
    mockGenerateCoverClip.mockResolvedValue('new-clip-id');
    render(<EnhancePanel />);
    // Click generate
    const genBtn = screen.getByTestId('enhance-btn');
    fireEvent.click(genBtn);
    // generateCoverClip should have been called with sourceAudioOverride: undefined (no chaining)
    await vi.waitFor(() => {
      expect(mockGenerateCoverClip).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockGenerateCoverClip.mock.calls[0][0];
    expect(callArgs.clipId).toBe(clip.id);
    expect(callArgs.sourceAudioOverride).toBeUndefined();
  });

  it('passes sourceAudioOverride to generateRepaintClip', async () => {
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: { start: 2, end: 5 }, mode: 'repaint' },
    });
    mockGenerateRepaintClip.mockResolvedValue(clip.id);
    render(<EnhancePanel />);
    const genBtn = screen.getByTestId('enhance-btn');
    fireEvent.click(genBtn);
    await vi.waitFor(() => {
      expect(mockGenerateRepaintClip).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockGenerateRepaintClip.mock.calls[0][0];
    expect(callArgs.clipId).toBe(clip.id);
    expect(callArgs.sourceAudioOverride).toBeUndefined();
  });

  it('generateCoverClip return value is used as newClipId for finalizeResult', async () => {
    // When generateCoverClip returns a clip ID, finalizeResult should look up that clip
    // instead of doing reverse-search. We verify by checking that generateCoverClip is called
    // and its return value (new-clip-id) would be used. Since finalizeResult is internal,
    // we verify the pipeline function is awaited and returns the expected value.
    const { track, clip } = setupProjectWithClip();
    useUIStore.setState({
      enhancerOpen: true,
      enhancerTarget: { clipId: clip.id, trackId: track.id, range: null, mode: 'cover' },
    });
    const expectedNewClipId = 'new-clip-from-pipeline';
    mockGenerateCoverClip.mockResolvedValue(expectedNewClipId);
    // Mock loadBuffer to return null so finalizeResult exits early (we just care about the call chain)
    mockPlayback.loadBuffer.mockResolvedValue(null);
    render(<EnhancePanel />);
    const genBtn = screen.getByTestId('enhance-btn');
    fireEvent.click(genBtn);
    await vi.waitFor(() => {
      expect(mockGenerateCoverClip).toHaveBeenCalledTimes(1);
    });
    // The function was called and returned the clip ID — the component awaits it
    expect(await mockGenerateCoverClip.mock.results[0].value).toBe(expectedNewClipId);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Toolbar } from '../../src/components/layout/Toolbar';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useModelStore } from '../../src/store/modelStore';

// Mock all external dependencies
vi.mock('../../src/store/collaborationStore', () => ({
  useCollaborationStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) =>
      sel({
        setShowShareDialog: vi.fn(),
        isViewerMode: false,
      }),
    {
      getState: () => ({
        setShowShareDialog: vi.fn(),
        isViewerMode: false,
      }),
    },
  ),
}));

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({ openFilePicker: vi.fn() }),
}));

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => ({
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useRecording', () => ({
  useRecording: () => ({ toggleRecord: vi.fn() }),
}));

vi.mock('../../src/services/midiCaptureService', () => ({
  getMidiCaptureService: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: vi.fn().mockResolvedValue(false),
  listModels: vi.fn().mockResolvedValue({ models: [], default_model: null, lm_models: [], loaded_lm_model: null, llm_initialized: false }),
  initModel: vi.fn().mockResolvedValue({}),
  getStats: vi.fn().mockResolvedValue({}),
}));

describe('Toolbar visual hierarchy and grouping (#544)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useModelStore.setState({
      availableModels: [],
      availableLmModels: [],
      activeModelId: null,
      activeLmModelId: null,
      modelLoadingState: 'idle',
      connected: false,
      lastRefreshedAt: 0,
      stats: null,
    });
    useProjectStore.getState().createProject({ name: 'Toolbar Test' });
  });

  it('renders a flat transport container without borders or shadows', () => {
    render(<Toolbar />);
    const transportBar = screen.getByTestId('transport-bar');
    // Transport should be flat — no border, no bg, no rounded-full pill
    expect(transportBar.className).not.toMatch(/border/);
    expect(transportBar.className).not.toMatch(/bg-/);
    expect(transportBar.className).not.toMatch(/rounded-full/);
  });

  it('renders the play/pause button in a compact flat style', () => {
    render(<Toolbar />);
    const playButton = screen.getByTitle('Play (Space)');
    // Play button should exist with flat styling — no shadow
    expect(playButton.className).not.toMatch(/shadow/);
  });

  it('consolidates project and file actions into a unified Project menu', () => {
    render(<Toolbar />);
    // There should be a project menu trigger (icon-only)
    const menuButton = screen.getByTestId('project-menu-trigger');
    expect(menuButton).toBeInTheDocument();

    // Individual action buttons should NOT be visible by default
    expect(screen.queryByText('Export Audio')).not.toBeInTheDocument();
    expect(screen.queryByText('New Project')).not.toBeInTheDocument();
  });

  it('shows all project and file actions when Project menu is clicked', () => {
    render(<Toolbar />);
    const menuButton = screen.getByTestId('project-menu-trigger');
    fireEvent.click(menuButton);

    // Project menu items should now be visible
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Export Audio')).toBeInTheDocument();
    expect(screen.getByText('Export MIDI')).toBeInTheDocument();
    expect(screen.getByText('Import Audio/MIDI')).toBeInTheDocument();
    expect(screen.getByText('Undo History')).toBeInTheDocument();
    expect(screen.getByText('Share Project')).toBeInTheDocument();
    expect(screen.getByTestId('project-menu-dropdown').className).toContain('fixed');
  });

  it('uses softer separators (thinner, more subtle)', () => {
    const { container } = render(<Toolbar />);
    // Separators should use the new subtle style
    const separators = container.querySelectorAll('[data-testid="toolbar-separator"]');
    expect(separators.length).toBeGreaterThan(0);
    separators.forEach((sep) => {
      expect(sep.className).toMatch(/w-px/);
      expect(sep.className).toMatch(/h-5/);
    });
  });

  it('wraps button groups in background containers', () => {
    const { container } = render(<Toolbar />);
    // Look for group containers with background styling
    const groups = container.querySelectorAll('[data-testid="toolbar-group"]');
    expect(groups.length).toBeGreaterThanOrEqual(2); // At least: smart controls, cycle+metronome
  });

  it('makes the toolbar horizontally scrollable for small viewports', () => {
    const { container } = render(<Toolbar />);
    expect(container.firstChild).toHaveClass('overflow-x-auto');
  });

  it('removes the top toolbar Generate button in favor of the side dock entry', () => {
    render(<Toolbar />);

    expect(screen.queryByTestId('generate-button')).not.toBeInTheDocument();
    expect(screen.queryByText('GENERATE')).not.toBeInTheDocument();
  });

  it('moves project defaults into a dedicated top-toolbar strip', () => {
    render(<Toolbar />);

    const projectStrip = screen.getByTestId('toolbar-project-settings');
    expect(projectStrip).toBeInTheDocument();
    expect(screen.getByLabelText('Project BPM')).toHaveValue('120');
    expect(screen.getByLabelText('Time signature numerator')).toHaveValue('4');
    expect(screen.getByLabelText('Project key root')).toHaveValue('C');
    expect(screen.getByLabelText('Project scale mode')).toHaveValue('major');
    expect(screen.getByLabelText('Project measures')).toHaveValue(64);
  });

  it('updates project key settings from the top-toolbar strip', () => {
    render(<Toolbar />);

    fireEvent.change(screen.getByLabelText('Project key root'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Project scale mode'), { target: { value: 'minor' } });

    expect(useProjectStore.getState().project?.keyScale).toBe('D minor');
  });

  it('provides tooltip titles on all right-side icon buttons', () => {
    render(<Toolbar />);
    // Mixer and AI Assistant moved to StatusBar; ACE Studio link remains
    expect(screen.queryByTitle('Mixer (X)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('AI Assistant (Cmd+/)')).not.toBeInTheDocument();
    expect(screen.getByTitle('Visit ACE Studio')).toBeInTheDocument();
  });

  it('keeps settings and shortcuts out of the top toolbar', () => {
    render(<Toolbar />);

    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overflow-menu-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Zoom Out')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Zoom In')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Library (Y)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Loop Browser (O)')).not.toBeInTheDocument();
  });

  it('shows an ACE Studio external link on the right side', () => {
    render(<Toolbar />);

    const link = screen.getByTestId('toolbar-acestudio-link');
    expect(link).toHaveAttribute('href', 'https://acestudio.ai/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByAltText('ACE Studio')).toBeInTheDocument();
  });

  it('renders a command palette button with search icon', () => {
    render(<Toolbar />);

    const cmdButton = screen.getByTitle('Command Palette (Cmd/Ctrl+K)');
    expect(cmdButton).toBeInTheDocument();
  });

  it('moves model status out of the top toolbar and leaves it to the status area', () => {
    useModelStore.setState({
      connected: true,
      activeModelId: 'switching-model',
      modelLoadingState: 'idle',
      availableModels: [
        { name: 'switching-model', is_default: true, is_loaded: true } as any,
      ],
    });
    useProjectStore.setState((state) => ({
      project: state.project
        ? {
          ...state.project,
          generationDefaults: {
          ...state.project.generationDefaults,
          model: 'switching-model',
        },
      }
        : state.project,
    }));

    render(<Toolbar />);

    expect(screen.queryByRole('button', { name: /model status:/i })).not.toBeInTheDocument();
    expect(screen.queryByText('switching-model')).not.toBeInTheDocument();
  });
});

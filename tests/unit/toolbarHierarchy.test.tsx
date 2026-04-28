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
    const playButton = screen.getByLabelText('Play');
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

  it('removes vertical separators and relies on spacing instead', () => {
    const { container } = render(<Toolbar />);
    const separators = container.querySelectorAll('[data-testid="toolbar-separator"]');
    expect(separators.length).toBe(0);
    expect(screen.getByTestId('main-toolbar').className).toContain('gap-1.5');
    expect(screen.getByTestId('transport-bar').className).toContain('gap-1');
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

  it('uses the refreshed toolbar surface and denser control sizing', () => {
    render(<Toolbar />);

    const toolbar = screen.getByTestId('main-toolbar');
    const arrangementButton = screen.getByLabelText('Arrangement View');
    const playButton = screen.getByLabelText('Play');
    const tempoReadout = screen.getByTitle('Project tempo (beats per minute)');
    const timeSignatureReadout = screen.getByTitle('Project time signature');
    const transportPosition = screen.getByTitle('Transport position (bars.beats.ticks)');
    const transportTime = screen.getByTitle('Transport elapsed time');

    expect(toolbar.className).toContain('bg-[#1f2226]');
    expect(toolbar.className).toContain('h-12');
    expect(arrangementButton.className).toContain('h-10');
    expect(arrangementButton.className).toContain('w-10');
    expect(arrangementButton.className).toContain('text-white/90');
    expect(playButton.className).toContain('h-10');
    expect(playButton.className).toContain('w-11');
    expect(playButton.className).not.toContain('bg-white/8');
    expect(tempoReadout.className).not.toContain('border');
    expect(tempoReadout.className).not.toContain('rounded');
    expect(timeSignatureReadout.className).toContain('gap-[0.18rem]');
    expect(transportPosition.className).toContain('text-[22px]');
    expect(transportTime.className).toContain('text-[15px]');
  });

  it('removes the top toolbar Generate button in favor of the side dock entry', () => {
    render(<Toolbar />);

    expect(screen.queryByTestId('generate-button')).not.toBeInTheDocument();
    expect(screen.queryByText('GENERATE')).not.toBeInTheDocument();
  });

  it('moves project defaults into a dedicated top-toolbar strip', () => {
    render(<Toolbar />);

    const timingStrip = screen.getByTestId('toolbar-project-timing');
    const harmonyStrip = screen.getByTestId('toolbar-project-harmony');
    const transportBar = screen.getByTestId('transport-bar');
    expect(timingStrip).toBeInTheDocument();
    expect(harmonyStrip).toBeInTheDocument();
    expect(timingStrip.compareDocumentPosition(transportBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
    expect(transportBar.compareDocumentPosition(harmonyStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
    expect(screen.getByLabelText('Project BPM')).toHaveValue('120');
    expect(screen.getByLabelText('Time signature numerator')).toHaveValue('4');
    expect(screen.getByLabelText('Project key root')).toHaveValue('C');
    expect(screen.getByLabelText('Project scale mode')).toHaveValue('major');
    expect(screen.queryByLabelText('Project measures')).not.toBeInTheDocument();
  });

  it('keeps timeline zoom stable when BPM changes from the toolbar', () => {
    useUIStore.setState({ pixelsPerSecond: 100 });
    useTransportStore.setState({ currentTime: 12.5, playStartTime: 12.5 });
    render(<Toolbar />);

    const bpmInput = screen.getByLabelText('Project BPM');
    fireEvent.change(bpmInput, { target: { value: '60' } });
    fireEvent.blur(bpmInput);

    expect(useProjectStore.getState().project?.bpm).toBe(60);
    expect(useUIStore.getState().pixelsPerSecond).toBe(100);
    expect(useTransportStore.getState().currentTime).toBe(12.5);
    expect(useTransportStore.getState().playStartTime).toBe(12.5);
  });

  it('keeps timeline zoom requests and playhead state unchanged when time signature changes', () => {
    useUIStore.setState({ pixelsPerSecond: 120, timelineZoomRequest: null });
    useTransportStore.setState({ currentTime: 9.75, playStartTime: 9.75 });
    render(<Toolbar />);

    fireEvent.change(screen.getByLabelText('Time signature numerator'), { target: { value: '3' } });
    fireEvent.blur(screen.getByLabelText('Time signature numerator'));
    fireEvent.change(screen.getByLabelText('Time signature denominator'), { target: { value: '8' } });
    fireEvent.blur(screen.getByLabelText('Time signature denominator'));

    expect(useProjectStore.getState().project?.timeSignature).toBe(3);
    expect(useProjectStore.getState().project?.timeSignatureDenominator).toBe(8);
    expect(useUIStore.getState().pixelsPerSecond).toBe(120);
    expect(useUIStore.getState().timelineZoomRequest).toBeNull();
    expect(useTransportStore.getState().currentTime).toBe(9.75);
    expect(useTransportStore.getState().playStartTime).toBe(9.75);
  });

  it('keeps only loop and auto-scroll controls to the right of metronome', () => {
    render(<Toolbar />);

    expect(screen.getByLabelText('Loop')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto Scroll')).toBeInTheDocument();
    expect(screen.queryByTitle('Overdub / Loop Recording (Shift+L)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Capture MIDI (F)')).not.toBeInTheDocument();
  });

  it('does not add a hover highlight to the auto-scroll button', () => {
    render(<Toolbar />);

    expect(screen.getByLabelText('Auto Scroll').className).not.toContain('hover:bg-white/8');
  });

  it('does not add a hover highlight to the loop button', () => {
    render(<Toolbar />);

    expect(screen.getByLabelText('Loop').className).not.toContain('hover:bg-white/8');
  });

  it('renders metronome pulse dots based on the time signature numerator', () => {
    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 6, timeSignatureDenominator: 8 }
        : state.project,
    }));
    render(<Toolbar />);

    expect(screen.getAllByTestId('metronome-pulse-dot')).toHaveLength(6);
  });

  it('clamps metronome pulse dots to the supported 2-6 range using the numerator', () => {
    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 1, timeSignatureDenominator: 8 }
        : state.project,
    }));
    const { rerender } = render(<Toolbar />);
    expect(screen.getAllByTestId('metronome-pulse-dot')).toHaveLength(2);

    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 3, timeSignatureDenominator: 8 }
        : state.project,
    }));
    rerender(<Toolbar />);
    expect(screen.getAllByTestId('metronome-pulse-dot')).toHaveLength(3);

    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 8, timeSignatureDenominator: 4 }
        : state.project,
    }));
    rerender(<Toolbar />);
    expect(screen.getAllByTestId('metronome-pulse-dot')).toHaveLength(6);
  });

  it('lays out four metronome dots in clockwise order', () => {
    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 4, timeSignatureDenominator: 8 }
        : state.project,
    }));
    render(<Toolbar />);

    const dots = screen.getAllByTestId('metronome-pulse-dot');
    expect(dots[0]).toHaveStyle({ left: '24%', top: '24%' });
    expect(dots[1]).toHaveStyle({ left: '76%', top: '24%' });
    expect(dots[2]).toHaveStyle({ left: '76%', top: '76%' });
    expect(dots[3]).toHaveStyle({ left: '24%', top: '76%' });
  });

  it('emphasizes the current metronome pulse more than passed pulses', () => {
    useProjectStore.setState((state) => ({
      project: state.project
        ? { ...state.project, timeSignature: 4, timeSignatureDenominator: 4 }
        : state.project,
    }));
    useTransportStore.setState({ isPlaying: true, currentTime: 0.75 });
    render(<Toolbar />);

    const dots = screen.getAllByTestId('metronome-pulse-dot');
    expect(dots[0]).toHaveAttribute('data-state', 'passed');
    expect(dots[1]).toHaveAttribute('data-state', 'current');
    expect(dots[2]).toHaveAttribute('data-state', 'upcoming');
    expect(dots[1].className).toContain('shadow-');
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

  it('provides tooltip titles for toolbar readouts and project settings', () => {
    render(<Toolbar />);

    expect(screen.getByTitle('Project tempo (beats per minute)')).toBeInTheDocument();
    expect(screen.getByTitle('Project time signature')).toBeInTheDocument();
    expect(screen.getByTitle('Project key root note')).toBeInTheDocument();
    expect(screen.getByTitle('Project scale mode selector')).toBeInTheDocument();
    expect(screen.getByTitle('Transport position (bars.beats.ticks)')).toBeInTheDocument();
    expect(screen.getByTitle('Transport elapsed time')).toBeInTheDocument();
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

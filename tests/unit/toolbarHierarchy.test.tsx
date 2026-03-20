import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Toolbar } from '../../src/components/layout/Toolbar';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

// Mock all external dependencies
vi.mock('../../src/store/collaborationStore', () => ({
  useCollaborationStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setShowShareDialog: vi.fn(),
      isViewerMode: false,
    }),
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

describe('Toolbar visual hierarchy and grouping (#544)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Toolbar Test' });
  });

  it('renders a transport pill container with distinct background', () => {
    const { container } = render(<Toolbar />);
    const transportBar = screen.getByTestId('transport-bar');
    // Transport should have a pill-style container with a distinct background
    expect(transportBar.className).toMatch(/bg-/);
    expect(transportBar.className).toMatch(/rounded/);
  });

  it('renders the play/pause button larger than other transport buttons', () => {
    render(<Toolbar />);
    const playButton = screen.getByTitle('Play (Space)');
    // Play button should be bigger - w-10 h-9 vs w-8 h-7 for others
    expect(playButton.className).toMatch(/w-10/);
    expect(playButton.className).toMatch(/h-9/);
  });

  it('consolidates file actions into a File dropdown menu', () => {
    render(<Toolbar />);
    // There should be a "File" dropdown button instead of individual Export/MIDI/Import/History/Share buttons
    const fileButton = screen.getByTestId('file-menu-trigger');
    expect(fileButton).toBeInTheDocument();
    expect(fileButton).toHaveTextContent('File');

    // Individual file action buttons should NOT be visible by default
    expect(screen.queryByText('Export')).not.toBeInTheDocument();
    expect(screen.queryByText('MIDI')).not.toBeInTheDocument();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
    expect(screen.queryByText('History')).not.toBeInTheDocument();
    expect(screen.queryByText('Share')).not.toBeInTheDocument();
  });

  it('shows file actions when File dropdown is clicked', () => {
    render(<Toolbar />);
    const fileButton = screen.getByTestId('file-menu-trigger');
    fireEvent.click(fileButton);

    // File menu items should now be visible
    expect(screen.getByText('Export Audio')).toBeInTheDocument();
    expect(screen.getByText('Export MIDI')).toBeInTheDocument();
    expect(screen.getByText('Import Audio/MIDI')).toBeInTheDocument();
    expect(screen.getByText('Undo History')).toBeInTheDocument();
    expect(screen.getByText('Share Project')).toBeInTheDocument();
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
    expect(groups.length).toBeGreaterThanOrEqual(3); // At least: panel toggles, gen, transport-area, right panels
  });

  it('provides tooltip titles on all right-side icon buttons', () => {
    render(<Toolbar />);
    // Mixer, Loop Browser, AI Assistant, Settings, Shortcuts should all have titles
    expect(screen.getByTitle('Mixer (X)')).toBeInTheDocument();
    expect(screen.getByTitle('Loop Browser (O)')).toBeInTheDocument();
    expect(screen.getByTitle('AI Assistant (Cmd+/)')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
    expect(screen.getByTitle('Keyboard Shortcuts (?)')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
  });
});

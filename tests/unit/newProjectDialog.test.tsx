import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NewProjectDialog } from '../../src/components/dialogs/NewProjectDialog';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import type { ProjectSummary } from '../../src/services/projectStorage';

const mockListProjects = vi.fn<() => Promise<ProjectSummary[]>>();
const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();

vi.mock('../../src/services/projectStorage', () => ({
  listProjects: (...args: unknown[]) => mockListProjects(...(args as [])),
  loadProject: (...args: unknown[]) => mockLoadProject(...(args as [])),
  saveProject: (...args: unknown[]) => mockSaveProject(...(args as [])),
}));

vi.mock('../../src/services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  initModel: vi.fn().mockResolvedValue({}),
  getBackendUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  setBackendUrl: vi.fn(),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

const recentProjects: ProjectSummary[] = [
  { id: 'p1', name: 'My Song', createdAt: 1710000000000, updatedAt: 1710100000000, trackCount: 3 },
  { id: 'p2', name: 'Demo Beat', createdAt: 1709000000000, updatedAt: 1709900000000, trackCount: 5 },
  { id: 'p3', name: 'Chill Vibes', createdAt: 1708000000000, updatedAt: 1708800000000, trackCount: 2 },
];

function openDialog() {
  useUIStore.getState().setShowNewProjectDialog(true);
}

describe('NewProjectDialog — recent projects (#212)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState?.() ?? {}, true);
    useProjectStore.setState(useProjectStore.getInitialState?.() ?? {}, true);
    mockListProjects.mockReset();
    mockLoadProject.mockReset();
    mockSaveProject.mockReset();
  });

  it('shows "Recent Projects" heading when saved projects exist', async () => {
    mockListProjects.mockResolvedValue(recentProjects);
    openDialog();
    render(<NewProjectDialog />);

    await waitFor(() => {
      expect(screen.getByText('Recent Projects')).toBeInTheDocument();
    });
  });

  it('renders project names and track counts from listProjects', async () => {
    mockListProjects.mockResolvedValue(recentProjects);
    openDialog();
    render(<NewProjectDialog />);

    await waitFor(() => {
      expect(screen.getByText('My Song')).toBeInTheDocument();
      expect(screen.getByText('Demo Beat')).toBeInTheDocument();
      expect(screen.getByText('Chill Vibes')).toBeInTheDocument();
    });

    // Track counts should appear somewhere
    expect(screen.getByText(/3 track/)).toBeInTheDocument();
    expect(screen.getByText(/5 track/)).toBeInTheDocument();
    expect(screen.getByText(/2 track/)).toBeInTheDocument();
  });

  it('clicking a recent project loads it and closes the dialog', async () => {
    const fakeProject = {
      id: 'p1',
      name: 'My Song',
      createdAt: 1710000000000,
      updatedAt: 1710100000000,
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      totalDuration: 60,
      tracks: [
        { id: 't1', trackName: 'drums', displayName: 'Drums', color: '#ef4444', order: 0, volume: 0.8, muted: false, soloed: false, clips: [] },
        { id: 't2', trackName: 'bass', displayName: 'Bass', color: '#3b82f6', order: 1, volume: 0.8, muted: false, soloed: false, clips: [] },
        { id: 't3', trackName: 'keyboard', displayName: 'Keys', color: '#22c55e', order: 2, volume: 0.8, muted: false, soloed: false, clips: [] },
      ],
      generationDefaults: { inferenceSteps: 20, guidanceScale: 7.5, shift: 0, thinking: false, model: 'test' },
    };
    mockListProjects.mockResolvedValue(recentProjects);
    mockLoadProject.mockResolvedValue(fakeProject);
    openDialog();
    render(<NewProjectDialog />);

    await waitFor(() => {
      expect(screen.getByText('My Song')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('My Song'));

    await waitFor(() => {
      expect(mockLoadProject).toHaveBeenCalledWith('p1');
      // Dialog should close
      expect(useUIStore.getState().showNewProjectDialog).toBe(false);
    });
  });

  it('does not show recent projects section when no projects are saved', async () => {
    mockListProjects.mockResolvedValue([]);
    openDialog();
    render(<NewProjectDialog />);

    // Wait for async load to finish
    await waitFor(() => {
      expect(mockListProjects).toHaveBeenCalled();
    });

    expect(screen.queryByText('Recent Projects')).not.toBeInTheDocument();
  });

  it('still shows the "New Project" creation form', async () => {
    mockListProjects.mockResolvedValue(recentProjects);
    openDialog();
    render(<NewProjectDialog />);

    // The new project form elements should still be present
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('recent project cards have data-project-id attributes for E2E', async () => {
    mockListProjects.mockResolvedValue(recentProjects);
    openDialog();
    const { container } = render(<NewProjectDialog />);

    await waitFor(() => {
      expect(screen.getByText('My Song')).toBeInTheDocument();
    });

    const cards = container.querySelectorAll('[data-project-id]');
    expect(cards.length).toBe(3);
    expect(cards[0].getAttribute('data-project-id')).toBe('p1');
  });

  it('shows thumbnail placeholder with track count visual', async () => {
    mockListProjects.mockResolvedValue(recentProjects);
    openDialog();
    const { container } = render(<NewProjectDialog />);

    await waitFor(() => {
      expect(screen.getByText('My Song')).toBeInTheDocument();
    });

    // Each card should have a thumbnail area
    const thumbnails = container.querySelectorAll('[data-testid="project-thumbnail"]');
    expect(thumbnails.length).toBe(3);
  });
});
